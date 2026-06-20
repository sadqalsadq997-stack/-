import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';

export default function OwnerLogin() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isMissingEnv) {
        // وضع محلي — قبول أي بريد
        navigate('/');
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      navigate('/');
    } catch (err) {
      setError(err.message || 'خطأ في تسجيل الدخول');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <span className="text-3xl font-black text-primary">ف</span>
          </div>
          <h1 className="text-2xl font-black text-foreground">تسجيل الدخول</h1>
          <p className="text-muted-foreground text-sm mt-1">مرحباً بك في فلسي</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">البريد الإلكتروني</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@example.com"
              className="w-full h-11 bg-muted/50 border border-border rounded-xl px-4 text-sm focus:outline-none focus:border-primary transition-colors"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                className="w-full h-11 bg-muted/50 border border-border rounded-xl px-4 pr-10 text-sm focus:outline-none focus:border-primary transition-colors"
                dir="ltr"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            دخول
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          ليس لديك حساب؟{' '}
          <Link to="/auth/signup" className="text-primary hover:underline font-medium">إنشاء حساب</Link>
        </p>
        <p className="text-center text-xs text-muted-foreground mt-2">
          <Link to="/home" className="hover:underline opacity-60">العودة للصفحة الرئيسية</Link>
        </p>
      </div>
    </div>
  );
}
