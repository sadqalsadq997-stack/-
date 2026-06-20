import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Clock, CreditCard, AlertTriangle, Loader2, Shield, Star, Zap } from 'lucide-react';

// ══════════════════════════════════════════════════════
// بوابة الدفع — يُمنع الوصول حتى يتم الدفع والتحقق
// ══════════════════════════════════════════════════════

const PLANS = [
  {
    id: 'starter',
    name: 'المبتدئ',
    price: 99,
    period: 'شهر',
    icon: '🌱',
    features: ['نقطة بيع واحدة', 'حتى 500 منتج', 'تقارير أساسية', 'دعم فني'],
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'pro',
    name: 'الاحترافي',
    price: 199,
    period: 'شهر',
    icon: '🚀',
    popular: true,
    features: ['3 نقاط بيع', 'منتجات غير محدودة', 'تحليلات متقدمة', 'ذكاء اصطناعي', 'دعم ذهبي'],
    color: 'from-violet-500 to-purple-700',
  },
  {
    id: 'enterprise',
    name: 'المؤسسي',
    price: 499,
    period: 'شهر',
    icon: '🏢',
    features: ['فروع غير محدودة', 'API كامل', 'تكامل ZATCA', 'مدير حساب مخصص', 'SLA 99.9%'],
    color: 'from-amber-500 to-orange-600',
  },
];

export default function PaymentGate({ children, onPaymentVerified }) {
  const [status, setStatus]           = useState('checking'); // checking | unpaid | pending | paid | error
  const [subscription, setSubscription] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [paymentCode, setPaymentCode]   = useState('');
  const [verifying, setVerifying]       = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [branchId]                      = useState(() => {
    try {
      const raw = localStorage.getItem('activeBranch');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // التحقق من أن الـ id هو UUID صحيح لمنع injection
      const id = parsed?.id;
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return id;
      return null;
    } catch { return null; }
  });

  useEffect(() => { checkSubscription(); }, []);

  async function checkSubscription() {
    try {
      const { data, error: e } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e) { setStatus('unpaid'); return; }
      if (!data) { setStatus('unpaid'); return; }

      setSubscription(data);

      if (data.status === 'active') {
        const expiry = new Date(data.expires_at);
        if (expiry > new Date()) {
          setStatus('paid');
          if (onPaymentVerified) onPaymentVerified(data);
          return;
        }
      }
      if (data.status === 'pending') { setStatus('pending'); return; }
      setStatus('unpaid');
    } catch {
      setStatus('unpaid');
    }
  }

  // التحقق من رمز الدفع المرسل من المحاسب
  async function verifyPaymentCode() {
    if (!paymentCode.trim()) { setError('أدخل رمز الدفع'); return; }
    setVerifying(true);
    setError('');
    try {
      // التحقق من رمز الدفع في جدول payment_codes
      const { data: codeData, error: codeErr } = await supabase
        .from('payment_codes')
        .select('*')
        .eq('code', paymentCode.trim().toUpperCase())
        .eq('used', false)
        .maybeSingle();

      if (codeErr || !codeData) {
        setError('رمز الدفع غير صحيح أو تم استخدامه مسبقاً');
        setVerifying(false);
        return;
      }

      // التحقق من توقيع الرمز (HMAC-SHA256)
      const isValid = await verifyCodeSignature(codeData);
      if (!isValid) {
        setError('⚠️ رمز الدفع غير موثوق — تحقق مع المحاسب');
        setVerifying(false);
        return;
      }

      // تفعيل الاشتراك
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + (codeData.months || 1));

      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .upsert({
          plan: codeData.plan || selectedPlan,
          status: 'active',
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          payment_code: paymentCode.trim().toUpperCase(),
          amount_paid: codeData.amount,
          branch_id: branchId,
        })
        .select()
        .single();

      if (subErr) throw subErr;

      // تعليم الرمز كمستخدم
      await supabase
        .from('payment_codes')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('id', codeData.id);

      setSubscription(sub);
      setSuccess('✅ تم التحقق من الدفع بنجاح! مرحباً بك في فلسي');
      setTimeout(() => {
        setStatus('paid');
        if (onPaymentVerified) onPaymentVerified(sub);
      }, 2000);
    } catch (err) {
      setError('حدث خطأ أثناء التحقق: ' + err.message);
    }
    setVerifying(false);
  }

  // التحقق من توقيع الرمز
  async function verifyCodeSignature(codeData) {
    // ── لا bypass مطلقاً — حتى في التطوير ──
    if (!codeData.signature || codeData.signature === 'dev') return false;
    try {
      const SECRET = import.meta.env.VITE_PAYMENT_SECRET;
      if (!SECRET) return false; // يجب وجود المفتاح في .env
      const payload = `${codeData.code}:${codeData.plan}:${codeData.amount}:${codeData.months}`;
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      );
      const sigBytes = Uint8Array.from(atob(codeData.signature), c => c.charCodeAt(0));
      const dataBytes = new TextEncoder().encode(payload);
      return await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
    } catch {
      return false; // أي خطأ = رفض
    }
  }

  // إذا الاشتراك فعّال → اعرض المحتوى
  if (status === 'paid') return children;

  // شاشة التحميل
  if (status === 'checking') return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">جارٍ التحقق من الاشتراك...</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center z-[9999] p-4 overflow-y-auto" dir="rtl">
      {/* خلفية زخرفية */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-amber-500/8 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative w-full max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Shield className="w-4 h-4" />
            <span>يتطلب اشتراكاً فعّالاً</span>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">
            <span className="text-primary">فلسي</span> POS
          </h1>
          <p className="text-slate-400 text-base">اختر خطتك وابدأ إدارة عملك بذكاء</p>
        </div>

        {/* خطط الاشتراك */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PLANS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative rounded-2xl p-6 text-right transition-all duration-300 border-2 ${
                selectedPlan === plan.id
                  ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" /> الأكثر شيوعاً
                  </span>
                </div>
              )}
              <div className="text-3xl mb-3">{plan.icon}</div>
              <h3 className="text-white font-bold text-lg mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-black text-white">{plan.price}</span>
                <span className="text-slate-400 text-sm">ر.س / {plan.period}</span>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* بوابة إدخال رمز الدفع */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-white font-bold text-xl mb-1">إدخال رمز الدفع</h2>
            <p className="text-slate-400 text-sm">
              {status === 'pending'
                ? 'تم استلام طلبك — في انتظار تأكيد الدفع'
                : 'أرسل للمحاسب لاستلام رمز التفعيل'}
            </p>
          </div>

          {status === 'pending' && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl p-3 mb-4 text-sm">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>في انتظار تأكيد الدفع من قِبل المحاسب</span>
            </div>
          )}

          <div className="space-y-3">
            <input
              value={paymentCode}
              onChange={e => setPaymentCode(e.target.value.toUpperCase())}
              placeholder="أدخل رمز الدفع (مثال: PAY-XXXX-XXXX)"
              className="w-full h-12 bg-white/5 border border-white/20 rounded-xl px-4 text-white text-center font-mono text-lg tracking-widest placeholder:text-slate-600 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-primary transition-colors"
              onKeyDown={e => e.key === 'Enter' && verifyPaymentCode()}
            />

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {success}
              </div>
            )}

            <button
              onClick={verifyPaymentCode}
              disabled={verifying || !paymentCode.trim()}
              className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              {verifying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحقق...</>
              ) : (
                <><Zap className="w-4 h-4" /> تفعيل الاشتراك</>
              )}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-slate-500 text-xs">
              للحصول على رمز الدفع تواصل معنا على
            </p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <a href="https://wa.me/966500000000" className="text-emerald-400 text-sm hover:underline">واتساب</a>
              <span className="text-slate-600">•</span>
              <a href="tel:+966500000000" className="text-blue-400 text-sm hover:underline">اتصل بنا</a>
              <span className="text-slate-600">•</span>
              <a href="mailto:support@felsy.sa" className="text-violet-400 text-sm hover:underline">البريد الإلكتروني</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
