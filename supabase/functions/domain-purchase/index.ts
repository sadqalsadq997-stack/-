// Supabase Edge Function — شراء دومين عبر Namecheap
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { domain, branch_id } = await req.json();

    const NC_USER    = Deno.env.get('NAMECHEAP_API_USER') || '';
    const NC_KEY     = Deno.env.get('NAMECHEAP_API_KEY')  || '';
    const NC_IP      = Deno.env.get('NAMECHEAP_CLIENT_IP') || '127.0.0.1';
    const REGISTRANT_EMAIL    = Deno.env.get('REGISTRANT_EMAIL')    || 'admin@felsy.sa';
    const REGISTRANT_PHONE    = Deno.env.get('REGISTRANT_PHONE')    || '+966.500000000';
    const REGISTRANT_FNAME    = Deno.env.get('REGISTRANT_FIRSTNAME') || 'Felsy';
    const REGISTRANT_LNAME    = Deno.env.get('REGISTRANT_LASTNAME')  || 'POS';
    const REGISTRANT_ADDRESS  = Deno.env.get('REGISTRANT_ADDRESS')   || 'Riyadh, Saudi Arabia';
    const REGISTRANT_CITY     = Deno.env.get('REGISTRANT_CITY')      || 'Riyadh';
    const REGISTRANT_STATE    = Deno.env.get('REGISTRANT_STATE')     || 'Riyadh';
    const REGISTRANT_COUNTRY  = Deno.env.get('REGISTRANT_COUNTRY')   || 'SA';
    const REGISTRANT_ZIP      = Deno.env.get('REGISTRANT_ZIP')       || '11111';

    if (!NC_USER || !NC_KEY) {
      // وضع تطوير
      return new Response(JSON.stringify({ success: true, order_id: `DEV-${Date.now()}`, domain }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const [domainName, ...tldParts] = domain.split('.');
    const tld = tldParts.join('.');

    const params = new URLSearchParams({
      ApiUser: NC_USER, ApiKey: NC_KEY, UserName: NC_USER, ClientIp: NC_IP,
      Command: 'namecheap.domains.create',
      DomainName: domainName, TLD: tld, Years: '1',
      // Registrant
      RegistrantFirstName: REGISTRANT_FNAME, RegistrantLastName: REGISTRANT_LNAME,
      RegistrantAddress1: REGISTRANT_ADDRESS, RegistrantCity: REGISTRANT_CITY,
      RegistrantStateProvince: REGISTRANT_STATE, RegistrantPostalCode: REGISTRANT_ZIP,
      RegistrantCountry: REGISTRANT_COUNTRY, RegistrantPhone: REGISTRANT_PHONE,
      RegistrantEmailAddress: REGISTRANT_EMAIL,
      // Tech contact (same as registrant)
      TechFirstName: REGISTRANT_FNAME, TechLastName: REGISTRANT_LNAME,
      TechAddress1: REGISTRANT_ADDRESS, TechCity: REGISTRANT_CITY,
      TechStateProvince: REGISTRANT_STATE, TechPostalCode: REGISTRANT_ZIP,
      TechCountry: REGISTRANT_COUNTRY, TechPhone: REGISTRANT_PHONE,
      TechEmailAddress: REGISTRANT_EMAIL,
      // Nameservers — نستخدم Cloudflare
      Nameservers: 'ns1.felsy.sa,ns2.felsy.sa',
    });

    const res = await fetch(`https://api.namecheap.com/xml.response?${params}`);
    const xml = await res.text();

    const success = xml.includes('IsSuccess="true"') || xml.includes('Registered="true"');
    const orderMatch = xml.match(/OrderID="(\d+)"/);
    const orderId = orderMatch?.[1] || `NC-${Date.now()}`;

    if (!success) {
      throw new Error('فشل في شراء الدومين عبر Namecheap: ' + xml.slice(0, 200));
    }

    return new Response(JSON.stringify({ success: true, order_id: orderId, domain }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
