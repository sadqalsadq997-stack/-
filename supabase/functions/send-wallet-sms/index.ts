// ══════════════════════════════════════════════════════════════════
// Edge Function: send-wallet-sms
// ══════════════════════════════════════════════════════════════════
// يرسل رسالة SMS للعميل تحتوي على رابط بطاقة الولاء + عنوان الفرع.
// مصمم ليكون مزوّد-agnostic (يعمل مع أي مزود SMS عبر REST API) —
// يكفي ضبط الإعدادات في Supabase Secrets دون تعديل الكود لاحقاً:
//
//   SMS_PROVIDER_URL      — رابط REST الخاص بمزود الـ SMS
//   SMS_PROVIDER_API_KEY  — مفتاح API
//   SMS_PROVIDER_AUTH_HEADER — اسم الهيدر (مثال: Authorization)
//
// ملاحظة: لم نختر مزوداً معيناً الآن لأنك لم تحدد أحداً بعد. عند
// اختيارك مزوداً (مثل Unifonic أو Taqnyat أو Twilio)، فقط نضبط
// 3 الأسطر اللي تكوّن body الطلب — لا حاجة لإعادة بناء أي شيء آخر.
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id, wallet_pass_id } = await req.json();

    if (!tenant_id || !wallet_pass_id) {
      return new Response(JSON.stringify({ error: 'tenant_id و wallet_pass_id مطلوبان' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: wErr } = await supabase
      .from('wallet_passes')
      .select('*, customers(name, phone, branch_id)')
      .eq('id', wallet_pass_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (wErr || !wallet) {
      return new Response(JSON.stringify({ error: 'البطاقة غير موجودة' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const phone = wallet.customers?.phone;
    if (!phone) {
      return new Response(JSON.stringify({ error: 'لا يوجد رقم جوال مسجّل لهذا العميل' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    let branchAddress = '';
    if (wallet.customers?.branch_id) {
      const { data: branch } = await supabase
        .from('branches')
        .select('notification_address_ar, notification_sms_sender, notification_phone_country')
        .eq('id', wallet.customers.branch_id)
        .maybeSingle();
      branchAddress = branch?.notification_address_ar || '';
    }

    const appUrl = Deno.env.get('APP_PUBLIC_URL') || 'https://felsy.org';
    const qrPageUrl = `${appUrl}/wallet/${wallet.qr_token}`;

    const message = branchAddress
      ? `بطاقة ولائك جاهزة 🎁 ${branchAddress} — أضفها لجوالك: ${qrPageUrl}`
      : `بطاقة ولائك جاهزة 🎁 أضفها لجوالك: ${qrPageUrl}`;

    // تسجيل محاولة الإرسال في قاعدة البيانات أولاً (pending)
    const { data: notif } = await supabase.from('wallet_notifications')
      .insert({ tenant_id, wallet_pass_id, channel: 'sms', to_phone: phone, message, status: 'pending' })
      .select().single();

    const providerUrl    = Deno.env.get('SMS_PROVIDER_URL');
    const providerApiKey = Deno.env.get('SMS_PROVIDER_API_KEY');

    if (!providerUrl || !providerApiKey) {
      // لم يتم ربط مزود SMS بعد — نُعيد الرابط نفسه ليُستخدم يدوياً (واتساب/نسخ) دون فشل العملية
      if (notif) {
        await supabase.from('wallet_notifications')
          .update({ status: 'failed', error_message: 'مزود SMS غير مضبوط بعد (SMS_PROVIDER_URL/API_KEY)' })
          .eq('id', notif.id);
      }
      return new Response(JSON.stringify({
        success: false,
        sms_sent: false,
        reason: 'مزود SMS غير مضبوط بعد — هذا الرابط جاهز للإرسال اليدوي أو عبر واتساب',
        message, qr_page_url: qrPageUrl,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    try {
      const smsRes = await fetch(providerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${providerApiKey}` },
        body: JSON.stringify({ to: phone, message }),
      });

      if (!smsRes.ok) throw new Error(await smsRes.text());

      if (notif) {
        await supabase.from('wallet_notifications').update({ status: 'sent' }).eq('id', notif.id);
      }

      return new Response(JSON.stringify({ success: true, sms_sent: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (smsErr) {
      if (notif) {
        await supabase.from('wallet_notifications')
          .update({ status: 'failed', error_message: String(smsErr?.message || smsErr) })
          .eq('id', notif.id);
      }
      throw smsErr;
    }

  } catch (err) {
    console.error('[send-wallet-sms]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
