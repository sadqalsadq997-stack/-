// ══════════════════════════════════════════════════════════════════
// Edge Function: verify-owner-pin — دخول لوحة مالك النظام (/owner)
// • الرمز لا يُخزَّن في الكود: OWNER_PIN_HASH في Supabase Secrets
//   = sha256( الرمز + ":felsy-owner" ) بصيغة hex
// • 10 محاولات خاطئة لكل جهاز ثم قفل 30 دقيقة (+ سقف 50 لكل IP)
// • الجلسة 4 ساعات ومربوطة بنفس الجهاز
// انشر بـ: supabase functions deploy verify-owner-pin --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, errorResponse, HttpError } from '../_shared/auth.ts';
import { clientIp, deviceHash, guardCheck, guardRecord, lockedMessage, sha256Hex } from '../_shared/security.ts';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    const hash = String(body.hash || '').toLowerCase();
    const ip = clientIp(req);
    const device = await deviceHash(req, body.device_id);

    const OWNER_PIN_HASH = (Deno.env.get('OWNER_PIN_HASH') || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(OWNER_PIN_HASH)) throw new HttpError(503, 'لوحة المالك غير مهيأة');

    const guard = await guardCheck(sb, 'owner', device, ip, 'owner');
    if (!guard.allowed) {
      return json({ error: lockedMessage(guard.retry_after), code: 'locked', retry_after: guard.retry_after }, 429);
    }

    const ok = /^[0-9a-f]{64}$/.test(hash) && timingSafeEqual(hash, OWNER_PIN_HASH);
    await guardRecord(sb, 'owner', device, ip, 'owner', ok);
    await sb.from('security_events').insert({ event_type: 'owner_login_attempt', ip_address: ip, success: ok });

    if (!ok) {
      const after = await guardCheck(sb, 'owner', device, ip, 'owner');
      if (!after.allowed) return json({ error: lockedMessage(after.retry_after), code: 'locked', retry_after: after.retry_after }, 429);
      return json({ error: 'رمز الدخول خاطئ', code: 'invalid', remaining: after.remaining }, 401);
    }

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    await sb.from('owner_sessions').insert({
      token_hash: await sha256Hex(token),
      ip_address: ip,
      device_hash: device,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    });
    return json({ token });
  } catch (err) {
    return errorResponse(err);
  }
});
