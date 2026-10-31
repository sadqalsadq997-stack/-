import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  ArrowRight, Check, Minus, Plus, CreditCard, Landmark, Copy, Upload, FileText, ChevronDown,
  Loader2, ShieldCheck, Store, Clock, MessageCircle, Lock, Eye, EyeOff, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';
import { callFunction } from '@/lib/api';
import { BANK, CONTACT, whatsappLink } from '@/lib/contact';
import Logo from '@/components/brand/Logo';
import PaymentBadges from '@/components/payments/PaymentBadges';

// ══════════════════════════════════════════════════════════════════
// الاشتراك من الموقع: الباقة ← الفروع ← المدة ← بياناتك ← الدفع
// كل الأسعار تُحسب في قاعدة البيانات (billing_quote) — الواجهة تعرض فقط
// ══════════════════════════════════════════════════════════════════

const STORE_KEY = 'felsy_subscribe_v1';
const MOYASAR_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY || '';
const MOYASAR_METHODS = (import.meta.env.VITE_MOYASAR_METHODS || 'creditcard,applepay,stcpay')
  .split(',').map(s => s.trim()).filter(Boolean);

const sar = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthsLabel = (m) => (m === 1 ? 'شهر واحد' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهراً`);

function loadSaved() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}

// ── عناصر عامة ─────────────────────────────────────────────────────
function Progress({ count, index, onBack }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} disabled={index === 0} aria-label="رجوع"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-beige-200 disabled:opacity-30">
        <ArrowRight className="h-5 w-5" />
      </button>
      <div className="flex flex-1 gap-2" aria-label={`الخطوة ${index + 1} من ${count}`}>
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= index ? 'bg-sage-700' : 'bg-beige-300'}`} />
        ))}
      </div>
    </div>
  );
}

function StepTitle({ title, subtitle }) {
  return (
    <div className="mb-7">
      <h1 className="text-[1.75rem] font-black leading-tight text-ink sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Field({ label, optional, error, children }) {
  return (
    <div>
      <label className={`mb-1.5 flex items-center gap-1.5 text-sm font-bold ${error ? 'text-red-600' : 'text-ink'}`}>
        {label}{optional && <span className="font-normal text-slate-400">(اختياري)</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-slate-400 focus:ring-4 ${err ? 'border-red-400 focus:ring-red-100' : 'border-beige-300 focus:border-sage-600 focus:ring-sage-100'}`;

function CopyRow({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ }
  }
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`mt-0.5 break-all text-[14px] font-bold leading-snug text-ink ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : "rtl"}>{value}</p>
      </div>
      <button type="button" onClick={copy}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-beige-300 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-beige-200">
        {copied ? <Check className="h-3.5 w-3.5 text-sage-700" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'تم النسخ' : 'نسخ'}
      </button>
    </div>
  );
}

// ── الدفع بالبطاقة / Apple Pay / STC Pay عبر ميسر ──────────────────
function MoyasarForm({ order }) {
  const ref = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!MOYASAR_KEY) { setErr('الدفع بالبطاقة غير مفعّل حالياً — اختر التحويل البنكي أو تواصل معنا'); setState('error'); return; }
      try {
        const [mod] = await Promise.all([
          import('moyasar-payment-form'),
          import('moyasar-payment-form/dist/moyasar.css'),
        ]);
        if (cancelled || !ref.current) return;
        const Moyasar = mod.default || mod;
        ref.current.innerHTML = '';
        sessionStorage.setItem('felsy_pay_order', order.id);
        Moyasar.init({
          element: ref.current,
          amount: Math.round(Number(order.amount) * 100),
          currency: 'SAR',
          description: `اشتراك فلسي — طلب ${order.order_number}`,
          publishable_api_key: MOYASAR_KEY,
          callback_url: `${window.location.origin}/subscribe/return`,
          methods: MOYASAR_METHODS,
          supported_networks: (import.meta.env.VITE_MOYASAR_NETWORKS || 'mada,visa,mastercard,amex').split(',').map(s => s.trim()),
          metadata: { order_id: order.id, order_number: order.order_number },
          language: 'ar',
          apple_pay: {
            country: 'SA',
            label: 'Felsy', // ميسر يشترط حروفاً إنجليزية فقط هنا
            validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
          },
          on_completed: async (payment) => {
            await callFunction('billing-order', { action: 'attach_payment', order_id: order.id, payment_id: payment.id });
          },
        });
        setState('ready');
      } catch {
        if (!cancelled) { setErr('تعذر تحميل نموذج الدفع — تأكد من الإنترنت وحاول مرة ثانية'); setState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.amount, order.order_number]);

  return (
    <div className="mt-5">
      {state === 'loading' && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sage-700" /></div>}
      {state === 'error' && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{err}</p>}
      <div ref={ref} className="felsy-moyasar" dir="rtl" />
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <Lock className="h-3.5 w-3.5 flex-shrink-0" />
        تُعالَج بيانات البطاقة لدى بوابة الدفع ميسر مباشرة، ولا تمر على خوادمنا.
      </p>
    </div>
  );
}

// ── التحويل البنكي ─────────────────────────────────────────────────
async function prepareReceipt(file) {
  const MAX = 4 * 1024 * 1024;
  if (file.type === 'application/pdf') {
    if (file.size > MAX) throw new Error('ملف PDF أكبر من 4 ميجابايت — صوّر الإيصال بدلاً منه');
    return { blob: file, ext: 'pdf', type: 'application/pdf' };
  }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('ارفع صورة أو ملف PDF');
  if (file.size <= 3.5 * 1024 * 1024 && file.type !== 'image/heic' && file.type !== 'image/heif') {
    return { blob: file, ext: file.type.split('/')[1].replace('jpeg', 'jpg'), type: file.type };
  }
  // صورة كبيرة: نصغّرها في الجهاز قبل الرفع
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob || blob.size > MAX) throw new Error('الصورة كبيرة جداً — خذ لقطة شاشة للإيصال وارفعها');
  return { blob, ext: 'jpg', type: 'image/jpeg' };
}

function BankTransfer({ order, onSubmitted }) {
  const [file, setFile] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [sender, setSender] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!file) { setErr('ارفع إيصال التحويل أولاً'); return; }
    setBusy(true); setErr('');
    try {
      const { blob, ext, type } = await prepareReceipt(file);
      const { data: tenantId } = await supabase.rpc('my_tenant_id');
      if (!tenantId) throw new Error('تعذر تحديد حسابك — سجّل دخولك من جديد');
      const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
      const path = `${tenantId}/${order.order_number}-${Date.now()}-${rand}.${ext}`;
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, blob, { contentType: type, upsert: false });
      if (upErr) throw new Error('تعذر رفع الإيصال — حاول مرة ثانية');
      const { data, error } = await callFunction('billing-order', {
        action: 'submit_transfer', order_id: order.id, receipt_path: path,
        sender_name: sender, transfer_date: date, note,
      });
      if (error) throw new Error(error);
      onSubmitted?.(data.order);
    } catch (e) {
      setErr(e.message || 'حدث خطأ');
    }
    setBusy(false);
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-ink">حوّل المبلغ إلى حسابنا</span>
        <span className="text-slate-500">المبلغ: <b className="text-ink">{sar(order.amount)} ⃁</b></span>
      </div>

      <div className="space-y-4 rounded-2xl border border-beige-300 bg-beige p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-black text-ink">{BANK.bankName}</p>
          <p className="text-left text-xs leading-relaxed text-slate-500">{BANK.accountName}</p>
        </div>
        <CopyRow label="رقم الآيبان (IBAN)" value={BANK.iban} />
        <CopyRow label="رقم الحساب" value={BANK.accountNumber} />
        <CopyRow label="اسم المستفيد" value={BANK.accountName} mono={false} />
        <p className="text-xs text-slate-500">اكتب رقم الطلب <b dir="ltr" className="text-ink">{order.order_number}</b> في ملاحظة التحويل إن أمكن.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">ارفع إيصال التحويل</p>
        <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition ${file ? 'border-sage-500 bg-sage-50' : 'border-beige-300 bg-white hover:border-sage-400'}`}>
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-peach-50 text-peach-600">
            {file ? <FileText className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-ink">{file ? file.name : 'اختر ملف الإيصال'}</span>
            <span className="block text-xs text-slate-500">صورة أو PDF، حتى 4 ميجابايت</span>
          </span>
          {file && (
            <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} aria-label="إزالة الملف"
              className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
          )}
          <input type="file" accept="image/*,application/pdf" className="sr-only"
            onChange={e => { setFile(e.target.files?.[0] || null); setErr(''); }} />
        </label>
      </div>

      <div>
        <button type="button" onClick={() => setShowMore(v => !v)} className="flex items-center gap-1.5 text-sm text-slate-600">
          <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          تفاصيل التحويل (اختياري)
        </button>
        {showMore && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={sender} onChange={e => setSender(e.target.value)} placeholder="اسم المحوِّل" maxLength={80} className={inputCls(false)} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls(false)} aria-label="تاريخ التحويل" />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة" maxLength={300} className={`${inputCls(false)} sm:col-span-2`} />
          </div>
        )}
      </div>

      {err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{err}</p>}

      <button type="button" onClick={submit} disabled={busy}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-base font-black text-white transition hover:bg-ink/90 disabled:opacity-60">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        إرسال الإيصال
      </button>
    </div>
  );
}

function PendingReview({ order }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage-100 text-sage-700"><Clock className="h-8 w-8" /></div>
      <h1 className="text-2xl font-black text-ink">استلمنا إيصالك</h1>
      <p className="mt-2 text-slate-500">نراجع التحويل ونفعّل اشتراكك خلال ساعات العمل. يوصلك تأكيد على جوالك أو بريدك.</p>
      <div className="mx-auto mt-6 rounded-2xl border border-beige-300 bg-white p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">رقم الطلب</span><b dir="ltr">{order.order_number}</b></div>
        <div className="mt-2 flex justify-between"><span className="text-slate-500">المبلغ</span><b>{sar(order.amount)} ⃁</b></div>
      </div>
      <a href={whatsappLink(`السلام عليكم، أرسلت إيصال التحويل لطلب فلسي رقم ${order.order_number}`)} target="_blank" rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-bold text-white">
        <MessageCircle className="h-4 w-4" /> تابع طلبك على واتساب
      </a>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
export default function SubscribeWizard({ embedded = false }) {
  const { session } = useAuth();
  const hasAccount = !!session;
  const saved = useMemo(loadSaved, []);
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [terms, setTerms] = useState([]);
  const [plan, setPlan] = useState(saved.plan || params.get('plan') || '');
  const [branches, setBranches] = useState(saved.branches || 1);
  const [months, setMonths] = useState(saved.months || 12);
  const [info, setInfo] = useState({ name: '', phone: '', business: '', email: '', ...(saved.info || {}), password: '' });
  const [errors, setErrors] = useState({});
  const [quote, setQuote] = useState(null);
  const [order, setOrder] = useState(saved.order || null);
  const [method, setMethod] = useState('card');
  const [stepKey, setStepKey] = useState(saved.order ? 'payment' : 'plan');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [needTenant, setNeedTenant] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [checking, setChecking] = useState(hasAccount);

  // الباقات والمدد من قاعدة البيانات
  useEffect(() => {
    let alive = true;
    supabase.from('billing_plans')
      .select('plan_code, name_ar, price_monthly, features, included_branches, extra_branch_price, version')
      .in('plan_code', ['starter', 'pro', 'enterprise'])
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setPlansError('تعذر تحميل الباقات حالياً. تحقق من الاتصال وحاول مرة ثانية.');
          return;
        }
        const latest = {};
        (data || []).forEach(p => {
          if (!latest[p.plan_code] || p.version > latest[p.plan_code].version) latest[p.plan_code] = p;
        });
        const order = ['starter', 'pro', 'enterprise'];
        const list = order.map(code => latest[code]).filter(Boolean);
        if (!list.length) {
          setPlansError('لا توجد باقات اشتراك متاحة حالياً. تواصل مع الدعم.');
          return;
        }
        setPlans(list);
        setPlan(cur => {
          const want = cur === 'basic' ? 'starter' : cur;
          return list.some(p => p.plan_code === want) ? want : (list.find(p => p.plan_code === 'pro') || list[0]).plan_code;
        });
      })
      .finally(() => { if (alive) setPlansLoading(false); });

    supabase.from('billing_terms').select('*').eq('is_active', true).order('months')
      .then(({ data }) => {
        if (!alive) return;
        const list = data || [];
        setTerms(list);
        setMonths(m => (list.some(t => t.months === m) ? m : (list[list.length - 1]?.months || 1)));
      });

    return () => { alive = false; };
  }, []);

  // لو مسجّل: نشوف حالة آخر طلب وهل عنده منشأة
  useEffect(() => {
    if (!hasAccount) { setChecking(false); return; }
    (async () => {
      const { data: st } = await supabase.rpc('my_billing_status');
      const row = Array.isArray(st) ? st[0] : st;
      if (!row?.tenant_id) { setNeedTenant(true); setChecking(false); return; }
      const { data } = await callFunction('billing-order', { action: 'my_orders' });
      const latest = data?.orders?.[0];
      if (latest && ['pending_review', 'awaiting_payment', 'rejected'].includes(latest.status)) {
        setOrder(latest); setPlan(latest.plan_code); setBranches(latest.branches); setMonths(latest.months);
        setStepKey('payment');
        if (latest.status === 'rejected') setMethod('transfer');
      }
      setChecking(false);
    })();
  }, [hasAccount]);

  const planRow = plans.find(p => p.plan_code === plan);
  const unlimited = (planRow?.included_branches || 1) >= 999;

  const steps = useMemo(() => {
    const s = ['plan'];
    if (!unlimited) s.push('branches');
    s.push('duration');
    if (!hasAccount || needTenant) s.push('info');
    s.push('payment');
    return s;
  }, [unlimited, hasAccount, needTenant]);
  const index = Math.max(0, steps.indexOf(stepKey));

  // حفظ التقدم (بدون كلمة المرور)
  useEffect(() => {
    try {
      const { password, ...rest } = info;
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ plan, branches, months, info: rest, order }));
    } catch { /* */ }
  }, [plan, branches, months, info, order]);

  // السعر من القاعدة
  useEffect(() => {
    if (!plan || !months) return;
    let alive = true;
    const b = unlimited ? 1 : branches;
    supabase.rpc('billing_quote', { p_plan_code: plan, p_branches: b, p_months: months })
      .then(({ data }) => { if (alive && data) setQuote(data); });
    return () => { alive = false; };
  }, [plan, branches, months, unlimited]);

  const go = (k) => { setFormErr(''); setStepKey(k); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const back = () => { if (stepKey === 'payment' && order?.status === 'pending_review') return; go(steps[Math.max(0, index - 1)]); };

  function validateInfo() {
    const e = {};
    if (!hasAccount && info.name.trim().length < 2) e.name = 'الاسم مطلوب';
    if (!hasAccount && !/^(05\d{8}|\+?9665\d{8}|5\d{8})$/.test(info.phone.replace(/[\s-]/g, ''))) e.phone = 'أدخل رقم جوال سعودياً صحيحاً، مثل 0551234567';
    if (info.business.trim().length < 2) e.business = 'اسم النشاط التجاري مطلوب';
    if (!hasAccount && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(info.email.trim())) e.email = 'البريد الإلكتروني غير صحيح';
    if (!hasAccount && info.password.length < 8) e.password = 'كلمة المرور لازم تكون 8 أحرف على الأقل';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function createOrderForAccount() {
    const { data, error } = await callFunction('billing-order', {
      action: 'create_order', plan_code: plan, branches: unlimited ? 1 : branches, months,
    });
    if (error) throw new Error(error);
    setOrder(data.order);
  }

  async function next() {
    setFormErr('');
    const k = steps[index];
    if (k === 'plan' && !plan) return;
    if (k !== 'info' && steps[index + 1] !== 'payment') return go(steps[index + 1]);

    setBusy(true);
    try {
      if (k === 'info') {
        if (!validateInfo()) { setBusy(false); return; }
        if (!hasAccount) {
          const { data, error } = await callFunction('billing-order', {
            action: 'signup', plan_code: plan, branches: unlimited ? 1 : branches, months,
            name: info.name, phone: info.phone, business_name: info.business, email: info.email.trim(), password: info.password,
          });
          if (error) throw new Error(error);
          if (data.session) await supabase.auth.setSession(data.session);
          setOrder(data.order);
          setInfo(i => ({ ...i, password: '' }));
        } else {
          const { error: tErr } = await supabase.rpc('create_my_tenant', { p_name: info.business.trim() });
          if (tErr) throw new Error(tErr.message);
          setNeedTenant(false);
          await createOrderForAccount();
        }
      } else {
        await createOrderForAccount();
      }
      go('payment');
    } catch (e) {
      setFormErr(e.message || 'حدث خطأ — حاول مرة ثانية');
    }
    setBusy(false);
  }

  const total = order && stepKey === 'payment' ? Number(order.amount) : Number(quote?.total || 0);

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-beige"><Loader2 className="h-7 w-7 animate-spin text-sage-700" /></div>;
  }

  const pending = order?.status === 'pending_review';

  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" className={`min-h-screen bg-beige text-ink ${embedded ? 'fixed inset-0 z-[9999] overflow-y-auto' : ''}`}>
        <header className="sticky top-0 z-20 border-b border-beige-300 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-3.5">
            <Link to="/" aria-label="فلسي — الرئيسية"><Logo size={34} /></Link>
            {!hasAccount
              ? <Link to="/auth/login" className="text-sm font-bold text-sage-700 hover:underline">عندي حساب</Link>
              : <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-sage-700">مساعدة؟</a>}
          </div>
        </header>

        <main className="mx-auto max-w-xl px-5 pb-40 pt-6">
          {pending ? <PendingReview order={order} /> : (
            <>
              <Progress count={steps.length} index={index} onBack={back} />
              <div className="mt-8">
                <AnimatePresence mode="wait">
                  <motion.div key={stepKey} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.22 }}>

                    {stepKey === 'plan' && (
                      <>
                        <StepTitle title="اختر باقتك" subtitle="كل الباقات فيها نقطة بيع، فواتير متوافقة مع هيئة الزكاة، والبيجر الإلكتروني." />
                        <div className="space-y-3">
                          {plans.map(p => {
                            const on = p.plan_code === plan;
                            return (
                              <button key={p.plan_code} type="button" onClick={() => setPlan(p.plan_code)} aria-pressed={on}
                                className={`w-full rounded-2xl border p-5 text-right transition ${on ? 'border-sage-600 bg-sage-50 ring-2 ring-sage-200' : 'border-beige-300 bg-white hover:border-sage-400'}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? 'border-sage-700' : 'border-slate-300'}`}>
                                      {on && <span className="h-2.5 w-2.5 rounded-full bg-sage-700" />}
                                    </span>
                                    <span className="text-lg font-black">{p.name_ar}</span>
                                  </div>
                                  <span className="text-left"><b className="text-2xl font-black">{Number(p.price_monthly)}</b> <span className="text-sm text-slate-500">⃁ / شهر</span></span>
                                </div>
                                <ul className="mt-3 grid gap-1.5 ps-8 text-sm text-slate-600 sm:grid-cols-2">
                                  {(Array.isArray(p.features) ? p.features : []).slice(0, 4).map(f => (
                                    <li key={f} className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage-600" />{f}</li>
                                  ))}
                                </ul>
                              </button>
                            );
                          })}
                          {plansLoading && <div className="flex justify-center py-10" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-sage-700" /><span className="sr-only">جارٍ تحميل الباقات</span></div>}
                          {!plansLoading && plansError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{plansError}</div>}
                        </div>
                      </>
                    )}

                    {stepKey === 'branches' && planRow && (
                      <>
                        <StepTitle title="كم فرعاً تريد تشغيله؟" subtitle="تدفع عن كل فرع يعمل بفلسي، وتقدر تضيف فروعاً لاحقاً." />
                        <div className="rounded-3xl border border-beige-300 bg-white px-6 py-8">
                          <div className="flex items-center justify-between">
                            <button type="button" onClick={() => setBranches(b => Math.min(100, b + 1))} aria-label="زيادة"
                              className="flex h-14 w-14 items-center justify-center rounded-full border border-beige-300 text-ink transition hover:bg-beige"><Plus className="h-5 w-5" /></button>
                            <div className="text-center">
                              <motion.p key={branches} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-black">{branches}</motion.p>
                              <p className="mt-1 text-slate-500">{branches === 1 ? 'فرع' : branches === 2 ? 'فرعين' : 'فروع'}</p>
                            </div>
                            <button type="button" onClick={() => setBranches(b => Math.max(1, b - 1))} disabled={branches <= 1} aria-label="إنقاص"
                              className="flex h-14 w-14 items-center justify-center rounded-full border border-beige-300 text-ink transition hover:bg-beige disabled:opacity-30"><Minus className="h-5 w-5" /></button>
                          </div>
                          <p className="mt-6 text-center text-sm text-slate-500">
                            {planRow.name_ar} · يشمل {planRow.included_branches === 1 ? 'فرعاً واحداً' : `${planRow.included_branches} فروع`} · {Number(planRow.extra_branch_price ?? planRow.price_monthly)} ⃁ شهرياً لكل فرع إضافي
                          </p>
                        </div>
                      </>
                    )}

                    {stepKey === 'duration' && (
                      <>
                        <StepTitle title="اختر مدة الاشتراك" subtitle="كلما طالت المدة زاد الخصم." />
                        <div className="space-y-3">
                          {terms.map(t => {
                            const on = t.months === months;
                            return (
                              <button key={t.months} type="button" onClick={() => setMonths(t.months)} aria-pressed={on}
                                className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 transition ${on ? 'border-sage-600 bg-sage-50 ring-2 ring-sage-200' : 'border-beige-300 bg-white hover:border-sage-400'}`}>
                                <span className="flex items-center gap-3">
                                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? 'border-sage-700' : 'border-slate-300'}`}>
                                    {on && <span className="h-2.5 w-2.5 rounded-full bg-sage-700" />}
                                  </span>
                                  <b>{t.label_ar || monthsLabel(t.months)}</b>
                                </span>
                                {Number(t.discount_pct) > 0 && <span className="rounded-full bg-peach-100 px-2.5 py-1 text-xs font-black text-peach-700">خصم {Number(t.discount_pct)}%</span>}
                              </button>
                            );
                          })}
                        </div>
                        {quote && (
                          <div className="mt-5 space-y-2.5 rounded-2xl border border-beige-300 bg-white p-5 text-sm">
                            <div className="flex justify-between text-slate-600">
                              <span>{quote.plan_name}، {quote.unlimited_branches ? 'فروع غير محدودة' : `${quote.branches} ${quote.branches === 1 ? 'فرع' : 'فروع'}`} — {monthsLabel(quote.months)}</span>
                              <span>{sar(quote.subtotal)} ⃁</span>
                            </div>
                            {Number(quote.discount) > 0 && <div className="flex justify-between text-sage-700"><span>خصم المدة ({Number(quote.discount_pct)}%)</span><span>-{sar(quote.discount)} ⃁</span></div>}
                            <div className="flex justify-between text-slate-600"><span>ضريبة القيمة المضافة ({Number(quote.vat_pct)}%)</span><span>{sar(quote.vat)} ⃁</span></div>
                            <div className="flex justify-between border-t border-beige-300 pt-3 text-base font-black"><span>الإجمالي</span><span>{sar(quote.total)} ⃁</span></div>
                          </div>
                        )}
                      </>
                    )}

                    {stepKey === 'info' && (
                      <>
                        <StepTitle title={hasAccount ? 'بيانات نشاطك' : 'بيانات حسابك'}
                          subtitle={hasAccount ? 'اسم نشاطك يظهر في الفواتير والمنيو.' : 'بهذي البيانات ننشئ حسابك، وتدخل فيها للنظام بعد الدفع.'} />
                        <div className="space-y-5 rounded-3xl border border-beige-300 bg-white p-5 sm:p-6">
                          {!hasAccount && (
                            <Field label="اسمك" error={errors.name}>
                              <input value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} autoComplete="name" maxLength={80} className={inputCls(errors.name)} />
                            </Field>
                          )}
                          {!hasAccount && (
                            <Field label="رقم الجوال" error={errors.phone}>
                              <div className={`flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-4 ${errors.phone ? 'border-red-400 focus-within:ring-red-100' : 'border-beige-300 focus-within:border-sage-600 focus-within:ring-sage-100'}`} dir="ltr">
                                <span className="flex h-12 items-center border-e border-beige-300 bg-beige px-3 text-sm font-bold text-slate-600">+966</span>
                                <input value={info.phone} onChange={e => setInfo({ ...info, phone: e.target.value.replace(/[^\d+\s]/g, '') })}
                                  inputMode="tel" autoComplete="tel-national" placeholder="05X XXX XXXX" maxLength={14}
                                  className="h-12 w-full bg-transparent px-3 text-[15px] tracking-wide outline-none" />
                              </div>
                            </Field>
                          )}
                          <Field label="اسم النشاط التجاري" error={errors.business}>
                            <input value={info.business} onChange={e => setInfo({ ...info, business: e.target.value })} autoComplete="organization" maxLength={80} className={inputCls(errors.business)} />
                          </Field>
                          {!hasAccount && (
                            <Field label="البريد الإلكتروني" error={errors.email}>
                              <input type="email" dir="ltr" value={info.email} onChange={e => setInfo({ ...info, email: e.target.value })} autoComplete="email" inputMode="email" maxLength={254} className={inputCls(errors.email)} />
                            </Field>
                          )}
                          {!hasAccount && (
                            <Field label="كلمة المرور" error={errors.password}>
                              <div className="relative">
                                <input type={showPass ? 'text' : 'password'} dir="ltr" value={info.password} onChange={e => setInfo({ ...info, password: e.target.value })}
                                  autoComplete="new-password" maxLength={72} className={`${inputCls(errors.password)} ps-11`} />
                                <button type="button" onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'إخفاء' : 'إظهار'}
                                  className="absolute inset-y-0 start-0 flex w-11 items-center justify-center text-slate-400">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                              </div>
                            </Field>
                          )}
                          <p className="text-xs text-slate-500">نستخدم بياناتك لتجهيز حسابك والتواصل معك فقط. بالمتابعة توافق على <Link to="/terms" className="underline">الشروط</Link> و<Link to="/privacy" className="underline">الخصوصية</Link>.</p>
                        </div>
                      </>
                    )}

                    {stepKey === 'payment' && order && (
                      <>
                        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-beige-300 bg-white p-5">
                          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-peach-50 text-peach-600"><Store className="h-6 w-6" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-black">{order.quote?.plan_name || plan}</p>
                            <p className="text-sm text-slate-500">
                              {order.quote?.unlimited_branches ? 'فروع غير محدودة' : order.branches === 1 ? 'فرع واحد' : `${order.branches} فروع`} · {monthsLabel(order.months)}
                            </p>
                            <p className="text-xs text-slate-400">رقم الطلب: <span dir="ltr">{order.order_number}</span></p>
                          </div>
                          <p className="text-left text-lg font-black">{sar(order.amount)} <span className="text-xs font-normal text-slate-500">⃁</span></p>
                        </div>

                        {order.status === 'rejected' && (
                          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            ما قدرنا نعتمد التحويل السابق{order.review_note ? `: ${order.review_note}` : ''}. ارفع الإيصال الصحيح أو ادفع بالبطاقة.
                          </p>
                        )}

                        <div className="rounded-3xl border border-beige-300 bg-white p-5 sm:p-6">
                          <p className="mb-3 font-bold">طريقة الدفع</p>
                          <div className="space-y-3">
                            {[
                              { id: 'card', title: 'بطاقة بنكية أو Apple Pay', desc: 'مدى، فيزا، ماستركارد، Apple Pay، STC Pay — يتفعّل اشتراكك فوراً.', icon: CreditCard },
                              { id: 'transfer', title: 'تحويل بنكي', desc: 'حوّل المبلغ وارفع الإيصال، ونفعّل اشتراكك بعد المراجعة.', icon: Landmark },
                            ].map(m => {
                              const on = method === m.id;
                              return (
                                <button key={m.id} type="button" onClick={() => setMethod(m.id)} aria-pressed={on}
                                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-right transition ${on ? 'border-sage-600 bg-sage-50' : 'border-beige-300 hover:border-sage-400'}`}>
                                  <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-sage-700' : 'border-slate-300'}`}>
                                    {on && <span className="h-2.5 w-2.5 rounded-full bg-sage-700" />}
                                  </span>
                                  <span className="flex-1"><b className="block">{m.title}</b><span className="text-sm text-slate-500">{m.desc}</span></span>
                                  <m.icon className="h-5 w-5 flex-shrink-0 text-slate-500" />
                                </button>
                              );
                            })}
                          </div>
                          <div className="my-5 border-t border-beige-300" />
                          {method === 'card'
                            ? <MoyasarForm order={order} />
                            : <BankTransfer order={order} onSubmitted={(o) => setOrder(o)} />}
                          <PaymentBadges className="mt-6" title="" />
                        </div>
                        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" />الأسعار شاملة ضريبة القيمة المضافة</p>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </main>

        {/* الشريط السفلي: الإجمالي + متابعة */}
        {!pending && stepKey !== 'payment' && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-beige-300 bg-white/95 backdrop-blur">
            {formErr && <p role="alert" className="mx-auto max-w-xl px-5 pt-3 text-sm text-red-600">{formErr}</p>}
            <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-xs text-slate-500">الإجمالي لمدة {monthsLabel(months)} شامل الضريبة</p>
                <p className="text-2xl font-black">{quote ? sar(total) : '—'} <span className="text-sm font-bold text-slate-500">⃁</span></p>
              </div>
              <button type="button" onClick={next} disabled={busy || !plan || !quote}
                className="flex h-12 items-center gap-2 rounded-2xl bg-ink px-7 text-base font-black text-white transition hover:bg-ink/90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {steps[index + 1] === 'payment' ? 'المتابعة إلى الدفع' : 'متابعة'}
              </button>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

// يستخدمه PaymentGate بعد نجاح الدفع
export function clearSubscribeState() {
  try { sessionStorage.removeItem(STORE_KEY); sessionStorage.removeItem('felsy_pay_order'); } catch { /* */ }
}
