// Supabase Edge Function — التحقق من توفر الدومين عبر Namecheap
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { adminClient, requireTenantMember, HttpError } from '../_shared/auth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // لازم مستخدم مسجّل (كانت مفتوحة لأي أحد على الإنترنت)
    try { await requireTenantMember(req, adminClient(), null, false); }
    catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: e instanceof HttpError ? e.status : 401, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
    const { domain: rawDomain } = await req.json();
    const domain = String(rawDomain || '').toLowerCase().trim();
    if (!/^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$/.test(domain)) {
      return new Response(JSON.stringify({ error: 'اسم الدومين غير صحيح' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!domain) return new Response(JSON.stringify({ error: 'domain required' }), { status: 400, headers: CORS });

    const NC_USER    = Deno.env.get('NAMECHEAP_API_USER') || '';
    const NC_KEY     = Deno.env.get('NAMECHEAP_API_KEY')  || '';
    const NC_IP      = Deno.env.get('NAMECHEAP_CLIENT_IP') || '127.0.0.1';

    const TLD_PRICES: Record<string, number> = {
      '.sa': 199, '.com': 49, '.net': 55,
      '.store': 39, '.online': 29, '.co': 89,
    };

    if (!NC_USER || !NC_KEY) {
      // وضع تطوير — محاكاة نتائج
      const results = Object.entries(TLD_PRICES).map(([ext, price]) => ({
        domain: `${domain}${ext}`,
        available: Math.random() > 0.3,
        price,
        ext,
        popular: ext === '.com',
      }));
      return new Response(JSON.stringify({ results }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // استدعاء Namecheap API الحقيقي
    const tlds = Object.keys(TLD_PRICES).map(t => t.replace('.', ''));
    const domainList = tlds.map(t => `${domain}.${t}`).join(',');
    const url = `https://api.namecheap.com/xml.response?ApiUser=${NC_USER}&ApiKey=${NC_KEY}&UserName=${NC_USER}&ClientIp=${NC_IP}&Command=namecheap.domains.check&DomainList=${domainList}`;

    const res = await fetch(url);
    const xml = await res.text();

    // Parse XML بسيط
    const results = Object.entries(TLD_PRICES).map(([ext, price]) => {
      const domainFull = `${domain}${ext}`;
      const domainCheck = `${domain}.${ext.replace('.', '')}`;
      const available = xml.includes(`Domain="${domainCheck}" Available="true"`);
      return { domain: domainFull, available, price, ext, popular: ext === '.com' };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
