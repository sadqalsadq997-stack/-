// ══════════════════════════════════════════════════════════════════
// أدوات مشتركة للتحقق من هوية المستدعي في Edge Functions
// ──────────────────────────────────────────────────────────────────
// مفتاح anon العام صالح كـ JWT، لذلك "verify_jwt" وحده لا يكفي.
// هنا نتحقق أن المستدعي مستخدم حقيقي مسجّل، وأنه عضو فعّال في
// المنشأة التي يطلب العمل عليها — ولا نثق أبداً بـ tenant_id القادم
// من جسم الطلب بدون هذا التحقق.
// ══════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

export interface Caller {
  userId: string;
  email: string | null;
  tenantId: string;
  role: string;
}

const MANAGER_ROLES = ['owner', 'admin'];

/**
 * يتحقق من الـ JWT ويرجع المنشأة التي ينتمي لها المستخدم.
 * @param requestedTenantId إن مُرّر، يجب أن يطابق منشأة المستخدم
 * @param managersOnly      true = يسمح فقط لمالك/مدير المنشأة
 */
export async function requireTenantMember(
  req: Request,
  sb: SupabaseClient,
  requestedTenantId?: string | null,
  managersOnly = true,
): Promise<Caller> {
  const header = req.headers.get('Authorization') || '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new HttpError(401, 'يجب تسجيل الدخول');

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) throw new HttpError(401, 'جلسة غير صالحة — سجّل دخولك من جديد');

  let q = sb.from('tenant_users')
    .select('tenant_id, role')
    .eq('auth_id', user.id)
    .eq('is_active', true);
  if (requestedTenantId) q = q.eq('tenant_id', requestedTenantId);

  const { data: memberships, error: mErr } = await q.limit(1);
  if (mErr) throw new HttpError(500, 'تعذر التحقق من المنشأة');
  const m = memberships?.[0];
  if (!m) throw new HttpError(403, 'هذا الحساب غير مرتبط بالمنشأة المطلوبة');
  if (managersOnly && !MANAGER_ROLES.includes(m.role)) {
    throw new HttpError(403, 'هذه العملية متاحة لمالك المنشأة فقط');
  }

  return { userId: user.id, email: user.email ?? null, tenantId: m.tenant_id, role: m.role };
}

/** يرجع true إذا كان للمنشأة اشتراك فعّال الآن */
export async function tenantHasActiveSubscription(sb: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await sb.from('tenant_subscriptions')
    .select('status, current_period_end')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return false;
  return ['active', 'trialing'].includes(data.status) && new Date(data.current_period_end) > new Date();
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: 'حدث خطأ غير متوقع' }, 500);
}
