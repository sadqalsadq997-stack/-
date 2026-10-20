import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';
import { MailCheck, Loader2 } from 'lucide-react';
import { AuthShell, Field, SubmitButton, Alert, GoogleButton, Divider, arabicAuthError, passwordStrength } from '@/components/auth/AuthShell';

const STRENGTH = [
  { label: 'ضعيفة جداً', color: 'bg-red-500' },
  { label: 'ضعيفة', color: 'bg-orange-500' },
  { label: 'متوسطة', color: 'bg-amber-400' },
  { label: 'جيدة', color: 'bg-emerald-500' },
  { label: 'قوية', color: 'bg-emerald-600' },
];

export default function OwnerSignup() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState({ tone: 'ok', text: '' });
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plan = /^[a-z0-9_-]{2,32}$/i.test(params.get('plan') || '') ? params.get('plan') : '';
  const next = plan ? `/dashboard?plan=${plan}` : '/dashboard';
  const strength = passwordStrength(form.password);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setResendMsg({ tone: 'ok', text: '' });
    try {
      const { error: err } = await supabase.auth.resend({
        type: 'signup', email: sentTo,
        options: { emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (err) throw err;
      setResendMsg({ tone: 'ok', text: 'أعدنا إرسال الرابط — شيّك بريدك.' });
      setCooldown(60);
    } catch (err) {
      setResendMsg({ tone: 'error', text: arabicAuthError(err) });
      setCooldown(30);
    }
    setResending(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    if (form.name.trim().length < 2) return setError('اكتب اسمك');
    if (form.password.length < 8) return setError('كلمة المرور لازم تكون 8 أحرف على الأقل');
    if (!agree) return setError('لازم توافق على الشروط والأحكام');
    setLoading(true);
    try {
      if (isMissingEnv) throw new Error('النظام غير مهيأ حالياً');
      const { data, error: err } = await supabase.auth.signUp({
        email: form.email.trim(), password: form.password,
        options: { data: { full_name: form.name.trim() }, emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (err) throw err;
      // Supabase يُرجع مستخدماً "وهمياً" بدون خطأ (ولا يرسل أي بريد) إذا كان الإيميل مسجّلاً من قبل.
      // identities الفارغة = الحساب موجود، فلا نعرض شاشة "أرسلنا الرابط" زوراً.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('هذا البريد مسجّل عندنا من قبل — سجّل دخولك، أو اضغط "نسيت كلمة المرور" إذا ما تذكرها.');
        setLoading(false);
        return;
      }
      if (!data?.session) { setSentTo(form.email.trim()); setCooldown(60); setLoading(false); return; }
      navigate(next);
    } catch (err) {
      setError(arabicAuthError(err));
      setLoading(false);
    }
  }

  const f = k => e => setForm(v => ({ ...v, [k]: e.target.value }));

  if (sentTo) {
    return (
      <AuthShell title="تحقق من بريدك" subtitle={null}
        footer={<>وصلك الرابط وفعّلت؟ <Link to="/auth/login" className="font-bold text-sage-700 hover:underline">سجّل دخولك</Link></>}>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 text-[15px] leading-relaxed text-emerald-900">
            أرسلنا رابط التفعيل إلى <b dir="ltr">{sentTo}</b>. افتحه من جوالك أو جهازك، وبعدها تختار باقتك مباشرة.
          </p>
          <p className="mt-3 text-xs text-emerald-700">ما وصل؟ شيّك مجلد الرسائل غير المرغوبة (Spam).</p>
          <button type="button" onClick={handleResend} disabled={cooldown > 0 || resending}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
            {resending && <Loader2 className="h-4 w-4 animate-spin" />}
            {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : 'إعادة إرسال الرابط'}
          </button>
        </div>
        <div className="mt-3"><Alert tone={resendMsg.tone}>{resendMsg.text}</Alert></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="أنشئ حسابك"
      subtitle="دقيقتين وتبدأ البيع — الباقات من 29 ريال بالشهر"
      footer={<>عندك حساب؟ <Link to="/auth/login" className="font-bold text-sage-700 hover:underline">سجّل دخولك</Link></>}
    >
      <GoogleButton redirectPath={next} label="التسجيل بحساب جوجل" onError={setError} />
      <Divider />
      <form onSubmit={handleSignup} className="space-y-4" noValidate>
        <Field label="اسمك" name="name" autoComplete="name" value={form.name} onChange={f('name')} required placeholder="محمد العتيبي" autoFocus />
        <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email"
          value={form.email} onChange={f('email')} required placeholder="you@example.com" />
        <div>
          <Field label="كلمة المرور" name="password" type="password" dir="ltr" autoComplete="new-password"
            value={form.password} onChange={f('password')} required placeholder="••••••••" />
          <p className="mt-1.5 text-xs text-slate-400">8 أحرف على الأقل</p>
          {form.password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map(i => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < strength ? STRENGTH[strength].color : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="w-16 text-left text-xs text-slate-500">{STRENGTH[strength].label}</span>
            </div>
          )}
        </div>
        <label className="flex items-start gap-2.5 text-sm text-slate-600">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sage-700" />
          <span>أوافق على <Link to="/terms" className="font-bold text-slate-800 hover:underline">الشروط والأحكام</Link> و<Link to="/privacy" className="font-bold text-slate-800 hover:underline">سياسة الخصوصية</Link></span>
        </label>
        <Alert>{error}</Alert>
        <SubmitButton loading={loading}>إنشاء الحساب</SubmitButton>
      </form>
    </AuthShell>
  );
}
