// ══════════════════════════════════════════════════════════════════
// Edge Function: account-manage — إعدادات حساب المنشأة (للمالك فقط)
// ──────────────────────────────────────────────────────────────────
// cancel_subscription يوقف التجديد فقط؛ تظل الخدمة فعّالة حتى نهاية
// الفترة المدفوعة. resume_subscription يعيد التجديد قبل نهاية الفترة.
// delete_account يحذف المنشأة بعد إعادة التحقق من كلمة المرور.
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, requireTenantMember, errorResponse, HttpError } from '../_shared/auth.ts';
import { clientIp, deviceHash, guardCheck, guardRecord, lockedMessage } from '../_shared/security.ts';

async function passwordOk(email: string, password: string): Promise<boolean> {
  const key = Deno.env.get('FELSY_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

async function removeFolder(sb: ReturnType<typeof adminClient>, bucket: string, prefix: string) {
  for (let i = 0; i < 50; i++) {
    const { data } = await sb.storage.from(bucket).list(prefix, { limit: 100 });
    if (!data?.length) return;
    const files = data.filter(f => f.id).map(f => `${prefix}/${f.name}`);
    const dirs = data.filter(f => !f.id).map(f => `${prefix}/${f.name}`);
    for (const d of dirs) await removeFolder(sb, bucket, d);
    if (files.length) await sb.storage.from(bucket).remove(files);
    if (!files.length) return;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const caller = await requireTenantMember(req, sb, null, true);
    if (caller.role !== 'owner') throw new HttpError(403, 'هذه العملية لمالك المنشأة فقط');

    if (action === 'cancel_subscription' || action === 'resume_subscription') {
      const cancel = action === 'cancel_subscription';
      const { data: sub, error: readError } = await sb.from('tenant_subscriptions')
        .select('id, current_period_end, cancel_at_period_end')
        .eq('tenant_id', caller.tenantId)
        .maybeSingle();

      if (readError) throw new HttpError(500, 'تعذر قراءة حالة الاشتراك، حاول مرة أخرى');
      if (!sub) throw new HttpError(404, 'لا يوجد اشتراك');

      const periodEnd = new Date(sub.current_period_end);
      if (!Number.isFinite(periodEnd.getTime())) throw new HttpError(500, 'تاريخ نهاية الاشتراك غير صالح');
      if (periodEnd.getTime() <= Date.now()) {
        throw new HttpError(409, 'انتهت الفترة المدفوعة بالفعل؛ اختر تجديد الاشتراك للمتابعة');
      }

      if (!cancel && !sub.cancel_at_period_end) {
        return json({ ok: true, cancel_at_period_end: false, period_end: sub.current_period_end });
      }
      if (cancel && sub.cancel_at_period_end) {
        return json({ ok: true, cancel_at_period_end: true, period_end: sub.current_period_end });
      }

      const requestedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await sb.from('tenant_subscriptions')
        .update({
          cancel_at_period_end: cancel,
          cancelled_at: cancel ? requestedAt : null,
          cancellation_requested_at: cancel ? requestedAt : null,
          cancellation_effective_at: cancel ? sub.current_period_end : null,
          updated_at: requestedAt,
        })
        .eq('id', sub.id)
        .select('id, cancel_at_period_end, current_period_end')
        .maybeSingle();

      if (updateError || !updated) {
        console.error('[account-manage] subscription cancellation update failed', updateError);
        throw new HttpError(500, 'لم يتم حفظ تغيير الاشتراك. لم نغيّر حالة التجديد؛ حاول مرة أخرى');
      }

      const { error: auditError } = await sb.from('audit_log').insert({
        tenant_id: caller.tenantId,
        action,
        user_id: caller.userId,
        meta: {
          requested_at: requestedAt,
          effective_at: updated.current_period_end,
          cancel_at_period_end: updated.cancel_at_period_end,
        },
      });
      if (auditError) console.error('[account-manage] failed to write cancellation audit event', auditError);

      return json({
        ok: true,
        cancel_at_period_end: updated.cancel_at_period_end,
        period_end: updated.current_period_end,
      });
    }

    if (action === 'delete_account') {
      const ip = clientIp(req);
      const device = await deviceHash(req, body.device_id);
      const guard = await guardCheck(sb, 'login', device, ip, caller.email);
      if (!guard.allowed) return json({ error: lockedMessage(guard.retry_after), code: 'locked' }, 429);

      const { data: t, error: tenantError } = await sb.from('tenants')
        .select('id, account_number').eq('id', caller.tenantId).single();
      if (tenantError || !t) throw new HttpError(500, 'تعذر التحقق من بيانات المنشأة');
      if (String(body.confirm_account ?? '').trim() !== String(t.account_number)) {
        throw new HttpError(400, 'اكتب رقم الحساب بشكل صحيح للتأكيد');
      }
      const ok = caller.email ? await passwordOk(caller.email, String(body.password || '')) : false;
      await guardRecord(sb, 'login', device, ip, caller.email, ok);
      if (!ok) throw new HttpError(400, 'كلمة المرور غير صحيحة');

      for (const bucket of ['uploads', 'media', 'receipts']) {
        await removeFolder(sb, bucket, caller.tenantId).catch(() => {});
      }
      const { data: res, error } = await sb.rpc('delete_tenant_data', { p_tenant: caller.tenantId });
      if (error) throw new HttpError(500, 'تعذر حذف البيانات، تواصل مع الدعم');
      for (const uid of (res?.users ?? []) as string[]) {
        const { count } = await sb.from('tenant_users').select('id', { count: 'exact', head: true }).eq('auth_id', uid);
        if (!count) await sb.auth.admin.deleteUser(uid).catch(() => {});
      }
      return json({ ok: true });
    }

    throw new HttpError(400, 'عملية غير معروفة');
  } catch (err) {
    return errorResponse(err);
  }
});
