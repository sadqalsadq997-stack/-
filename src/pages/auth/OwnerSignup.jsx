import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';
import felsynLogo from '@/assets/felsy-logo.png';
import { Loader2, UserPlus } from 'lucide-react';

export default function OwnerSignup() {
  const [form, setForm]   = useState({ name: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('كلمات المرور غير متطابقة'); return; }
    setLoading(true); setError('');
    try {
      if (isMissingEnv) { navigate('/'); return; }
      const { error: err } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.name } }
      });
      if (err) throw err;
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  const f = (k) => (e) => setForm(v => ({ ...v, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3 p-3">
            <img src={felsynLogo} alt="فلسي Felsy" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black text-foreground">إنشاء حساب</h1>
          <p className="text-muted-foreground text-sm mt-1">ابدأ تجربتك المجانية</p>
        </div>
        <form onSubmit={handleSignup} className="space-y-4">
          {[
            { key: 'name', label: 'الاسم الكامل', type: 'text', placeholder: 'محمد العمري' },
            { key: 'email', label: 'البريد الإلكتروني', type: 'email', placeholder: 'you@example.com', dir: 'ltr' },
            { key: 'password', label: 'كلمة المرور', type: 'password', placeholder: '••••••••', dir: 'ltr' },
            { key: 'confirm', label: 'تأكيد كلمة المرور', type: 'password', placeholder: '••••••••', dir: 'ltr' },
          ].map(inp => (
            <div key={inp.key}>
              <label className="text-sm font-medium block mb-1.5">{inp.label}</label>
              <input type={inp.type} value={form[inp.key]} onChange={f(inp.key)}
                placeholder={inp.placeholder} required dir={inp.dir}
                className="w-full h-11 bg-muted/50 border border-border rounded-xl px-4 text-sm focus:outline-none focus:border-primary transition-colors" />
            </div>
          ))}
          {error && <p className="text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            إنشاء الحساب
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: `${window.location.origin}/dashboard` },
            });
          }}
          className="w-full h-11 border border-border rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-muted transition-all">
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.69-2.26 1.1-3.71 1.1-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.69-.35-1.42-.35-2.09s.13-1.4.35-2.09V6.91H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 5.09l2.85-2.07.81-.93z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.99 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.91l3.66 2.91C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          إنشاء حساب بجوجل
        </button>

        <p className="text-center text-sm text-muted-foreground mt-6">
          لديك حساب؟{' '}
          <Link to="/auth/login" className="text-primary hover:underline font-medium">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
