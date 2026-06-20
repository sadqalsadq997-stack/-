// ══════════════════════════════════════════════════════════════════
// Edge Function: verify-owner-pin
// PIN لا يُخزَّن في الكود — يُحفظ في Supabase Secrets
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS  = 5;
const LOCKOUT_SEC   = 900; // 15 دقيقة

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { hash, nonce, sig } = await req.json();

  // فحص lockout من DB
  const { data: lockData } = await supabase
    .from('security_events')
    .select('*')
    .eq('event_type', 'owner_login_attempt')
    .eq('ip_address', ip)
    .gte('created_at', new Date(Date.now() - LOCKOUT_SEC * 1000).toISOString())
    .order('created_at', { ascending: false });

  const recentFails = (lockData || []).filter((e: any) => e.success === false);
  if (recentFails.length >= MAX_ATTEMPTS) {
    await logEvent(supabase, 'owner_login_blocked', ip, false);
    return new Response(
      JSON.stringify({ error: 'محظور مؤقتاً — حاول بعد 15 دقيقة' }),
      { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  // التحقق من PIN المشفر في Supabase Secrets
  const OWNER_PIN_HASH = Deno.env.get('OWNER_PIN_HASH'); // يُضبط في Supabase Dashboard
  if (!OWNER_PIN_HASH) {
    return new Response(
      JSON.stringify({ error: 'غير مهيأ' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  // التحقق: hash المُرسَل مقابل hash المخزّن
  const isValid = timingSafeEqual(hash, OWNER_PIN_HASH);

  await logEvent(supabase, 'owner_login_attempt', ip, isValid, { nonce: nonce.slice(0,8) });

  if (!isValid) {
    return new Response(
      JSON.stringify({ error: 'رمز الدخول خاطئ' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  // توليد JWT مؤقت
  const token = crypto.randomUUID() + '.' + Date.now().toString(36);
  const tokenHash = await sha256(token);

  await supabase.from('owner_sessions').insert({
    token_hash: tokenHash,
    ip_address: ip,
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

  return new Response(
    JSON.stringify({ token }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function logEvent(sb: any, type: string, ip: string, success: boolean, meta?: any) {
  await sb.from('security_events').insert({ event_type: type, ip_address: ip, success, meta }).catch(() => {});
}
