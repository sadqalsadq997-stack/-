// Supabase Edge Function — إعداد DNS تلقائياً
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { domain, target } = await req.json();
    const NC_USER = Deno.env.get('NAMECHEAP_API_USER') || '';
    const NC_KEY  = Deno.env.get('NAMECHEAP_API_KEY')  || '';
    const NC_IP   = Deno.env.get('NAMECHEAP_CLIENT_IP') || '127.0.0.1';
    const APP_IP  = Deno.env.get('APP_SERVER_IP') || target || '76.76.21.21';

    if (!NC_USER || !NC_KEY) {
      return new Response(JSON.stringify({ success: true, message: 'dev mode - DNS not configured' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const parts = domain.split('.');
    const sld = parts[0]; // e.g. "myshop"
    const tld = parts.slice(1).join('.'); // e.g. "com" or "sa"

    // تعيين سجلات DNS عبر Namecheap
    const params = new URLSearchParams({
      ApiUser: NC_USER, ApiKey: NC_KEY, UserName: NC_USER, ClientIp: NC_IP,
      Command: 'namecheap.domains.dns.setHosts',
      SLD: sld, TLD: tld,
      // سجل A للجذر
      'HostName1': '@', 'RecordType1': 'A', 'Address1': APP_IP, 'TTL1': '3600',
      // سجل A لـ www
      'HostName2': 'www', 'RecordType2': 'A', 'Address2': APP_IP, 'TTL2': '3600',
      // سجل CNAME للـ menu
      'HostName3': 'menu', 'RecordType3': 'CNAME', 'Address3': `${domain}.`, 'TTL3': '3600',
    });

    const res = await fetch(`https://api.namecheap.com/xml.response?${params}`);
    const xml = await res.text();
    const success = xml.includes('IsSuccess="true"');

    return new Response(JSON.stringify({ success, domain, target: APP_IP }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
