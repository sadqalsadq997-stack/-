import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';
import { Delete, Building2 } from 'lucide-react';
import Onboarding from '@/components/Onboarding';
import { canAccess, defaultPage, ROLE_LABELS } from '@/lib/permissions';
import { useNavigate } from 'react-router-dom';
import { saveSession, loadSession, clearSession } from '@/lib/security/session';
import { setupIdleLock } from '@/lib/security/privacy';

// PBKDF2 — أقوى من SHA-256 العادي ضد brute-force
async function hashPin(pin) {
  const enc = new TextEncoder();
  // salt ثابت مشترك للـ PIN (يُمكن جعله per-user لاحقاً)
  const salt = enc.encode('felsy-pin-salt-v2');
  const km = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    km, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export default function AppPINGate({ children }) {
  const [phase, setPhase]           = useState('loading'); // loading | onboarding | setup | pin | unlocked | blocked
  const [pin, setPin]               = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [settings, setSettings]     = useState(null);
  const [profiles, setProfiles]     = useState([]);
  const [currentEmp, setCurrentEmp] = useState(null);
  const [attempts, setAttempts]     = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const shakeRef = useRef(null);
  const navigate = useNavigate();

  // ── تحميل الجلسة المشفّرة عند بدء التطبيق ──────────────────
  useEffect(() => {
    (async () => {
      const sess = await loadSession();
      if (sess && sess.unlocked) {
        setPhase('unlocked');
        if (sess.empId) {
          setCurrentEmp({ id: sess.empId, name: sess.empName, role: sess.role, permissions: sess.perms });
        }
        // ── تفعيل الإغلاق التلقائي بعد 30 دقيقة خمول ────────
        setupIdleLock(() => {
          clearSession();
          setPhase('pin');
          setCurrentEmp(null);
        });
        return;
      }
      init();
    })();
  }, []);

  async function init() {
    // بدون Supabase — استخدم PIN افتراضي 1234
    if (isMissingEnv) {
      const demoPin = await hashPin('1234');
      setSettings({ admin_pin: demoPin, onboarded: true });
      setProfiles([]);
      setPhase('pin');
      return;
    }
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1);

      // خطأ واضح من Supabase
      if (settingsError) {
        console.error('[Felsy] خطأ في تحميل الإعدادات:', settingsError.message);
        if (settingsError.code === '42P01' || settingsError.message?.includes('does not exist')) {
          setError('⚠️ جداول قاعدة البيانات غير موجودة — شغّل ملفات supabase/migrations بالترتيب من SQL Editor');
          setPhase('pin');
          return;
        }
        throw settingsError;
      }

      const row = settingsData?.[0] ?? null;
      setSettings(row);

      if (!row) { setPhase('setup'); return; }
      if (!row.onboarded) { setPhase('onboarding'); return; }
      if (!row.admin_pin) { setPhase('setup'); return; }

      const { data: emps, error: empsError } = await supabase
        .from('employee_profiles')
        .select('id,name,pin,role,permissions,branch_id,is_active')
        .eq('is_active', true);

      if (empsError) console.warn('[Felsy] خطأ في تحميل الموظفين:', empsError.message);
      setProfiles(emps ?? []);
    } catch (err) {
      console.error('[Felsy] خطأ عام في init:', err);
      const demoPin = await hashPin('1234');
      setSettings({ admin_pin: demoPin, onboarded: true });
      setProfiles([]);
    }
    setPhase('pin');
  }

  // حماية Brute Force: قفل بعد 5 محاولات فاشلة لمدة 2 دقيقة
  const checkLock = () => {
    if (lockedUntil && new Date() < lockedUntil) {
      const secs = Math.ceil((lockedUntil - new Date()) / 1000);
      setError(`محاولات كثيرة — انتظر ${secs} ثانية`);
      return true;
    }
    return false;
  };

  const triggerShake = () => {
    if (!shakeRef.current) return;
    shakeRef.current.classList.remove('shake');
    void shakeRef.current.offsetWidth;
    shakeRef.current.classList.add('shake');
  };

  const handleKey = useCallback((digit) => {
    if (pin.length >= 4 || loading || checkLock()) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 4) verify(next);
  }, [pin, loading, lockedUntil, attempts]);

  const handleDelete = () => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const verify = async (entered) => {
    if (checkLock()) { setPin(''); return; }
    setLoading(true);
    const hashed = await hashPin(entered);

    // تحقق admin pin
    if (hashed === settings?.admin_pin) {
      await saveSession('admin');
      setupIdleLock(() => { clearSession(); setPhase('pin'); setCurrentEmp(null); });
      setPhase('unlocked');
      setLoading(false);
      return;
    }

    // تحقق موظف
    const match = profiles.find(p => p.pin === hashed);
    if (match) {
      await saveSession(match.role || 'employee', match);
      setupIdleLock(() => { clearSession(); setPhase('pin'); setCurrentEmp(null); });
      setCurrentEmp(match);
      setPhase('unlocked');
      setAttempts(0);
      setLoading(false);
      return;
    }

    // فشل
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    if (newAttempts >= 5) {
      const until = new Date(Date.now() + 2 * 60 * 1000);
      setLockedUntil(until);
      setAttempts(0);
      setError('تم قفل الجهاز لمدة دقيقتين بسبب محاولات متكررة');
    } else {
      setError(`رمز PIN غير صحيح • ${5 - newAttempts} محاولات متبقية`);
    }
    triggerShake();
    setPin('');
    setLoading(false);
  };

  const saveAdminPin = async (e) => {
    if (e) e.preventDefault();
    if (pin.length !== 4) { setError('يجب أن يكون PIN 4 أرقام'); return; }
    if (pin !== confirmPin) { setError('رموز PIN غير متطابقة'); return; }
    setLoading(true);
    const hashed = await hashPin(pin);
    try {
      if (isMissingEnv) {
        setSettings(s => ({ ...s, admin_pin: hashed }));
        await saveSession('admin');
        setPhase('unlocked');
      } else {
        const { error: e } = await supabase
          .from('app_settings')
          .update({ admin_pin: hashed })
          .eq('id', settings.id);
        if (e) throw e;
        await saveSession('admin');
        setPhase('unlocked');
      }
    } catch (err) {
      setError('حدث خطأ أثناء الحفظ: ' + err.message);
    }
    setLoading(false);
  };

  // ── عرض المحتوى إذا الجلسة مفتوحة ─────────────────────────
  if (phase === 'unlocked') {
    return React.cloneElement(children, { currentEmp });
  }

  // ── شاشة الإعداد الأولي ─────────────────────────────────────
  if (phase === 'onboarding') {
    return <Onboarding onComplete={() => { init(); }} />;
  }

  // ── شاشة إنشاء PIN ─────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">إنشاء رمز PIN الإداري</h1>
            <p className="text-muted-foreground text-sm">أدخل رمز PIN من 4 أرقام لحماية التطبيق</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">رمز PIN الجديد</label>
              <input type="password" inputMode="numeric" maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                className="w-full text-center text-2xl tracking-widest border rounded-lg p-3 bg-background"
                placeholder="••••" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">تأكيد رمز PIN</label>
              <input type="password" inputMode="numeric" maxLength={4} value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                className="w-full text-center text-2xl tracking-widest border rounded-lg p-3 bg-background"
                placeholder="••••" />
            </div>
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <button onClick={saveAdminPin} disabled={loading || pin.length < 4 || confirmPin.length < 4}
              className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-medium disabled:opacity-50">
              {loading ? 'جاري الحفظ...' : 'حفظ رمز PIN'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── شاشة Loading ────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ── شاشة إدخال PIN ─────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4" dir="rtl">
      <div ref={shakeRef} className="w-full max-w-xs bg-card rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">فلسي POS</h1>
          <p className="text-muted-foreground text-sm">أدخل رمز PIN للدخول</p>
        </div>

        {/* عرض الـ dots */}
        <div className="flex justify-center gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`} />
          ))}
        </div>

        {error && <p className="text-destructive text-sm text-center">{error}</p>}

        {/* لوحة الأرقام */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
            if (k === '') return <div key={i} />;
            if (k === '⌫') return (
              <button key={i} onClick={handleDelete}
                className="h-14 rounded-xl bg-muted/60 flex items-center justify-center text-xl hover:bg-muted active:scale-95 transition-all">
                <Delete className="w-5 h-5" />
              </button>
            );
            return (
              <button key={k} onClick={() => handleKey(k)}
                className="h-14 rounded-xl bg-muted/60 text-xl font-medium hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all">
                {k}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
        .shake { animation: shake 0.4s ease; }
      `}</style>
    </div>
  );
}
