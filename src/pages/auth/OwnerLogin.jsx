import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { callFunction } from '@/lib/api';
import { CONTACT, whatsappLink } from '@/lib/contact';
import { AuthShell, Field, SubmitButton, Alert, GoogleButton, Divider, arabicAuthError } from '@/components/auth/AuthShell';

// ══════════════════════════════════════════════════════════════════
// شاشة الدخول (داخل النظام/التطبيق): دخول فقط — إنشاء الحساب من الموقع.
// كل محاولة تمر عبر auth-login: 10 محاولات خاطئة لكل جهاز ثم قفل مؤقت.
// ══════════════════════════════════════════════════════════════════

export function ContactUsFooter() {
  return (
    <div className="space-y-2">
      <p>تحتاج مساعدة أو تبي تشترك؟</p>
      <a href={whatsappLink('السلام عليكم، أحتاج مساعدة في الدخول لنظام فلسي')} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#25D366]/25 transition hover:brightness-95">
        <MessageCircle className="h-4 w-4" />
        تواصل معنا على واتساب
      </a>
      <p className="text-xs text-slate-400" dir="ltr">{CONTACT.phoneLocal}</p>
    </div>
  );
}

export default function OwnerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//')
    ? location.state.from : '/dashboard';

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: err, status } = await callFunction('auth-login', { email: email.trim(), password });
    if (err || !data?.access_token) {
      setLoading(false);
      if (status === 429) { setError(err); return; }
      if (data?.code === 'invalid') {
        const left = Number(data.remaining);
        setError(`البريد أو كلمة المرور غير صحيحة${Number.isFinite(left) ? ` — باقي ${left} محاولة من هذا الجهاز` : ''}`);
        return;
      }
      setError(arabicAuthError({ message: err }));
      return;
    }
    const { error: sErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sErr) { setLoading(false); setError(arabicAuthError(sErr)); return; }
    setPassword('');
    navigate(from, { replace: true });
  }

  return (
    <AuthShell
      title="أهلاً بعودتك"
      subtitle="سجّل دخولك لحساب منشأتك"
      footer={<ContactUsFooter />}
    >
      <GoogleButton redirectPath={from} onError={setError} label="الدخول بحساب جوجل" />
      <Divider />
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email"
          value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoFocus maxLength={254} />
        <Field label="كلمة المرور" name="password" type="password" dir="ltr" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" maxLength={200}
          hint={<Link to="/auth/forgot" className="text-xs font-bold text-sage-700 hover:underline">نسيت كلمة المرور؟</Link>} />
        <Alert>{error}</Alert>
        <SubmitButton loading={loading} disabled={loading || !email || !password}>دخول</SubmitButton>
      </form>
    </AuthShell>
  );
}
