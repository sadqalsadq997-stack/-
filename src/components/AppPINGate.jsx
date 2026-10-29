import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getDeviceId } from '@/integrations/supabase/client';
import { Delete } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import AccountNumber, { useMyAccount } from '@/components/AccountNumber';
import Onboarding from '@/components/Onboarding';
import { useNavigate } from 'react-router-dom';
import { saveSession, loadSession, clearSession } from '@/lib/security/session';
import { setupIdleLock } from '@/lib/security/privacy';

import { hashPin } from '@/lib/security/pin';

export default function AppPINGate({ children }) {
  const [phase, setPhase]           = useState('loading'); // loading | onboarding | setup | pin | unlocked | blocked
  const [pin, setPin]               = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [settings, setSettings]     = useState(null);
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

  // ── تحميل حالة الإعداد من السيرفر (بدون تنزيل أي رموز PIN للمتصفح) ──
  async function init() {
    try {
      const { data, error: e } = await supabase.rpc('app_pin_status');
      if (e) throw e;
      const st = Array.isArray(data) ? data[0] : data;
      setSettings(st || null);
      if (!st?.has_settings) { setPhase('onboarding'); return; }
      if (!st.onboarded)     { setPhase('onboarding'); return; }
      if (!st.has_admin_pin) { setPhase('setup'); return; }
      setPhase('pin');
    } catch (err) {
      // لا يوجد أي رمز افتراضي — أي خطأ = الدخول مقفل
      console.error('[Felsy] تعذر تحميل حالة PIN:', err?.message || err);
      setError('تعذر الاتصال بالخادم — تأكد من الإنترنت ثم أعد المحاولة');
      setPhase('blocked');
    }
  }

  // حماية Brute Force: السيرفر يقفل الجهاز بعد 10 محاولات خاطئة (30 دقيقة)
  const checkLock = () => {
    if (lockedUntil && new Date() < lockedUntil) {
      const mins = Math.ceil((lockedUntil - new Date()) / 60000);
      setError(`الجهاز موقوف مؤقتاً — حاول بعد ${mins} دقيقة`);
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
    let result = null;
    try {
      const hashed = await hashPin(entered);
      // التحقق يتم في السيرفر — المتصفح لا يرى رموز PIN المخزنة إطلاقاً
      const { data, error: e } = await supabase.rpc('verify_app_pin_v2', { p_hash: hashed, p_device: getDeviceId() });
      if (e) throw e;
      result = Array.isArray(data) ? data[0] : data;
    } catch (err) {
      setError(err?.message?.includes('too_many_attempts')
        ? 'محاولات كثيرة — انتظر 5 دقائق'
        : 'تعذر التحقق — حاول مرة أخرى');
      triggerShake(); setPin(''); setLoading(false);
      return;
    }

    if (result?.ok) {
      const emp = result.role === 'admin' ? null : {
        id: result.emp_id, name: result.emp_name, role: result.role,
        permissions: result.permissions || {}, branch_id: result.branch_id,
      };
      await saveSession(result.role || 'employee', emp || undefined);
      setupIdleLock(() => { clearSession(); setPhase('pin'); setCurrentEmp(null); });
      setCurrentEmp(emp);
      setAttempts(0);
      setPhase('unlocked');
      setLoading(false);
      return;
    }

    // فشل — العدّاد الحقيقي في السيرفر (لكل جهاز)
    setAttempts(a => a + 1);
    if (result?.retry_after > 0) {
      const until = new Date(Date.now() + result.retry_after * 1000);
      setLockedUntil(until);
      setError(`تم إيقاف الدخول من هذا الجهاز بعد 10 محاولات خاطئة — حاول بعد ${Math.ceil(result.retry_after / 60)} دقيقة`);
    } else {
      const left = Number.isFinite(result?.remaining) ? result.remaining : null;
      setError(left !== null ? `رمز PIN غير صحيح • باقي ${left} محاولة من هذا الجهاز` : 'رمز PIN غير صحيح');
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
    try {
      const hashed = await hashPin(pin);
      // السيرفر يسمح بتعيين PIN المدير فقط إذا لم يكن مضبوطاً مسبقاً،
      // وفقط لمالك/مدير المنشأة المسجّل دخوله
      const { error: e } = await supabase.rpc('set_initial_admin_pin', { p_hash: hashed });
      if (e) throw e;
      await saveSession('admin');
      setupIdleLock(() => { clearSession(); setPhase('pin'); setCurrentEmp(null); });
      setPhase('unlocked');
    } catch (err) {
      setError('حدث خطأ أثناء الحفظ: ' + (err?.message || ''));
    }
    setPin(''); setConfirmPin('');
    setLoading(false);
  };

  const signOut = async () => {
    clearSession();
    try { await supabase.auth.signOut(); } catch { /* تجاهل */ }
    window.location.replace('/auth/login');
  };

  // ── عرض المحتوى إذا الجلسة مفتوحة ─────────────────────────
  if (phase === 'unlocked') {
    return React.cloneElement(children, { currentEmp });
  }

  // ── شاشة الإعداد الأولي ─────────────────────────────────────
  if (phase === 'onboarding') {
    return <Onboarding onDone={() => { init(); }} />;
  }

  // ── شاشة إنشاء PIN ─────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center"><LogoMark size={64} /></div>
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

  // ── تعذر الاتصال: لا دخول ───────────────────────────────────
  if (phase === 'blocked') {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-xl p-8 space-y-4 text-center">
          <h1 className="text-lg font-bold">تعذر فتح النظام</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={() => { setError(''); setPhase('loading'); init(); }}
            className="w-full bg-primary text-primary-foreground rounded-lg py-3 font-medium">إعادة المحاولة</button>
          <button onClick={signOut} className="w-full text-sm text-muted-foreground hover:underline">تسجيل الخروج</button>
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
          <div className="flex justify-center"><LogoMark size={64} /></div>
          {/* الدخول على خطوتين: ١) المنشأة (البريد وكلمة المرور) ✓  ٢) رمز الموظف */}
          <ol className="flex items-center justify-center gap-2 text-[11px] font-bold" aria-label="خطوات الدخول">
            <li className="flex items-center gap-1 text-primary"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">✓</span>دخول المنشأة</li>
            <li aria-hidden className="h-px w-5 bg-border" />
            <li className="flex items-center gap-1 text-foreground"><span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary">2</span>رمز الموظف</li>
          </ol>
          <AccountHeader />
          <p className="text-muted-foreground text-sm">كل موظف يدخل برمزه — والصلاحيات حسب دوره</p>
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
            if (k === '') return <div key={`slot-${i}`} />;
            if (k === '⌫') return (
              <button key="del" onClick={handleDelete}
                className="h-14 rounded-xl bg-muted/60 flex items-center justify-center text-xl hover:bg-muted active:scale-95 transition-all">
                <Delete className="w-5 h-5" />
              </button>
            );
            return (
              <button key={`d-${k}`} onClick={() => handleKey(k)}
                className="h-14 rounded-xl bg-muted/60 text-xl font-medium hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all">
                {k}
              </button>
            );
          })}
        </div>
        <button onClick={signOut} className="w-full text-xs text-muted-foreground hover:underline">تسجيل الخروج من الحساب</button>
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

function AccountHeader() {
  const { data: acc } = useMyAccount();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <h1 className="text-xl font-bold">{acc?.name || 'فلسي POS'}</h1>
      <AccountNumber className="flex justify-center" />
    </div>
  );
}
