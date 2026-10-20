import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AuthShell, Field, SubmitButton, Alert, arabicAuthError } from '@/components/auth/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setLoading(false);
    // نعرض نفس الرسالة سواء البريد مسجّل أو لا (حتى لا نكشف الحسابات)
    if (err && /rate limit|too many/i.test(err.message)) return setError(arabicAuthError(err));
    setDone(true);
  }

  return (
    <AuthShell title="نسيت كلمة المرور؟" subtitle="اكتب بريدك ونرسل لك رابط تعيين كلمة مرور جديدة"
      footer={<Link to="/auth/login" className="font-bold text-sage-700 hover:underline">رجوع لتسجيل الدخول</Link>}>
      {done ? (
        <Alert tone="success">إذا كان البريد مسجّلاً عندنا، بيوصلك رابط خلال دقيقة. افتحه من نفس الجهاز.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoFocus />
          <Alert>{error}</Alert>
          <SubmitButton loading={loading} disabled={loading || !email}>أرسل الرابط</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
