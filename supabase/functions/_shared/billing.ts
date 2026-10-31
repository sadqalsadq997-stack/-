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
  if (payment?.status !== 'paid') throw new HttpError(402, 'لم تكتمل عملية الدفع');

  // لا نضع checkout في completed قبل حفظ الاشتراك والفاتورة؛
  // دالة SQL تنفذ جميع التغييرات في معاملة ذرية واحدة مع قفل الصف.
  const { data, error } = await sb.rpc('billing_activate_checkout', {
    p_checkout: checkoutId,
    p_payment_id: String(payment.id || ''),
    p_payment_status: String(payment.status || ''),
    p_amount_minor: Number(payment.amount),
    p_currency: String(payment.currency || ''),
    p_card_company: payment.source?.company || null,
    p_card_number: payment.source?.number || null,
  });

  if (error) throw new Error(`فشل تفعيل الاشتراك ذرياً: ${error.message}`);
  if (data?.ok === false) throw new HttpError(400, data.error || 'تعذر تفعيل الاشتراك');
  return { alreadyActive: Boolean(data?.alreadyActive), result: data };
}

/**
 * طلبات الاشتراك الجديدة (billing_orders): يتأكد أن دفعة موياسر تخص هذا الطلب
 * وأنها "paid" وبنفس المبلغ بالهللة وبالريال السعودي، ثم يفعّل الاشتراك.
 * آمن للتكرار (المتصفح + الـ webhook ممكن يستدعونه بنفس الوقت).
 */
export async function activateOrderFromPayment(sb: SupabaseClient, order: any, payment: any): Promise<{ ok: boolean; message?: string }> {
  if (!payment || payment.status !== 'paid') {
    return { ok: false, message: payment?.source?.message || 'لم تكتمل عملية الدفع' };
  }
  // الدفعة لازم تحمل رقم هذا الطلب نفسه (نضعه في metadata عند إنشاء نموذج الدفع)
  if (payment.metadata?.order_id !== order.id) return { ok: false, message: 'الدفعة لا تخص هذا الطلب' };
  if (order.moyasar_payment_id && order.moyasar_payment_id !== payment.id) {
    return { ok: false, message: 'معرّف الدفعة لا يطابق الدفعة المسجلة على الطلب' };
  }
  if (payment.currency !== 'SAR' || Number(payment.amount) !== Math.round(Number(order.amount) * 100)) {
    await sb.from('security_events').insert({
      event_type: 'payment_amount_mismatch', success: false,
      meta: { order: order.order_number, expected: Math.round(Number(order.amount) * 100), got: payment.amount, payment: payment.id },
    });
    return { ok: false, message: 'مبلغ الدفعة لا يطابق مبلغ الطلب — تواصل معنا' };
  }
  const { error } = await sb.rpc('billing_activate_order', { p_order: order.id, p_ref: payment.id, p_method: 'card' });
  // أخطاء قاعدة البيانات مؤقتة غالباً؛ ارفعها حتى يعيد Moyasar إرسال الـ webhook.
  if (error) throw new Error(`فشل تفعيل طلب الاشتراك: ${error.message}`);
  return { ok: true };
}
