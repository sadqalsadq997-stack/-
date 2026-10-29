// ══════════════════════════════════════════════════════════════════
// Edge Function: auth-login
// تسجيل دخول صاحب المنشأة بالبريد وكلمة المرور — مع حد 10 محاولات
// خاطئة لكل جهاز (ثم قفل 30 دقيقة)، وسقف للحساب (20) وللـ IP (50).
// الوكيل في Vercel يمنع تسجيل الدخول المباشر بكلمة المرور، فكل محاولة
// تمر من هنا إجبارياً.
// انشر بـ: supabase functions deploy auth-login --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, errorResponse, HttpError } from '../_shared/auth.ts';
import { clientIp, deviceHash, guardCheck, guardRecord, lockedMessage, sha256Hex } from '../_shared/security.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email) || password.length < 1 || password.length > 200) {
      throw new HttpError(400, 'أدخل البريد وكلمة المرور بشكل صحيح');
    }

    const sb = adminClient();
    const ip = clientIp(req);
    const device = await deviceHash(req, body.device_id);
    const subject = await sha256Hex(`email:${email}`);

    const guard = await guardCheck(sb, 'password', device, ip, subject);
    if (!guard.allowed) {
      return json({ error: lockedMessage(guard.retry_after), code: 'locked', retry_after: guard.retry_after }, 429);
    }

    // FELSY_PUBLISHABLE_KEY: ضعه كسر إذا عطّلت المفاتيح القديمة (legacy) في Supabase
    const anonKey = Deno.env.get('FELSY_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.access_token) {
      // "البريد غير مفعّل" ليس محاولة تخمين — لا نحسبها
      const unconfirmed = /email not confirmed/i.test(String(data?.msg || data?.error_description || ''));
      if (!unconfirmed) await guardRecord(sb, 'password', device, ip, subject, false);
      const after = unconfirmed ? guard : await guardCheck(sb, 'password', device, ip, subject);
      if (unconfirmed) return json({ error: 'Email not confirmed', code: 'unconfirmed' }, 400);
      if (!after.allowed) {
        return json({ error: lockedMessage(after.retry_after), code: 'locked', retry_after: after.retry_after }, 429);
      }
      return json({
        error: 'Invalid login credentials',
        code: 'invalid',
        remaining: after.remaining,
      }, 400);
    }

    await guardRecord(sb, 'password', device, ip, subject, true);
    return json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
