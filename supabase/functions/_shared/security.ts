// ══════════════════════════════════════════════════════════════════
// أدوات أمان مشتركة: هوية الجهاز، IP، حدود المحاولات، جلسة مالك النظام،
// والتحقق أن الفرع المطلوب يتبع منشأة المستدعي.
// ══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { HttpError, requireTenantMember, type Caller } from './auth.ts';

export async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** أول IP حقيقي في الطلب (الوكيل يضع x-felsy-client-ip) */
export function clientIp(req: Request): string {
  const raw = req.headers.get('x-felsy-client-ip')
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')
    || 'unknown';
  return raw.split(',')[0].trim().slice(0, 64);
}

/** بصمة الجهاز = معرّف عشوائي محفوظ في الجهاز + نوع المتصفح، مهشّرة */
export async function deviceHash(req: Request, deviceId: unknown): Promise<string> {
  const id = typeof deviceId === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(deviceId) ? deviceId : 'no-device';
  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  return sha256Hex(`${id}|${ua}`);
}

export interface GuardResult { allowed: boolean; remaining: number; retry_after: number }

export async function guardCheck(sb: SupabaseClient, kind: string, device: string, ip: string, subject: string | null): Promise<GuardResult> {
  const { data, error } = await sb.rpc('login_guard_check', { p_kind: kind, p_device: device, p_ip: ip, p_subject: subject });
  if (error) throw new HttpError(500, 'تعذر التحقق من محاولات الدخول');
  return data as GuardResult;
}

export async function guardRecord(sb: SupabaseClient, kind: string, device: string, ip: string, subject: string | null, success: boolean) {
  await sb.rpc('login_guard_record', { p_kind: kind, p_device: device, p_ip: ip, p_subject: subject, p_success: success });
}

export function lockedMessage(retryAfter: number): string {
  const mins = Math.max(1, Math.ceil(retryAfter / 60));
  return `تم إيقاف الدخول من هذا الجهاز بعد 10 محاولات خاطئة — حاول بعد ${mins} دقيقة`;
}

/** يتأكد أن الفرع يتبع منشأة المستدعي (يمنع العمل على فروع منشأة أخرى) */
export async function requireBranchOfCaller(sb: SupabaseClient, caller: Caller, branchId: unknown): Promise<string> {
  if (typeof branchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(branchId)) {
    throw new HttpError(400, 'معرّف الفرع غير صحيح');
  }
  const { data } = await sb.from('branches').select('id, tenant_id').eq('id', branchId).maybeSingle();
  if (!data || data.tenant_id !== caller.tenantId) throw new HttpError(403, 'هذا الفرع لا يتبع منشأتك');
  return branchId;
}

/** للدوال التي تعمل على فرع: عضو مسجّل + الفرع من منشأته */
export async function requireBranchMember(req: Request, sb: SupabaseClient, branchId: unknown, managersOnly = false) {
  const caller = await requireTenantMember(req, sb, null, managersOnly);
  if (branchId !== undefined && branchId !== null && branchId !== '') {
    await requireBranchOfCaller(sb, caller, branchId);
  }
  return caller;
}

/** جلسة مالك النظام: توكن صادر من verify-owner-pin ومربوط بنفس الجهاز */
export async function requireOwner(req: Request, sb: SupabaseClient, ownerToken: unknown, deviceId: unknown): Promise<void> {
  if (typeof ownerToken !== 'string' || ownerToken.length < 40) throw new HttpError(401, 'انتهت الجلسة — سجّل دخولك من جديد');
  const tokenHash = await sha256Hex(ownerToken);
  const { data } = await sb.from('owner_sessions')
    .select('id, expires_at, device_hash')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) throw new HttpError(401, 'انتهت الجلسة — سجّل دخولك من جديد');
  const dev = await deviceHash(req, deviceId);
  if (data.device_hash && data.device_hash !== dev) throw new HttpError(401, 'الجلسة مرتبطة بجهاز آخر');
}
