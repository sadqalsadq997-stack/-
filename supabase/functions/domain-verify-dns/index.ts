// Supabase Edge Function — التحقق من DNS
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { domain } = await req.json();
    const APP_IP = Deno.env.get('APP_SERVER_IP') || '76.76.21.21';

    // استعلام DNS عبر Google DNS over HTTPS
    const res = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`,
      { headers: { Accept: 'application/dns-json' } }
    );
    const data = await res.json();
    const answers = data.Answer || [];
    const verified = answers.some((a: { type: number; data: string }) => a.type === 1 && a.data === APP_IP);

    return new Response(JSON.stringify({ verified, domain, answers }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ verified: false, error: err.message }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
