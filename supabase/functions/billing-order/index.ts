// ══════════════════════════════════════════════════════════════════
// Edge Function: billing-order — الاشتراك من الموقع (خطوات التسجيل)
// ──────────────────────────────────────────────────────────────────
//  signup          (بدون دخول) ينشئ الحساب + المنشأة + طلب الاشتراك ويرجع جلسة
//  create_order    (مسجّل) طلب جديد لمنشأة موجودة (تجديد / ترقية / فروع إضافية)
//  attach_payment  (مسجّل) يحفظ رقم دفعة موياسر على الطلب فور إنشائها
//  verify_card     (مسجّل) يتأكد من موياسر مباشرة أن الدفعة "paid" وبنفس المبلغ ثم يفعّل
//  submit_transfer (مسجّل) يسجّل إيصال التحويل البنكي → بانتظار مراجعة المالك
//  my_orders       (مسجّل) آخر طلبات المنشأة
//
// السعر يُحسب في القاعدة فقط (billing_quote) — لا نثق بأي مبلغ من المتصفح.
// انشر بـ: supabase functions deploy billing-order --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, requireTenantMember, errorResponse, HttpError } from '../_shared/auth.ts';
import { clientIp, deviceHash, guardCheck, guardRecord, lockedMessage, sha256Hex } from '../_shared/security.ts';
import { moyasarFetchPayment, activateOrderFromPayment } from '../_shared/billing.ts';

const PLAN_RE = /^[a-z0-9_-]{2,32}$/;

function cleanText(v: unknown, max: number): string {
  return String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}

/** يقبل 05XXXXXXXX أو 5XXXXXXXX أو +9665XXXXXXXX ويرجع 05XXXXXXXX */
function saudiMobile(v: unknown): string {
  const d = String(v ?? '').replace(/[\s-]/g, '').replace(/^\+?966/, '0').replace(/^5/, '05');
  if (!/^05\d{8}$/.test(d)) throw new HttpError(400, 'أدخل رقم جوال سعودي صحيحاً، مثل 0551234567');
  return d;
}

function orderParams(body: Record<string, unknown>) {
  const plan = String(body.plan_code || '');
  const branches = Math.trunc(Number(body.branches));
  const months = Math.trunc(Number(body.months));
  if (!PLAN_RE.test(plan)) throw new HttpError(400, 'اختر الباقة');
  if (!(branches >= 1 && branches <= 100)) throw new HttpError(400, 'عدد الفروع غير صحيح');
  if (!(months >= 1 && months <= 36)) throw new HttpError(400, 'مدة الاشتراك غير صحيحة');
  return { plan, branches, months };
}

function publicOrder(o: Record<string, any>) {
  return {
    id: o.id, order_number: o.order_number, plan_code: o.plan_code, branches: o.branches, months: o.months,
    amount: Number(o.amount), quote: o.quote, status: o.status, method: o.method, created_at: o.created_at,
    review_note: o.review_note ?? null,
  };
}

async function passwordSession(email: string, password: string) {
  const key = Deno.env.get('FELSY_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ── إنشاء حساب جديد من الموقع ──────────────────────────────
    if (action === 'signup') {
      const ip = clientIp(req);
      const device = await deviceHash(req, body.device_id);
      const guard = await guardCheck(sb, 'signup', device, ip, null);
      if (!guard.allowed) return json({ error: lockedMessage(guard.retry_after), code: 'locked' }, 429);
      await guardRecord(sb, 'signup', device, ip, null, false); // كل محاولة تسجيل تُحسب

      const { plan, branches, months } = orderParams(body);
      const name = cleanText(body.name, 80);
      const business = cleanText(body.business_name, 80);
      const phone = saudiMobile(body.phone);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (name.length < 2) throw new HttpError(400, 'الاسم مطلوب');
      if (business.length < 2) throw new HttpError(400, 'اسم النشاط التجاري مطلوب');
      if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
      if (password.length < 8 || password.length > 72) throw new HttpError(400, 'كلمة المرور لازم تكون 8 أحرف على الأقل');

      // نتحقق من السعر قبل إنشاء أي شيء (باقة/مدة غير صالحة = لا حساب)
      const { error: qErr } = await sb.rpc('billing_quote', { p_plan_code: plan, p_branches: branches, p_months: months });
      if (qErr) throw new HttpError(400, qErr.message);

      const { data: created, error: uErr } = await sb.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: name, phone, business_name: business },
      });
      if (uErr || !created?.user) {
        if (/already|registered|exists/i.test(uErr?.message || '')) {
          throw new HttpError(409, 'هذا البريد مسجّل عندنا — سجّل دخولك وأكمل الدفع من داخل حسابك');
        }
        throw new HttpError(400, 'تعذر إنشاء الحساب — تأكد من البيانات وحاول مرة ثانية');
      }
      const uid = created.user.id;

      try {
        const { data: tenant, error: tErr } = await sb.from('tenants').insert({
          name: business, name_ar: business, status: 'pending_payment', plan: 'none',
          owner_auth_id: uid, contact_email: email, contact_phone: phone,
        }).select('id').single();
        if (tErr) throw tErr;
        const { error: tuErr } = await sb.from('tenant_users').insert({ tenant_id: tenant.id, auth_id: uid, role: 'owner' });
        if (tuErr) throw tuErr;

        const { data: order, error: oErr } = await sb.rpc('billing_create_order', {
          p_tenant: tenant.id, p_auth: uid, p_plan_code: plan, p_branches: branches, p_months: months,
        });
        if (oErr) throw oErr;

        const session = await passwordSession(email, password);
        await sb.from('security_events').insert({
          event_type: 'signup', user_id: uid, ip_address: ip, success: true,
          meta: { order: order.order_number, subject: await sha256Hex(email) },
        });
        return json({ session, order: publicOrder(order) });
      } catch (e) {
        // لا نترك حساباً نصف مكتمل
        await sb.auth.admin.deleteUser(uid).catch(() => {});
        throw e instanceof HttpError ? e : new HttpError(500, 'تعذر إكمال التسجيل — حاول مرة ثانية');
      }
    }

    // ── باقي العمليات تحتاج مستخدم مسجّل (مالك/مدير المنشأة) ────
    const caller = await requireTenantMember(req, sb, null, true);

    async function ownOrder(id: unknown) {
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'رقم الطلب غير صحيح');
      const { data } = await sb.from('billing_orders').select('*').eq('id', id).maybeSingle();
      if (!data || data.tenant_id !== caller.tenantId) throw new HttpError(404, 'الطلب غير موجود');
      return data;
    }

    switch (action) {
      case 'create_order': {
        const { plan, branches, months } = orderParams(body);
        const { data: order, error } = await sb.rpc('billing_create_order', {
          p_tenant: caller.tenantId, p_auth: caller.userId, p_plan_code: plan, p_branches: branches, p_months: months,
        });
        if (error) throw new HttpError(400, error.message);
        return json({ order: publicOrder(order) });
      }

      case 'attach_payment': {
        const order = await ownOrder(body.order_id);
        const pid = String(body.payment_id || '');
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(pid)) throw new HttpError(400, 'رقم الدفعة غير صحيح');
        if (order.status === 'awaiting_payment') {
          await sb.from('billing_orders').update({ moyasar_payment_id: pid, method: 'card' })
            .eq('id', order.id).eq('status', 'awaiting_payment').is('moyasar_payment_id', null);
        }
        return json({ ok: true });
      }

      case 'verify_card': {
        const order = await ownOrder(body.order_id);
        if (order.status === 'paid') return json({ status: 'paid', order: publicOrder(order) });
        const payment = await moyasarFetchPayment(String(body.payment_id || ''));
        const result = await activateOrderFromPayment(sb, order, payment);
        if (!result.ok) return json({ error: result.message, status: payment?.status }, 402);
        const { data: fresh } = await sb.from('billing_orders').select('*').eq('id', order.id).single();
        return json({ status: 'paid', order: publicOrder(fresh) });
      }

      case 'submit_transfer': {
        const order = await ownOrder(body.order_id);
        if (!['awaiting_payment', 'rejected'].includes(order.status)) throw new HttpError(400, 'هذا الطلب لا يقبل إيصالاً الآن');
        const path = String(body.receipt_path || '');
        const ok = path.startsWith(`${caller.tenantId}/`) && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{5,120}$/.test(path);
        if (!ok) throw new HttpError(400, 'ارفع إيصال التحويل أولاً');
        const folder = path.split('/')[0];
        const file = path.split('/').slice(1).join('/');
        const { data: listed } = await sb.storage.from('receipts').list(folder, { search: file, limit: 1 });
        if (!listed?.some((f: { name: string }) => f.name === file)) throw new HttpError(400, 'ما لقينا ملف الإيصال — ارفعه مرة ثانية');

        const date = String(body.transfer_date || '');
        await sb.from('billing_orders').update({
          status: 'pending_review', method: 'transfer', receipt_path: path,
          transfer_sender: cleanText(body.sender_name, 80) || null,
          transfer_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
          transfer_note: cleanText(body.note, 300) || null,
          submitted_at: new Date().toISOString(), review_note: null,
        }).eq('id', order.id);
        const { data: fresh } = await sb.from('billing_orders').select('*').eq('id', order.id).single();
        return json({ order: publicOrder(fresh) });
      }

      case 'my_orders': {
        const { data } = await sb.from('billing_orders').select('*')
          .eq('tenant_id', caller.tenantId).order('created_at', { ascending: false }).limit(10);
        return json({ orders: (data || []).map(publicOrder) });
      }

      default:
        throw new HttpError(400, 'عملية غير معروفة');
    }
  } catch (err) {
    return errorResponse(err);
  }
});
