import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';
import { AuthShell, Field, SubmitButton, Alert, GoogleButton, Divider, arabicAuthError } from '@/components/auth/AuthShell';

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
    try {
      if (isMissingEnv) throw new Error('النظام غير مهيأ حالياً');
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      navigate(from, { replace: true });
    } catch (err) {
      setError(arabicAuthError(err));
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="أهلاً بعودتك"
      subtitle="سجّل دخولك لحساب منشأتك"
      footer={<>ما عندك حساب؟ <Link to="/auth/signup" className="font-bold text-sage-700 hover:underline">أنشئ حسابك</Link></>}
    >
      <GoogleButton redirectPath={from} onError={setError} />
      <Divider />
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" autoComplete="email" inputMode="email"
          value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoFocus />
        <Field label="كلمة المرور" name="password" type="password" dir="ltr" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
          hint={<Link to="/auth/forgot" className="text-xs font-bold text-sage-700 hover:underline">نسيت كلمة المرور؟</Link>} />
        <Alert>{error}</Alert>
        <SubmitButton loading={loading} disabled={loading || !email || !password}>دخول</SubmitButton>
      </form>
    </AuthShell>
  );
}
