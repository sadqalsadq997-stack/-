// ══════════════════════════════════════════════════════════════════
// منطق الفوترة المشترك (Moyasar) — يُستخدم من billing-subscribe و
// moyasar-webhook حتى يكون تفعيل الاشتراك في مكان واحد فقط.
// ══════════════════════════════════════════════════════════════════

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { HttpError } from './auth.ts';

const MOYASAR_API = 'https://api.moyasar.com/v1';

function moyasarAuth(): string {
  const secretKey = Deno.env.get('MOYASAR_SECRET_KEY');
  if (!secretKey) throw new HttpError(500, 'لم يتم ضبط MOYASAR_SECRET_KEY في Supabase Secrets');
  return 'Basic ' + btoa(`${secretKey}:`);
}

export async function moyasarCreatePayment(body: Record<string, unknown>) {
  const res = await fetch(`${MOYASAR_API}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: moyasarAuth() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** جلب الدفعة من موياسر مباشرة — المصدر الوحيد الموثوق لحالة الدفع */
export async function moyasarFetchPayment(paymentId: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(paymentId)) throw new HttpError(400, 'معرّف دفعة غير صالح');
  const res = await fetch(`${MOYASAR_API}/payments/${paymentId}`, {
    headers: { Authorization: moyasarAuth() },
  });
  if (!res.ok) throw new HttpError(404, 'الدفعة غير موجودة لدى موياسر');
  return await res.json();
}

/** يحسب الخطة والعرض والمبلغ الأول من السيرفر (لا نثق بأي سعر من المتصفح) */
export async function resolvePricing(sb: SupabaseClient, planCode: string, promotionCode?: string | null) {
  if (!/^[a-z0-9_-]{2,32}$/i.test(planCode)) throw new HttpError(400, 'رمز خطة غير صالح');

  const { data: plan } = await sb.from('billing_plans')
    .select('*').eq('plan_code', planCode).eq('is_active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  if (!plan) throw new HttpError(404, 'الخطة المطلوبة غير متاحة');

  let q = sb.from('billing_promotions').select('*')
    .eq('plan_code', planCode).eq('is_active', true)
    .lte('valid_from', new Date().toISOString());
  q = promotionCode ? q.eq('code', promotionCode.trim()) : q.is('code', null);
  const { data: promos } = await q.limit(1);
  let promotion = promos?.[0] ?? null;

  if (promotion) {
    const now = new Date();
    const validUntilOk = !promotion.valid_until || new Date(promotion.valid_until) > now;
    const redemptionsOk = promotion.max_redemptions === null || promotion.redemptions_count < promotion.max_redemptions;
    if (!validUntilOk || !redemptionsOk) promotion = null;
  }
  if (promotionCode && !promotion) throw new HttpError(400, 'كود الخصم غير صالح أو منتهي');

  const amount = promotion ? Number(promotion.trial_price) : Number(plan.price_monthly);
  if (!(amount > 0)) throw new HttpError(400, 'مبلغ الخطة غير صالح');
  return { plan, promotion, amount };
}

/**
 * يفعّل الاشتراك بعد التأكد من موياسر أن الدفعة "paid" وأن مبلغها
 * يطابق ما حسبه السيرفر. آمن للاستدعاء أكثر من مرة (idempotent).
 */
export async function activateFromCheckout(sb: SupabaseClient, checkoutId: string, payment: any) {
  const { data: checkout } = await sb.from('billing_checkouts').select('*').eq('id', checkoutId).maybeSingle();
  if (!checkout) throw new HttpError(404, 'عملية الدفع غير موجودة');
  if (checkout.status === 'completed') return { alreadyActive: true, checkout };

  if (payment?.status !== 'paid') throw new HttpError(402, 'لم تكتمل عملية الدفع');
  if (payment.id !== checkout.moyasar_payment_id) throw new HttpError(400, 'الدفعة لا تخص هذه العملية');
  if (Number(payment.amount) !== Math.round(Number(checkout.amount) * 100) || payment.currency !== 'SAR') {
    await sb.from('billing_checkouts').update({ status: 'amount_mismatch' }).eq('id', checkout.id);
    throw new HttpError(400, 'مبلغ الدفعة لا يطابق سعر الخطة');
  }

  // قفل تفاؤلي: فقط عملية واحدة تنقل الحالة من pending إلى completed
  const { data: locked } = await sb.from('billing_checkouts')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', checkout.id).eq('status', 'pending')
    .select('id');
  if (!locked?.length) return { alreadyActive: true, checkout };

  const { data: plan } = await sb.from('billing_plans').select('*').eq('id', checkout.billing_plan_id).single();
  const { data: promotion } = checkout.promotion_id
    ? await sb.from('billing_promotions').select('*').eq('id', checkout.promotion_id).maybeSingle()
    : { data: null };

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  let trialPeriodsRemaining = 0;
  let nextChargeAmount = Number(plan.price_monthly);

  if (promotion) {
    if (promotion.trial_period_unit === 'day') periodEnd.setDate(periodEnd.getDate() + promotion.trial_period_count);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    trialPeriodsRemaining = Math.max(0, promotion.trial_period_count - 1);
    nextChargeAmount = trialPeriodsRemaining > 0 ? Number(promotion.trial_price) : Number(plan.price_monthly);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const { data: subscription, error: subErr } = await sb.from('tenant_subscriptions').upsert({
    tenant_id: checkout.tenant_id,
    billing_plan_id: plan.id,
    promotion_id: promotion?.id || null,
    status: trialPeriodsRemaining > 0 ? 'trialing' : 'active',
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    next_charge_amount: nextChargeAmount,
    trial_periods_remaining: trialPeriodsRemaining,
    moyasar_token: checkout.moyasar_token,
    moyasar_card_brand: payment.source?.company || null,
    moyasar_card_last_four: payment.source?.number?.slice(-4) || null,
    failed_attempts: 0,
    last_payment_id: payment.id,
    cancelled_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' }).select().single();
  if (subErr) throw new Error(`فشل حفظ الاشتراك: ${subErr.message}`);

  await sb.from('billing_invoices').insert({
    tenant_id: checkout.tenant_id,
    subscription_id: subscription.id,
    amount: checkout.amount,
    status: 'paid',
    moyasar_payment_id: payment.id,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    paid_at: new Date().toISOString(),
  });

  await sb.from('tenants').update({ status: 'active', plan: plan.plan_code, updated_at: new Date().toISOString() })
    .eq('id', checkout.tenant_id);

  if (promotion) {
    await sb.rpc('increment_promotion_redemption', { p_promotion_id: promotion.id });
  }

  return { alreadyActive: false, subscription };
}
