// ══════════════════════════════════════════════════════════════════
// Edge Function: zatca-einvoice — الربط مع منصة فاتورة (المرحلة الثانية)
// ──────────────────────────────────────────────────────────────────
//  status     (عضو)        حالة الربط للفرع
//  onboard    (مالك/مدير)  ربط الفرع: OTP من بوابة فاتورة ⇒ شهادة إنتاجية
//  issue      (عضو)        توقيع وإرسال فاتورة/إشعار دائن ⇒ يرجع QR للطباعة
//  selftest   (مالك/مدير)  اختبار على بيئة المطورين الحقيقية للهيئة (بدون حفظ)
//  retry      (cron)       Authorization: Bearer <ZATCA_CRON_SECRET>
// انشر بـ: supabase functions deploy zatca-einvoice --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, requireTenantMember, errorResponse, HttpError } from '../_shared/auth.ts';
import { issue, onboardEgs, processPending, sandboxSelfTest, type Db, type Env, EngineError } from '../_shared/zatca-engine.ts';

const UUID = /^[0-9a-f-]{36}$/i;

function dbOf(sb: ReturnType<typeof adminClient>): Db {
  return {
    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return data as any;
    },
  };
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function branchOfCaller(sb: ReturnType<typeof adminClient>, tenantId: string, branchId: unknown) {
  if (typeof branchId !== 'string' || !UUID.test(branchId)) throw new HttpError(400, 'اختر الفرع');
  const { data } = await sb.from('branches').select('id').eq('id', branchId).eq('tenant_id', tenantId).maybeSingle();
  if (!data) throw new HttpError(403, 'الفرع لا يتبع منشأتك');
  return branchId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const sb = adminClient();
    const db = dbOf(sb);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ── دورة الإعادة (مجدولة) ──
    if (action === 'retry') {
      const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!safeEqual(given, Deno.env.get('ZATCA_CRON_SECRET') || '')) throw new HttpError(401, 'unauthorized');
      return json(await processPending(db, {}, 100));
    }

    if (action === 'issue') {
      const caller = await requireTenantMember(req, sb, null, false);
      const kind = body.kind === 'credit' ? 'credit' : 'invoice';
      if (!UUID.test(String(body.id || ''))) throw new HttpError(400, 'معرّف غير صحيح');
      // deno-lint-ignore no-explicit-any
      const doc: any = await db.rpc('zatca_load_doc', { p_kind: kind, p_id: body.id });
      if (!doc || doc.tenant_id !== caller.tenantId) throw new HttpError(404, 'المستند غير موجود');
      // deno-lint-ignore no-explicit-any
      const egs: any = await db.rpc('zatca_load_egs', { p_branch: doc.branch_id });
      if (!egs || egs.onboarding_status !== 'active') return json({ status: 'not_onboarded' });
      const r = await issue(db, kind, body.id);
      return json(r);
    }

    if (action === 'status') {
      const caller = await requireTenantMember(req, sb, null, false);
      const branch = await branchOfCaller(sb, caller.tenantId, body.branch_id);
      const { data } = await sb.from('zatca_config')
        .select('business_name, vat_number, cr_number, branch_name, address_street, address_building, address_district, address_city, address_postal, short_address, industry, invoice_types, environment, onboarding_status, onboarding_error, invoice_counter, pcsid_expires_at, activated_at')
        .eq('branch_id', branch).maybeSingle();
      return json({ config: data });
    }

    if (action === 'onboard') {
      const caller = await requireTenantMember(req, sb, null, true);
      const branch = await branchOfCaller(sb, caller.tenantId, body.branch_id);
      const otp = String(body.otp || '').trim();
      if (!/^\d{6}$/.test(otp)) throw new HttpError(400, 'رمز OTP من بوابة فاتورة: 6 أرقام');
      const env: Env = body.environment === 'simulation' ? 'simulation' : 'production';
      // deno-lint-ignore no-explicit-any
      const egs: any = await db.rpc('zatca_load_egs', { p_branch: branch });
      if (!egs) throw new HttpError(400, 'أكمل بيانات المنشأة والعنوان الوطني أولاً');
      if (egs.onboarding_status === 'active' && egs.environment === 'production' && !body.force) {
        throw new HttpError(409, 'الفرع مربوط مسبقاً — إعادة الربط تبدأ سلسلة فواتير جديدة');
      }
      const r = await onboardEgs(egs, otp, env);
      if (!r.ok || !r.store) {
        const last = r.steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.detail ?? ''}`).join(' | ');
        await db.rpc('zatca_store_egs', { p_branch: branch, p: { onboarding_status: 'failed', onboarding_error: last.slice(0, 900) } });
        return json({ ok: false, steps: r.steps }, 400);
      }
      await db.rpc('zatca_store_egs', { p_branch: branch, p: r.store });
      await sb.from('audit_log').insert({ tenant_id: caller.tenantId, action: 'zatca_onboard', user_id: caller.userId, meta: { branch, env } }).then(() => {}, () => {});
      return json({ ok: true, steps: r.steps });
    }

    if (action === 'selftest') {
      await requireTenantMember(req, sb, null, true);
      return json(await sandboxSelfTest());
    }

    throw new HttpError(400, 'عملية غير معروفة');
  } catch (err) {
    if (err instanceof EngineError) return json({ error: err.message, code: err.code }, err.retryable ? 503 : 400);
    return errorResponse(err);
  }
});
