import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle2, CreditCard, AlertTriangle, Loader2, ShieldCheck, Star, Lock, Building2, LogOut, Tag,
} from 'lucide-react';
import { PLANS } from '@/lib/pricingPlans';
import { clearSession } from '@/lib/security/session';
import Logo from '@/components/brand/Logo';

// ══════════════════════════════════════════════════════════════════
// بوابة الدفع الوحيدة — Moyasar
// ──────────────────────────────────────────────────────────────────
//  • حالة الاشتراك تُقرأ من السيرفر عبر my_billing_status() (لا يمكن
//    للمتصفح كتابة أو تعديل أي اشتراك — RLS يمنع ذلك).
//  • بيانات البطاقة تذهب من المتصفح مباشرة إلى api.moyasar.com
//    بالمفتاح العام، ويرجع token فقط.
//  • السعر يُحسب ويُطابَق في Edge Function "billing-subscribe".
//  • بطاقات مدى/3DS: يتحول العميل لصفحة البنك ثم يرجع لـ
//    /dashboard?billing=return&id=... فنؤكد الدفعة من موياسر مباشرة.
// ══════════════════════════════════════════════════════════════════

const PUBLISHABLE_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY || '';
const ACTIVE = ['active', 'trialing'];

// أكواد قاعدة البيانات ↔ أكواد الواجهة
const CODE_ALIASES = { starter: 'basic', basic: 'basic', pro: 'pro', enterprise: 'enterprise' };

function isActive(st) {
  return st && ACTIVE.includes(st.sub_status) && st.period_end && new Date(st.period_end) > new Date();
}

function formatCardNumber(v) {
  return v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

async function signOut() {
  clearSession();
  try { await supabase.auth.signOut(); } catch { /* تجاهل */ }
  window.location.replace('/auth/login');
}

function Shell({ children }) {
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-sage-900 text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-[28rem] w-[28rem] rounded-full bg-sage-500/25 blur-3xl" />
        <div className="absolute bottom-0 -left-20 h-80 w-80 rounded-full bg-peach-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo size={38} variant="light" />
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <LogOut className="h-4 w-4" /> خروج
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">{children}</div>;
}

export default function PaymentGate({ children }) {
  const [phase, setPhase] = useState('checking'); // checking | confirming | no_tenant | not_manager | pay | paid | error
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const { data, error: e } = await supabase.rpc('my_billing_status');
    if (e) { setError('تعذر التحقق من الاشتراك — حاول مرة أخرى'); setPhase('error'); return; }
    const st = Array.isArray(data) ? data[0] : data;
    setStatus(st || null);
    if (!st?.tenant_id) return setPhase('no_tenant');
    if (isActive(st)) return setPhase('paid');
    if (!['owner', 'admin'].includes(st.role)) return setPhase('not_manager');
    setPhase('pay');
  }

  useEffect(() => {
    (async () => {
      // الرجوع من صفحة 3D Secure
      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('id');
      if (params.get('billing') === 'return' && paymentId) {
        setPhase('confirming');
        window.history.replaceState({}, '', window.location.pathname);
        const { data, error: fnErr } = await supabase.functions.invoke('billing-subscribe', {
          body: { action: 'confirm', payment_id: paymentId },
        });
        if (fnErr || data?.error) {
          setError(data?.error || params.get('message') || 'لم تكتمل عملية الدفع');
        }
      }
      await load();
    })();
  }, []);

  if (phase === 'paid') return children;

  if (phase === 'checking' || phase === 'confirming') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {phase === 'confirming' ? 'جارٍ تأكيد الدفع مع البنك...' : 'جارٍ التحقق من الاشتراك...'}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <Centered>
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="mb-5 text-slate-300">{error}</p>
          <button onClick={() => { setPhase('checking'); load(); }} className="h-11 w-full rounded-xl bg-sage-400 font-bold hover:bg-sage-500">
            إعادة المحاولة
          </button>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'no_tenant') return <Shell><CreateTenant onCreated={() => { setPhase('checking'); load(); }} /></Shell>;

  if (phase === 'not_manager') {
    return (
      <Shell>
        <Centered>
          <Lock className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h2 className="mb-2 text-xl font-bold">اشتراك المنشأة غير فعّال</h2>
          <p className="text-sm text-slate-400">تواصل مع مالك المنشأة لتجديد الاشتراك.</p>
        </Centered>
      </Shell>
    );
  }

  return <Shell><Checkout status={status} initialError={error} /></Shell>;
}

// ── إنشاء منشأة للحساب الجديد (مرة واحدة فقط) ─────────────────────
function CreateTenant({ onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('اكتب اسم المنشأة');
    setSaving(true); setError('');
    const { error: err } = await supabase.rpc('create_my_tenant', { p_name: name.trim() });
    setSaving(false);
    if (err) return setError(err.message);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-500/25">
          <Building2 className="h-7 w-7 text-sage-300" />
        </div>
        <h2 className="text-xl font-bold">أهلاً بك في فلسي</h2>
        <p className="mt-1 text-sm text-slate-400">الخطوة الأولى: اسم منشأتك</p>
      </div>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="مثال: مقهى الورد"
        className="h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-white placeholder:text-slate-500 focus:border-sage-300 focus:outline-none" />
      {error && <p className="mt-3 text-sm text-sage-300">{error}</p>}
      <button disabled={saving} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sage-400 font-bold hover:bg-sage-500 disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} متابعة للدفع
      </button>
    </form>
  );
}

// ── اختيار الخطة + الدفع في صفحة واحدة ───────────────────────────
function Checkout({ status, initialError }) {
  const [dbPlans, setDbPlans] = useState(null);
  const [planCode, setPlanCode] = useState(() => new URLSearchParams(window.location.search).get('plan') || 'pro');
  const [promoInput, setPromoInput] = useState('');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [step, setStep] = useState('form'); // form | tokenizing | charging | redirecting
  const [error, setError] = useState(initialError || '');

  useEffect(() => {
    supabase.from('billing_plans').select('*').eq('is_active', true).order('price_monthly')
      .then(({ data }) => {
        // نسخة واحدة (الأحدث) لكل plan_code
        const latest = {};
        (data || []).forEach(p => { if (!latest[p.plan_code] || p.version > latest[p.plan_code].version) latest[p.plan_code] = p; });
        const list = Object.values(latest).sort((a, b) => a.price_monthly - b.price_monthly);
        setDbPlans(list);
        if (list.length && !list.some(p => p.plan_code === planCode)) {
          setPlanCode((list.find(p => p.plan_code === 'pro') || list[0]).plan_code);
        }
      });
  }, []);

  const plans = useMemo(() => (dbPlans || []).map(p => {
    const ui = PLANS.find(x => x.code === CODE_ALIASES[p.plan_code]) || {};
    const features = ui.features?.length ? ui.features : (Array.isArray(p.features) ? p.features : []);
    return { code: p.plan_code, name: p.name_ar || ui.name, price: Number(p.price_monthly), features, popular: ui.popular };
  }), [dbPlans]);

  const selected = plans.find(p => p.code === planCode);
  const busy = step !== 'form';
  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));

  async function pay(e) {
    e.preventDefault();
    setError('');
    if (!PUBLISHABLE_KEY) return setError('بوابة الدفع غير مهيأة (VITE_MOYASAR_PUBLISHABLE_KEY)');
    const [mm, yyRaw] = card.expiry.split('/').map(s => (s || '').trim());
    const yy = yyRaw?.length === 2 ? `20${yyRaw}` : yyRaw;
    const number = card.number.replace(/\s/g, '');
    if (!card.name.trim() || number.length < 15 || !/^\d{2}$/.test(mm || '') || !/^\d{4}$/.test(yy || '') || !/^\d{3,4}$/.test(card.cvc)) {
      return setError('تأكد من بيانات البطاقة');
    }

    try {
      setStep('tokenizing');
      const tokenRes = await fetch('https://api.moyasar.com/v1/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishable_api_key: PUBLISHABLE_KEY,
          save_only: true,
          name: card.name.trim(), number, month: mm, year: yy, cvc: card.cvc,
          callback_url: `${window.location.origin}/dashboard`,
        }),
      });
      const token = await tokenRes.json();
      if (!tokenRes.ok || !token?.id) throw new Error(token?.message || 'تعذر التحقق من البطاقة');

      setStep('charging');
      const { data, error: fnErr } = await supabase.functions.invoke('billing-subscribe', {
        body: { action: 'start', plan_code: planCode, moyasar_token: token.id, promotion_code: promoInput.trim() || null },
      });
      if (fnErr || data?.error) {
        let msg = data?.error;
        if (!msg && fnErr?.context?.json) { try { msg = (await fnErr.context.json())?.error; } catch { /* */ } }
        throw new Error(msg || 'فشل الدفع');
      }

      if (data?.requires_action && data.transaction_url) {
        setStep('redirecting');
        window.location.assign(data.transaction_url);
        return;
      }
      window.location.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع');
      setStep('form');
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black md:text-4xl">اختر باقتك وفعّل حسابك</h1>
        <p className="mt-2 text-slate-400">
          {status?.tenant_name ? <>منشأة <b className="text-white">{status.tenant_name}</b> — </> : null}
          {status?.sub_status ? 'انتهى اشتراكك، جدّده للمتابعة' : 'الدفع آمن ويتجدد تلقائياً كل شهر، ويمكنك الإلغاء في أي وقت'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* الخطط */}
        <div className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {dbPlans === null && <div className="col-span-full flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>}
          {dbPlans && !plans.length && <p className="col-span-full text-center text-slate-400">لا توجد باقات متاحة حالياً</p>}
          {plans.map(p => (
            <button key={p.code} type="button" onClick={() => setPlanCode(p.code)} disabled={busy}
              className={`relative rounded-2xl border-2 p-5 text-right transition-all ${planCode === p.code ? 'border-sage-300 bg-sage-300/10' : 'border-white/10 bg-white/5 hover:border-white/25'}`}>
              {p.popular && (
                <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-sage-400 px-2.5 py-0.5 text-[11px] font-bold">
                  <Star className="h-3 w-3" /> الأكثر طلباً
                </span>
              )}
              <h3 className="font-bold">{p.name}</h3>
              <p className="mt-1"><span className="text-3xl font-black">{p.price}</span> <span className="text-sm text-slate-400">ر.س / شهر</span></p>
              <ul className="mt-3 space-y-1.5">
                {p.features.slice(0, 5).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage-300" />{f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* البطاقة */}
        <form onSubmit={pay} className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage-500/25"><CreditCard className="h-5 w-5 text-sage-300" /></div>
            <div>
              <p className="font-bold">الدفع بالبطاقة</p>
              <p className="text-xs text-slate-400">مدى · فيزا · ماستركارد</p>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="الاسم على البطاقة" value={card.name} onChange={v => set('name', v)} autoComplete="cc-name" dir="ltr" />
            <Field label="رقم البطاقة" value={card.number} onChange={v => set('number', formatCardNumber(v))} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" dir="ltr" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="الانتهاء" value={card.expiry} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" dir="ltr"
                onChange={v => { const d = v.replace(/\D/g, '').slice(0, 4); set('expiry', d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }} />
              <Field label="CVC" value={card.cvc} onChange={v => set('cvc', v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" placeholder="•••" dir="ltr" />
            </div>
            <div className="relative">
              <Tag className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={promoInput} onChange={e => setPromoInput(e.target.value)} placeholder="كود خصم (اختياري)"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 pr-9 pl-3 text-sm text-white placeholder:text-slate-500 focus:border-sage-300 focus:outline-none" />
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          <button type="submit" disabled={busy || !selected}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sage-400 font-bold transition hover:bg-sage-500 disabled:opacity-50">
            {busy ? (
              <><Loader2 className="h-4 w-4 animate-spin" />
                {step === 'tokenizing' ? 'جارٍ التحقق من البطاقة...' : step === 'charging' ? 'جارٍ تنفيذ الدفع...' : 'جارٍ التحويل للبنك...'}</>
            ) : (
              <>ادفع {selected ? `${selected.price} ر.س` : ''} وفعّل</>
            )}
          </button>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> تُعالج البطاقة مباشرة عبر Moyasar المرخّصة من ساما — لا نحفظ بيانات بطاقتك
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, onChange, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      <input {...props} onChange={e => onChange(e.target.value)} required
        className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-600 focus:border-sage-300 focus:outline-none" />
    </label>
  );
}
