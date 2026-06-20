// ══════════════════════════════════════════════════════════════════
// Edge Function: moyasar-webhook
// ══════════════════════════════════════════════════════════════════
// تستقبل هذه الدالة إشعارات موياسر التلقائية (Webhooks) عند تغيّر
// حالة أي دفعة — مهم خصوصاً لحالات 3D Secure التي لا تكتمل فوراً،
// أو لتأكيد دفعات محرك الفوترة الدوري بشكل مزدوج (defense in depth).
//
// اضبط رابط هذه الدالة في لوحة Moyasar → Webhooks:
//   https://YOUR_PROJECT.supabase.co/functions/v1/moyasar-webhook
//
// المتطلبات (Supabase Secrets):
//   MOYASAR_WEBHOOK_SECRET — السر المشترك الذي تضبطه بنفس القيمة
//                            في لوحة Moyasar (للتحقق من صحة المصدر)
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-moyasar-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── التحقق من السر المشترك (إن كان مضبوطاً) ──
    const expectedSecret = Deno.env.get('MOYASAR_WEBHOOK_SECRET');
    if (expectedSecret) {
      const provided = req.headers.get('x-moyasar-secret') || new URL(req.url).searchParams.get('secret');
      if (provided !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'غير مصرح' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload = await req.json();
    const eventType = payload?.type || payload?.event || 'unknown';
    const paymentData = payload?.data || payload;
    const paymentId = paymentData?.id;

    // ── تسجيل الحدث الخام دائماً (للتدقيق، حتى لو فشل المعالجة) ──
    await supabase.from('moyasar_webhook_events').insert({
      event_type: eventType,
      payment_id: paymentId,
      raw_payload: payload,
      processed: false,
    });

    if (!paymentId) {
      return new Response(JSON.stringify({ success: true, note: 'لا يوجد payment_id بالحدث' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── تحديث الفاتورة المرتبطة بهذه الدفعة (إن وُجدت) ──
    const status = paymentData?.status; // paid | failed | ...
    if (status === 'paid' || status === 'failed') {
      const { data: invoice } = await supabase
        .from('billing_invoices')
        .select('id, subscription_id, tenant_id')
        .eq('moyasar_payment_id', paymentId)
        .maybeSingle();

      if (invoice) {
        await supabase.from('billing_invoices').update({
          status: status === 'paid' ? 'paid' : 'failed',
          paid_at: status === 'paid' ? new Date().toISOString() : null,
        }).eq('id', invoice.id);

        // إن نجحت الدفعة وكان الاشتراك معلّقاً بسبب فشل سابق، نعيده نشطاً
        if (status === 'paid') {
          await supabase.from('tenant_subscriptions')
            .update({ status: 'active', failed_attempts: 0 })
            .eq('id', invoice.subscription_id)
            .in('status', ['past_due', 'suspended']);
        }
      }
    }

    await supabase.from('moyasar_webhook_events')
      .update({ processed: true })
      .eq('payment_id', paymentId)
      .eq('processed', false);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[moyasar-webhook]', err);
    // نرجّع 200 دائماً لموياسر حتى لو حصل خطأ داخلي، لتجنب إعادة محاولات
    // لا نهائية من جهتهم على نفس الحدث — الخطأ مسجّل بالـ logs للمراجعة
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
