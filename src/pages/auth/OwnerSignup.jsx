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
        <p className="text-center text-sm text-muted-foreground mt-6">
          لديك حساب؟{' '}
          <Link to="/auth/login" className="text-primary hover:underline font-medium">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
