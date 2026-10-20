// ══════════════════════════════════════════════════════════════════
// Edge Function: billing-subscribe — بوابة الدفع الوحيدة (Moyasar)
// ══════════════════════════════════════════════════════════════════
// action = "start":   يستقبل token البطاقة (مولّد من المتصفح مباشرة
//                     عند موياسر بالمفتاح العام) + رمز الخطة، يحسب
//                     السعر من قاعدة البيانات، وينشئ الدفعة الأولى.
//                     إن احتاجت البطاقة تحقق 3D Secure (مدى دائماً)
//                     يرجع transaction_url ليتحول له العميل.
// action = "confirm": بعد رجوع العميل من 3DS، نجلب الدفعة من موياسر
//                     مباشرة (لا نثق بأي status في الرابط) ونفعّل.
//
// الأمان:
//   • لازم JWT لمستخدم حقيقي + يكون مالك/مدير المنشأة
//   • tenant_id يؤخذ من عضوية المستخدم، ليس من جسم الطلب
//   • السعر يُحسب من billing_plans فقط، ويُطابَق مع مبلغ الدفعة
//
// Secrets: MOYASAR_SECRET_KEY, APP_PUBLIC_URL (مثال: https://felsy.org)
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, requireTenantMember, errorResponse, HttpError } from '../_shared/auth.ts';
import { resolvePricing, moyasarCreatePayment, moyasarFetchPayment, activateFromCheckout } from '../_shared/billing.ts';

function callbackUrl(): string {
  const base = (Deno.env.get('APP_PUBLIC_URL') || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw new HttpError(500, 'لم يتم ضبط APP_PUBLIC_URL في Supabase Secrets');
  return `${base}/dashboard?billing=return`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    const caller = await requireTenantMember(req, sb, null, true);

    // ── تأكيد بعد الرجوع من 3D Secure ──
    if (body.action === 'confirm') {
      const paymentId = String(body.payment_id || '');
      const payment = await moyasarFetchPayment(paymentId);
      const { data: checkout } = await sb.from('billing_checkouts')
        .select('id, tenant_id').eq('moyasar_payment_id', payment.id).maybeSingle();
      if (!checkout || checkout.tenant_id !== caller.tenantId) throw new HttpError(404, 'عملية الدفع غير موجودة');

      if (payment.status !== 'paid') {
        await sb.from('billing_checkouts').update({ status: 'failed' }).eq('id', checkout.id).eq('status', 'pending');
        return json({ error: payment.source?.message || 'لم تكتمل عملية الدفع' }, 402);
      }
      await activateFromCheckout(sb, checkout.id, payment);
      return json({ success: true, status: 'active' });
    }

    // ── بدء اشتراك جديد ──
    const planCode = String(body.plan_code || '');
    const token = String(body.moyasar_token || '');
    if (!planCode || !/^token_[A-Za-z0-9]+$/.test(token)) throw new HttpError(400, 'بيانات الدفع غير مكتملة');

    const { plan, promotion, amount } = await resolvePricing(sb, planCode, body.promotion_code || null);

    const { data: checkout, error: chkErr } = await sb.from('billing_checkouts').insert({
      tenant_id: caller.tenantId,
      auth_id: caller.userId,
      billing_plan_id: plan.id,
      promotion_id: promotion?.id || null,
      amount,
      moyasar_token: token,
      status: 'pending',
    }).select().single();
    if (chkErr) throw new Error(chkErr.message);

    const { ok, data: payment } = await moyasarCreatePayment({
      amount: Math.round(amount * 100), // بالهللات
      currency: 'SAR',
      description: `اشتراك فلسي — ${plan.name_ar}${promotion ? ' (عرض ترويجي)' : ''}`,
      callback_url: callbackUrl(),
      source: { type: 'token', token, '3ds': true },
      metadata: { tenant_id: caller.tenantId, checkout_id: checkout.id },
    });

    if (!ok || !payment?.id) {
      await sb.from('billing_checkouts').update({ status: 'failed' }).eq('id', checkout.id);
      return json({ error: payment?.message || 'رفضت بوابة الدفع العملية' }, 402);
    }

    await sb.from('billing_checkouts').update({ moyasar_payment_id: payment.id }).eq('id', checkout.id);

    if (payment.status === 'paid') {
      await activateFromCheckout(sb, checkout.id, payment);
      return json({ success: true, status: 'active' });
    }

    const transactionUrl = payment.source?.transaction_url;
    if (payment.status === 'initiated' && transactionUrl) {
      return json({ requires_action: true, transaction_url: transactionUrl });
    }

    await sb.from('billing_checkouts').update({ status: 'failed' }).eq('id', checkout.id);
    return json({ error: payment.source?.message || 'فشلت عملية الدفع' }, 402);
  } catch (err) {
    return errorResponse(err);
  }
});
