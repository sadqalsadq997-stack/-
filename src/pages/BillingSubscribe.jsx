import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';
import { CreditCard, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react';

// ══════════════════════════════════════════════════════
// صفحة الاشتراك بخصم تلقائي حقيقي (Moyasar Recurring)
// ══════════════════════════════════════════════════════
// آلية الأمان (حسب توصيات Moyasar الرسمية، PCI-DSS):
//   1) بيانات البطاقة (رقم، تاريخ، CVC) تُرسل من المتصفح مباشرة
//      إلى api.moyasar.com عبر "publishable key" (مفتاح عام، لا
//      يُستخدم لسحب فلوس بنفسه) — لا تمر هذه البيانات على
//      سيرفرنا أبداً، فلا نحمل مسؤولية تخزينها.
//   2) موياسر يرجع "token" فقط (لا بيانات بطاقة خام).
//   3) هذا التوكن يُرسل لـ Edge Function "billing-subscribe" التي
//      تُجري أول عملية دفع فعلية وتُفعّل الاشتراك.
//
// المتطلب: ضع في .env (الواجهة الأمامية فقط، هذا مفتاح عام وآمن):
//   VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_xxxxx
// ══════════════════════════════════════════════════════

const PUBLISHABLE_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY || '';

function CardField({ label, ...props }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <input {...props}
        className="w-full h-11 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
    </div>
  );
}

export default function BillingSubscribe({ tenantId: tenantIdProp, planCode: planCodeProp, promotionCode: promotionCodeProp, onSubscribed }) {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [resolvedTenantId, setResolvedTenantId] = useState(tenantIdProp || null);

  const planCode = planCodeProp || searchParams.get('plan') || 'pro';
  const promotionCode = promotionCodeProp || searchParams.get('promo') || null;

  useEffect(() => {
    if (tenantIdProp || !session?.user?.id) return;
    supabase.from('tenant_users').select('tenant_id')
      .eq('auth_id', session.user.id).eq('is_active', true).limit(1).maybeSingle()
      .then(({ data }) => setResolvedTenantId(data?.tenant_id || null));
  }, [tenantIdProp, session?.user?.id]);

  const tenantId = resolvedTenantId;

  const [plan, setPlan] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [card, setCard] = useState({ name: '', number: '', month: '', year: '', cvc: '' });
  const [step, setStep] = useState('form'); // form | tokenizing | charging | success | error
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('billing_plans').select('*').eq('plan_code', planCode).eq('is_active', true)
      .order('version', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setPlan(data));

    const q = supabase.from('billing_promotions').select('*').eq('plan_code', planCode).eq('is_active', true);
    (promotionCode ? q.eq('code', promotionCode) : q.is('code', null))
      .maybeSingle().then(({ data }) => setPromotion(data));
  }, [planCode, promotionCode]);

  const set = (k, v) => setCard(c => ({ ...c, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!PUBLISHABLE_KEY) {
      setError('لم يتم ضبط مفتاح Moyasar العام (VITE_MOYASAR_PUBLISHABLE_KEY) بعد');
      return;
    }
    setError('');
    setStep('tokenizing');

    try {
      // ── الخطوة 1: توكنة البطاقة مباشرة من المتصفح ضد Moyasar ──
      const tokenRes = await fetch('https://api.moyasar.com/v1/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishable_api_key: PUBLISHABLE_KEY,
          save_only: false,
          name: card.name,
          number: card.number.replace(/\s/g, ''),
          month: card.month,
          year: card.year,
          cvc: card.cvc,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.id) {
        throw new Error(tokenData.message || 'فشل التحقق من بيانات البطاقة');
      }

      // ── الخطوة 2: إرسال الرمز فقط لتفعيل الاشتراك ──
      setStep('charging');
      const { data, error: fnErr } = await supabase.functions.invoke('billing-subscribe', {
        body: {
          tenant_id: tenantId,
          plan_code: planCode,
          moyasar_token: tokenData.id,
          promotion_code: promotionCode || null,
        },
      });

      if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message || 'فشل تفعيل الاشتراك');

      setStep('success');
      onSubscribed?.(data);
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع');
      setStep('error');
    }
  }

  const displayPrice = promotion ? promotion.trial_price : plan?.price_monthly;
  const isPromo = !!promotion;

  if (!tenantId) {
    return (
      <div dir="rtl" className="max-w-md mx-auto bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-2xl p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">جارٍ تحديد منشأتك، أو لم يتم ربط حسابك بمنشأة بعد.</p>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div dir="rtl" className="max-w-md mx-auto bg-card border border-border rounded-3xl p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <h2 className="text-xl font-black text-foreground mb-1">تم تفعيل اشتراكك بنجاح</h2>
        <p className="text-sm text-muted-foreground">سيتم تجديده تلقائياً عند نهاية كل دورة بدون أي إجراء إضافي منك</p>
      </div>
    );
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="max-w-md mx-auto bg-card border border-border rounded-3xl p-6 space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CreditCard className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-lg font-black text-foreground">{plan?.name_ar || 'جارٍ التحميل...'}</h2>
        {plan && (
          <div className="mt-2">
            {isPromo ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-black text-primary">{displayPrice} ر.س</span>
                <span className="text-xs text-muted-foreground line-through">{plan.price_monthly} ر.س</span>
              </div>
            ) : (
              <span className="text-2xl font-black text-foreground">{displayPrice} ر.س / شهر</span>
            )}
            {isPromo && (
              <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs px-3 py-1 rounded-full mt-2">
                <Sparkles className="w-3 h-3" />
                عرض أول {promotion.trial_period_count} {promotion.trial_period_unit === 'day' ? 'يوم' : 'شهر'}، ثم {plan.price_monthly} ر.س شهرياً
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <CardField label="الاسم على البطاقة" value={card.name} onChange={e => set('name', e.target.value)} required />
        <CardField label="رقم البطاقة" inputMode="numeric" placeholder="0000 0000 0000 0000"
          value={card.number} onChange={e => set('number', e.target.value)} required />
        <div className="grid grid-cols-3 gap-3">
          <CardField label="الشهر" placeholder="MM" value={card.month} onChange={e => set('month', e.target.value)} required />
          <CardField label="السنة" placeholder="YYYY" value={card.year} onChange={e => set('year', e.target.value)} required />
          <CardField label="CVC" inputMode="numeric" placeholder="***" value={card.cvc} onChange={e => set('cvc', e.target.value)} required />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 rounded-xl p-3 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button type="submit" disabled={step === 'tokenizing' || step === 'charging'}
        className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
        {step === 'tokenizing' || step === 'charging' ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{step === 'tokenizing' ? 'جارٍ التحقق من البطاقة...' : 'جارٍ تفعيل الاشتراك...'}</>
        ) : (
          <>تفعيل الاشتراك{isPromo ? ` بـ ${displayPrice} ر.س` : ''}</>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5" />
        بياناتك مشفّرة وتُعالج مباشرة عبر بوابة Moyasar المرخّصة من ساما
      </p>
    </form>
  );
}
