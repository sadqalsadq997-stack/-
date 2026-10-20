import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AuthShell, Field, SubmitButton, Alert, arabicAuthError } from '@/components/auth/AuthShell';

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // رابط الاستعادة ينشئ جلسة مؤقتة — ننتظرها
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const t = setTimeout(() => setReady(r => r || 'expired'), 6000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('كلمة المرور لازم تكون 8 أحرف على الأقل');
    if (password !== confirm) return setError('كلمتا المرور غير متطابقتين');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(arabicAuthError(err));
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell title="كلمة مرور جديدة" subtitle="اختر كلمة مرور قوية ما استخدمتها قبل"
      footer={<Link to="/auth/login" className="font-bold text-sage-700 hover:underline">رجوع لتسجيل الدخول</Link>}>
      {ready === 'expired' ? (
        <Alert>الرابط منتهي أو غير صالح. <Link to="/auth/forgot" className="font-bold underline">اطلب رابطاً جديداً</Link></Alert>
      ) : !ready ? (
        <p className="text-sm text-slate-500">جارٍ التحقق من الرابط...</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="كلمة المرور الجديدة" name="password" type="password" dir="ltr" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
          <Field label="تأكيد كلمة المرور" name="confirm" type="password" dir="ltr" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} required />
          <Alert>{error}</Alert>
          <SubmitButton loading={loading}>حفظ والدخول</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
