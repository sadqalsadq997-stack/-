// ══════════════════════════════════════════════════════════════════
// Edge Function: moyasar-webhook
// ══════════════════════════════════════════════════════════════════
// اضبط الرابط في لوحة Moyasar → Webhooks:
//   https://YOUR_PROJECT.supabase.co/functions/v1/moyasar-webhook
// واضبط "Secret Token" هناك بنفس قيمة السر:
//   MOYASAR_WEBHOOK_SECRET (Supabase Secrets) — إلزامي
//
// الأمان:
//   • بدون السر الصحيح يُرفض الطلب (fail closed)
//   • لا نثق بحالة الدفعة في جسم الطلب — نجلبها من موياسر مباشرة
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient } from '../_shared/auth.ts';
import { moyasarFetchPayment, activateFromCheckout, activateOrderFromPayment } from '../_shared/billing.ts';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expectedSecret = Deno.env.get('MOYASAR_WEBHOOK_SECRET') || '';
  const payload = await req.json().catch(() => null);
  const provided = String(payload?.secret_token || req.headers.get('x-moyasar-secret') || '');

  if (!expectedSecret || !provided || !safeEqual(provided, expectedSecret)) {
    return json({ error: 'غير مصرح' }, 401);
  }

  const sb = adminClient();
  try {
    const eventType = payload?.type || 'unknown';
    const paymentId = payload?.data?.id;

    await sb.from('moyasar_webhook_events').insert({
      event_type: eventType,
      payment_id: paymentId,
      raw_payload: { ...payload, secret_token: undefined },
      processed: false,
    });

    if (!paymentId) return json({ received: true });

    // المصدر الموثوق: موياسر نفسه
    const payment = await moyasarFetchPayment(String(paymentId));

    // 0) طلب اشتراك من صفحة التسجيل (بطاقة / Apple Pay / STC Pay)
    const orderId = payment.metadata?.order_id;
    if (typeof orderId === 'string' && /^[0-9a-f-]{36}$/i.test(orderId)) {
      const { data: order } = await sb.from('billing_orders').select('*').eq('id', orderId).maybeSingle();
      if (order && order.status !== 'paid' && payment.status === 'paid') {
        await activateOrderFromPayment(sb, order, payment);
      }
    }

    // 1) دفعة اشتراك جديد (بعد 3DS) لم يكمل العميل الرجوع للموقع
    const { data: checkout } = await sb.from('billing_checkouts')
      .select('id, status').eq('moyasar_payment_id', payment.id).maybeSingle();
    if (checkout) {
      if (payment.status === 'paid') await activateFromCheckout(sb, checkout.id, payment);
      else if (payment.status === 'failed') {
        await sb.from('billing_checkouts').update({ status: 'failed' }).eq('id', checkout.id).eq('status', 'pending');
      }
    }

    // 2) دفعة تجديد دوري
    if (payment.status === 'paid' || payment.status === 'failed') {
      const { data: invoice } = await sb.from('billing_invoices')
        .select('id, subscription_id').eq('moyasar_payment_id', payment.id).maybeSingle();
      if (invoice) {
        await sb.from('billing_invoices').update({
          status: payment.status,
          paid_at: payment.status === 'paid' ? new Date().toISOString() : null,
        }).eq('id', invoice.id);
        if (payment.status === 'paid') {
          await sb.from('tenant_subscriptions')
            .update({ status: 'active', failed_attempts: 0 })
            .eq('id', invoice.subscription_id)
            .in('status', ['past_due', 'suspended']);
        }
      }
    }

    await sb.from('moyasar_webhook_events').update({ processed: true })
      .eq('payment_id', paymentId).eq('processed', false);
  } catch (err) {
    console.error('[moyasar-webhook]', err);
    // نعيد 5xx عند فشل المعالجة حتى تعيد ميسر إرسال الحدث وفق سياسة المحاولات.
    return json({ received: false, error: 'تعذرت معالجة إشعار الدفع' }, 500);
  }
  return json({ received: true });
});
