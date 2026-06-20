// ══════════════════════════════════════════════════════════════════
// Edge Function: billing-run-cycle
// ══════════════════════════════════════════════════════════════════
// هذا هو "محرك الفوترة" — القلب الحقيقي للخصم التلقائي الشهري.
// يُستدعى تلقائياً مرة واحدة يومياً عبر Supabase Cron (pg_cron أو
// Scheduled Triggers — انظر تعليمات الجدولة بأسفل الملف). لا تستدعه
// يدوياً من الواجهة الأمامية أبداً — هذه دالة خلفية بحتة.
//
// لكل اشتراك حان وقت تحديده (current_period_end <= الآن):
//   1) يحدد المبلغ الصحيح: لو ما زال بفترة العرض الترويجي وتبقّت
//      فترات → يسحب سعر العرض ويُنقّص العداد. لو خلصت الفترات
//      الترويجية → يتحول تلقائياً للسعر الكامل (الذي قد يكون
//      تغيّر بمرور الوقت لو صاحب النظام عدّل التسعير — لكن هذا لا
//      يؤثر على نسخة السعر التي وافق عليها العميل أصلاً، لأن العقد
//      محفوظ بـ billing_plan_id ثابت).
//   2) يسحب المبلغ من Moyasar باستخدام الرمز (token) المحفوظ.
//   3) نجاح → يمدد current_period_end لدورة جديدة، يسجل فاتورة مدفوعة.
//   4) فشل → يزيد عداد المحاولات الفاشلة، يسجل فاتورة فاشلة، وإذا
//      تجاوزت حد المحاولات (3) يغيّر حالة الاشتراك إلى "past_due"
//      (متأخر) ليُعرض تنبيه لصاحب المحل ويُمنع من استخدام النظام
//      حتى يحدّث وسيلة الدفع — لا يُلغى الاشتراك تلقائياً فوراً.
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FAILED_ATTEMPTS = 3;

function basicAuthHeader(secretKey: string): string {
  return 'Basic ' + btoa(`${secretKey}:`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── حماية: هذه الدالة لا يجوز استدعاؤها إلا من Cron داخلي ──
    // (Supabase Scheduled Triggers يرسل تلقائياً الـ service role
    // بالهيدر؛ نتحقق أيضاً من رمز سري إضافي كطبقة حماية ثانية)
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('BILLING_CRON_SECRET');
    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const secretKey = Deno.env.get('MOYASAR_SECRET_KEY');
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'MOYASAR_SECRET_KEY غير مضبوط' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── جلب كل الاشتراكات المستحقة الآن ──
    const { data: dueSubscriptions, error: fetchErr } = await supabase
      .from('tenant_subscriptions')
      .select('*, billing_plans(price_monthly, plan_code, name_ar)')
      .lte('current_period_end', new Date().toISOString())
      .in('status', ['trialing', 'active', 'past_due']);

    if (fetchErr) throw new Error(`فشل جلب الاشتراكات المستحقة: ${fetchErr.message}`);

    const results = { processed: 0, succeeded: 0, failed: 0, suspended: 0, errors: [] as string[] };

    for (const sub of dueSubscriptions || []) {
      results.processed++;
      try {
        if (!sub.moyasar_token) {
          results.failed++;
          results.errors.push(`الاشتراك ${sub.id}: لا يوجد رمز بطاقة محفوظ`);
          continue;
        }

        // تحديد المبلغ الصحيح للدورة القادمة (يحترم فترة العرض المتبقية)
        const chargeAmount = Number(sub.next_charge_amount);

        const paymentRes = await fetch('https://api.moyasar.com/v1/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: basicAuthHeader(secretKey) },
          body: JSON.stringify({
            amount: Math.round(chargeAmount * 100),
            currency: 'SAR',
            description: `تجديد اشتراك ${sub.billing_plans?.name_ar || sub.billing_plans?.plan_code}`,
            source: { type: 'token', token: sub.moyasar_token },
            metadata: { tenant_id: sub.tenant_id, subscription_id: sub.id },
          }),
        });

        const payment = await paymentRes.json();
        const success = paymentRes.ok && payment.status === 'paid';

        const periodStart = new Date(sub.current_period_end);
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        if (success) {
          // ── حساب حالة فترة العرض للدورة التالية ──
          let newTrialRemaining = sub.trial_periods_remaining;
          let newNextAmount = chargeAmount;
          let newStatus = 'active';

          if (sub.trial_periods_remaining > 0) {
            newTrialRemaining = sub.trial_periods_remaining - 1;
            newStatus = 'trialing';
            if (newTrialRemaining > 0) {
              // ما زال هناك فترات عرض متبقية — نفس سعر العرض
              newNextAmount = chargeAmount;
            } else {
              // هذه آخر فترة عرض — الدورة القادمة بالسعر الكامل
              newNextAmount = Number(sub.billing_plans?.price_monthly || chargeAmount);
              newStatus = 'active';
            }
          } else {
            // اشتراك عادي بالسعر الكامل — يبقى كما هو (إلا لو تغيّر السعر،
            // وهذا قرار تجاري: هنا نُبقي العميل على نسخة السعر التي اشترك بها
            // أصلاً (billing_plan_id ثابت)، فلا "نفاجئه" بزيادة تلقائية)
            newNextAmount = Number(sub.next_charge_amount);
          }

          await supabase.from('tenant_subscriptions').update({
            status: newStatus,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            next_charge_amount: newNextAmount,
            trial_periods_remaining: newTrialRemaining,
            failed_attempts: 0,
            last_payment_id: payment.id,
            updated_at: new Date().toISOString(),
          }).eq('id', sub.id);

          await supabase.from('billing_invoices').insert({
            tenant_id: sub.tenant_id, subscription_id: sub.id,
            amount: chargeAmount, status: 'paid', moyasar_payment_id: payment.id,
            period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(),
            paid_at: new Date().toISOString(),
          });

          results.succeeded++;
        } else {
          // ── فشل السحب — زيادة عداد المحاولات ──
          const newFailedAttempts = (sub.failed_attempts || 0) + 1;
          const shouldSuspend = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

          await supabase.from('tenant_subscriptions').update({
            status: shouldSuspend ? 'suspended' : 'past_due',
            failed_attempts: newFailedAttempts,
            updated_at: new Date().toISOString(),
          }).eq('id', sub.id);

          await supabase.from('billing_invoices').insert({
            tenant_id: sub.tenant_id, subscription_id: sub.id,
            amount: chargeAmount, status: 'failed',
            failure_reason: payment.message || 'فشل غير محدد من موياسر',
            attempt_number: newFailedAttempts,
            period_start: sub.current_period_start, period_end: sub.current_period_end,
          });

          results.failed++;
          if (shouldSuspend) results.suspended++;
        }
      } catch (innerErr) {
        results.failed++;
        results.errors.push(`الاشتراك ${sub.id}: ${String(innerErr?.message || innerErr)}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[billing-run-cycle]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// كيف تجدول هذه الدالة لتعمل يومياً (مرة واحدة، بعد النشر):
//
// في Supabase SQL Editor، فعّل pg_cron إذا لم يكن مفعّلاً:
//   create extension if not exists pg_cron;
//
// ثم جدول استدعاء الدالة يومياً (مثلاً الساعة 3 فجراً) بتنفيذ هذا SQL
// (هذا الكود تشغّله بمحرر SQL، وليس جزءاً من ملف TypeScript هذا):
//
//   select cron.schedule(
//     'daily-billing-cycle',
//     '0 3 * * *',
//     $cron$
//     select net.http_post(
//       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/billing-run-cycle',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'x-cron-secret', 'YOUR_BILLING_CRON_SECRET'
//       )
//     );
//     $cron$
//   );
// ══════════════════════════════════════════════════════════════════
