// ══════════════════════════════════════════════════════════════════
// Edge Function: billing-subscribe
// ══════════════════════════════════════════════════════════════════
// يُستدعى عند تسجيل منشأة جديدة أو ترقية اشتراكها. يستقبل "token"
// (رمز بطاقة مُولّد مسبقاً من نموذج Moyasar بالواجهة الأمامية —
// انظر التعليق بالأسفل لشرح آلية التوكنة من جهة العميل) ويُجري
// أول عملية دفع فعلية (سعر العرض الترويجي إن وجد، أو السعر الكامل).
//
// ⚠️ مهم جداً من ناحية الأمان والـ PCI-DSS Compliance:
// لا يُسمح أبداً بإرسال رقم البطاقة (PAN) أو CVC للسيرفر الخاص بك.
// حسب وثائق Moyasar الرسمية، عملية التوكنة (tokenization) يجب أن
// تبدأ من المتصفح مباشرة ضد API الخاص بـ Moyasar (باستخدام
// publishable_api_key وليس المفتاح السري)، فترجع لك "token" فقط،
// وهذا التوكن هو الذي يُرسل لهذه الدالة — لا بيانات بطاقة خام أبداً.
//
// المتطلبات (Supabase Secrets):
//   MOYASAR_SECRET_KEY   — المفتاح السري (sk_live_... أو sk_test_...)
//   APP_PUBLIC_URL        — رابط نطاقك (لإعادة التوجيه بعد 3DS لو احتاج الأمر)
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function basicAuthHeader(secretKey: string): string {
  return 'Basic ' + btoa(`${secretKey}:`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id, plan_code, moyasar_token, promotion_code } = await req.json();

    if (!tenant_id || !plan_code || !moyasar_token) {
      return new Response(JSON.stringify({ error: 'tenant_id و plan_code و moyasar_token مطلوبة' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('MOYASAR_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'لم يتم ضبط MOYASAR_SECRET_KEY في إعدادات Supabase Secrets' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── جلب نسخة السعر النشطة للخطة المطلوبة ──
    const { data: plan, error: planErr } = await supabase
      .rpc('get_active_billing_plan', { p_plan_code: plan_code });

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: 'الخطة المطلوبة غير موجودة' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── البحث عن عرض ترويجي صالح (سواء بكود محدد أو عرض تلقائي عام) ──
    let promotion = null;
    if (promotion_code) {
      const { data } = await supabase
        .from('billing_promotions')
        .select('*')
        .eq('code', promotion_code)
        .eq('plan_code', plan_code)
        .eq('is_active', true)
        .maybeSingle();
      promotion = data;
    } else {
      const { data } = await supabase
        .from('billing_promotions')
        .select('*')
        .is('code', null)
        .eq('plan_code', plan_code)
        .eq('is_active', true)
        .lte('valid_from', new Date().toISOString())
        .maybeSingle();
      promotion = data;
    }

    // فحص حد الاستخدام وصلاحية تاريخ العرض
    if (promotion) {
      const now = new Date();
      const validUntilOk = !promotion.valid_until || new Date(promotion.valid_until) > now;
      const redemptionsOk = promotion.max_redemptions === null || promotion.redemptions_count < promotion.max_redemptions;
      if (!validUntilOk || !redemptionsOk) promotion = null;
    }

    const firstChargeAmount = promotion ? Number(promotion.trial_price) : Number(plan.price_monthly);

    // ── تنفيذ أول عملية دفع فعلية عبر Moyasar باستخدام الرمز ──
    const paymentRes = await fetch('https://api.moyasar.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(secretKey),
      },
      body: JSON.stringify({
        amount: Math.round(firstChargeAmount * 100), // موياسر يتوقع المبلغ بالهللات
        currency: 'SAR',
        description: `اشتراك ${plan.name_ar}${promotion ? ' (عرض ترويجي)' : ''}`,
        source: { type: 'token', token: moyasar_token },
        metadata: { tenant_id, plan_code },
      }),
    });

    const payment = await paymentRes.json();

    if (!paymentRes.ok || payment.status !== 'paid') {
      return new Response(JSON.stringify({
        error: 'فشلت عملية الدفع', details: payment.message || payment,
      }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── حساب تواريخ الدورة القادمة ──
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    let trialPeriodsRemaining = 0;
    let nextChargeAmount = Number(plan.price_monthly);

    if (promotion) {
      const unit = promotion.trial_period_unit === 'day' ? 'day' : 'month';
      if (unit === 'day') periodEnd.setDate(periodEnd.getDate() + promotion.trial_period_count);
      else periodEnd.setMonth(periodEnd.getMonth() + 1); // أول فترة من الـ trial تنتهي بعد شهر واحد فقط
      trialPeriodsRemaining = Math.max(0, promotion.trial_period_count - 1);
      nextChargeAmount = trialPeriodsRemaining > 0 ? Number(promotion.trial_price) : Number(plan.price_monthly);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // ── حفظ/تحديث الاشتراك (upsert حسب tenant_id الفريد) ──
    const { data: subscription, error: subErr } = await supabase
      .from('tenant_subscriptions')
      .upsert({
        tenant_id,
        billing_plan_id: plan.id,
        promotion_id: promotion?.id || null,
        status: trialPeriodsRemaining > 0 ? 'trialing' : 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_charge_amount: nextChargeAmount,
        trial_periods_remaining: trialPeriodsRemaining,
        moyasar_token,
        moyasar_card_brand: payment.source?.company || null,
        moyasar_card_last_four: payment.source?.number?.slice(-4) || null,
        failed_attempts: 0,
        last_payment_id: payment.id,
        cancelled_at: null,
      }, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (subErr) throw new Error(`فشل حفظ الاشتراك: ${subErr.message}`);

    // ── تسجيل أول فاتورة كناجحة ──
    await supabase.from('billing_invoices').insert({
      tenant_id, subscription_id: subscription.id,
      amount: firstChargeAmount, status: 'paid',
      moyasar_payment_id: payment.id,
      period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(),
      paid_at: new Date().toISOString(),
    });

    // ── زيادة عداد استخدام العرض الترويجي ──
    if (promotion) {
      await supabase.from('billing_promotions')
        .update({ redemptions_count: promotion.redemptions_count + 1 })
        .eq('id', promotion.id);
    }

    return new Response(JSON.stringify({
      success: true,
      subscription_id: subscription.id,
      status: subscription.status,
      next_charge_amount: nextChargeAmount,
      current_period_end: periodEnd.toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[billing-subscribe]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
