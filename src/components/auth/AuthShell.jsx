import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Eye, EyeOff, Loader2, Check, BellRing } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import { supabase } from '@/integrations/supabase/client';

// ══════════════════════════════════════════════════════════════════
// الهيكل المشترك لصفحات الدخول/التسجيل/استعادة كلمة المرور
// يمين: النموذج — يسار: لوحة العلامة مع بيجر حي يتحرك
// ══════════════════════════════════════════════════════════════════

const AR_ERRORS = [
  [/invalid login credentials/i, 'البريد أو كلمة المرور غير صحيحة'],
  [/email not confirmed/i, 'لازم تفعّل بريدك أولاً — افتح رابط التفعيل اللي وصلك'],
  [/user already registered|already been registered/i, 'هذا البريد مسجّل عندنا — سجّل دخولك بدلاً من ذلك'],
  [/password should be at least/i, 'كلمة المرور لازم تكون 8 أحرف على الأقل'],
  [/error sending (confirmation|recovery|magic)|sending .* email/i, 'تعذّر إرسال رسالة التفعيل حالياً — حاول بعد قليل، وإذا استمر تواصل مع الدعم'],
  [/rate limit|too many requests|security purposes/i, 'محاولات كثيرة — انتظر دقيقة وحاول مرة ثانية'],
  [/unable to validate email|invalid email/i, 'صيغة البريد غير صحيحة'],
  [/network|fetch/i, 'تعذر الاتصال — تأكد من الإنترنت'],
  [/same password|different from the old/i, 'اختر كلمة مرور مختلفة عن القديمة'],
];

export function arabicAuthError(err) {
  const msg = err?.message || String(err || '');
  const hit = AR_ERRORS.find(([re]) => re.test(msg));
  return hit ? hit[1] : (msg || 'حدث خطأ غير متوقع');
}

const PAGER_STEPS = [
  { order: '١٤٧', label: 'طلبك قيد التحضير', ready: false },
  { order: '١٤٧', label: 'طلبك جاهز! تفضل للاستلام', ready: true },
];

function PagerPreview() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % PAGER_STEPS.length), 2600);
    return () => clearInterval(t);
  }, []);
  const s = PAGER_STEPS[i];
  return (
    <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      className="mx-auto w-56 rounded-[2.2rem] border-[6px] border-white/40 bg-ink p-2 shadow-2xl shadow-black/40">
      <div className="rounded-[1.7rem] bg-white px-4 pb-6 pt-5 text-center text-ink">
        <p className="text-[11px] text-slate-400">مقهى الورد</p>
        <p className="mt-3 text-xs text-slate-500">رقم طلبك</p>
        <p className="text-5xl font-black tracking-tight">{s.order}</p>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`mt-4 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold ${s.ready ? 'bg-sage-600 text-white' : 'bg-peach-50 text-peach-700'}`}>
            {s.ready ? (
              <motion.span animate={{ rotate: [0, -18, 18, -12, 12, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.4 }}>
                <BellRing className="h-4 w-4" />
              </motion.span>
            ) : <Loader2 className="h-4 w-4 animate-spin" />}
            {s.label}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" className="grid min-h-screen bg-white text-ink lg:grid-cols-[1fr_1.05fr]">
        {/* النموذج */}
        <div className="flex flex-col px-5 py-6 sm:px-10">
          <div className="flex items-center justify-between">
            <Link to="/" aria-label="فلسي — الرئيسية"><Logo size={36} /></Link>
            <Link to="/" className="text-sm text-slate-500 hover:text-sage-700">الرئيسية</Link>
          </div>
          <div className="flex flex-1 items-center justify-center py-10">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-[24rem]">
              <h1 className="text-3xl font-black tracking-tight sm:text-[2.1rem]">{title}</h1>
              {subtitle && <p className="mt-2 text-[15px] text-slate-500">{subtitle}</p>}
              <div className="mt-8">{children}</div>
              {footer && <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>}
            </motion.div>
          </div>
          <p className="text-center text-xs text-slate-400">
            <Link to="/terms" className="hover:underline">الشروط والأحكام</Link> · <Link to="/privacy" className="hover:underline">سياسة الخصوصية</Link>
          </p>
        </div>

        {/* لوحة العلامة */}
        <aside className="relative hidden overflow-hidden bg-sage-400 lg:flex lg:flex-col lg:justify-between lg:p-12">
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full" viewBox="0 0 700 260" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 120 C160 60 300 150 460 100 C580 62 650 90 700 70 L700 260 L0 260 Z" fill="#FAFAFA" opacity="0.35" />
            <path d="M0 180 C180 140 340 210 520 170 C610 150 660 160 700 150 L700 260 L0 260 Z" fill="#86A992" opacity="0.45" />
          </svg>
          <motion.div className="pointer-events-none absolute -bottom-40 -left-32 h-[34rem] w-[34rem] rounded-full bg-white/30 blur-3xl"
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.85, 0.6] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />

          <div className="relative max-w-md text-ink">
            <p className="text-4xl font-black leading-tight">تنمية أعمالك بذكاء وهدوء.</p>
            <p className="mt-3 text-lg text-ink/70">بيع، اطبع الفاتورة، ونادِ عميلك على جواله — من مكان واحد.</p>
            <ul className="mt-8 space-y-3 text-[15px] text-ink/80">
              {['نقطة بيع وفواتير متوافقة مع هيئة الزكاة', 'بيجر إلكتروني بمسح الباركود — بدون أجهزة', 'باقات تبدأ من 29 ريال بالشهر'].map(t => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sage-700"><Check className="h-3 w-3" /></span>{t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative py-10"><PagerPreview /></div>
          <p className="relative text-sm text-ink/60">أكثر من ١٠٠ منشأة في المملكة تستخدم فلسي يومياً</p>
        </aside>
      </div>
    </MotionConfig>
  );
}

export function Field({ label, hint, error, type = 'text', ...props }) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  const id = props.id || props.name;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-bold text-slate-700">{label}</label>
        {hint}
      </div>
      <div className="relative">
        <input id={id} type={isPass && show ? 'text' : type} {...props}
          aria-invalid={!!error}
          className={`h-12 w-full rounded-xl border bg-slate-50 px-4 text-[15px] outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 ${error ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-slate-900 focus:ring-slate-200/70'} ${isPass ? 'ps-11' : ''}`} />
        {isPass && (
          <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="absolute inset-y-0 start-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SubmitButton({ loading, children, ...props }) {
  return (
    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loading} {...props}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-sage-400 text-[15px] font-bold text-ink shadow-lg shadow-sage-500/25 transition-colors hover:bg-sage-500 disabled:opacity-60">
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </motion.button>
  );
}

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  const cls = tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>{children}</motion.p>
  );
}

export function GoogleButton({ redirectPath = '/dashboard', label = 'المتابعة بحساب جوجل', onError }) {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    });
    if (error) { setLoading(false); onError?.(arabicAuthError(error)); }
  }
  return (
    <button type="button" onClick={go} disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-slate-200 bg-white text-[15px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.69-2.26 1.1-3.71 1.1-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.69-.35-1.42-.35-2.09s.13-1.4.35-2.09V6.91H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 5.09l2.85-2.07.81-.93z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.99 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.91l3.66 2.91C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
      )}
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />أو<span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function passwordStrength(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
