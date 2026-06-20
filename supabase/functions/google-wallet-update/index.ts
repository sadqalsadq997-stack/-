// ══════════════════════════════════════════════════════════════════
// Edge Function: google-wallet-update
// ══════════════════════════════════════════════════════════════════
// يُستدعى كل مرة يتغيّر فيها عدد طوابع/نقاط العميل (مثلاً بعد عملية
// بيع جديدة بنقطة البيع). يحدّث الـ Loyalty Object في جوجل مباشرة،
// فتنعكس القيمة الجديدة تلقائياً على البطاقة المحفوظة في جوال
// العميل بدون أي إجراء إضافي منه (هذه ميزة Google Wallet الأساسية:
// تحديث push بدون إعادة تحميل).
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else bytes = new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signRS256(payload: object, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const assertion = await signRS256(claims, serviceAccount.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`فشل الحصول على Access Token: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id, customer_id, stamps, points } = await req.json();

    if (!tenant_id || !customer_id) {
      return new Response(JSON.stringify({ error: 'tenant_id و customer_id مطلوبان' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet } = await supabase
      .from('wallet_passes')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('customer_id', customer_id)
      .eq('provider', 'google')
      .maybeSingle();

    // العميل ما عنده بطاقة Google Wallet مُصدرة بعد — لا شيء نحدّثه (لا خطأ، فقط تجاوز)
    if (!wallet || !wallet.object_id) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'لا توجد بطاقة محفوظة لهذا العميل' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: design } = await supabase
      .from('loyalty_card_designs')
      .select('*')
      .eq('id', wallet.card_design_id)
      .maybeSingle();

    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
    const serviceAccountRaw = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
    if (!issuerId || !serviceAccountRaw) {
      return new Response(JSON.stringify({ error: 'مفاتيح Google Wallet غير مضبوطة' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const newStamps = stamps ?? wallet.stamps ?? 0;
    const newPoints = points ?? wallet.points ?? 0;
    const isStamps = design?.program_type === 'stamps';
    const current = isStamps ? newStamps : newPoints;
    const target  = isStamps ? (design?.stamps_required || 10) : null;

    // تحديث جزئي عبر PATCH (أخف من PUT الكامل، ويكفي لتحديث الرصيد)
    const patchBody: any = {
      loyaltyPoints: {
        label: isStamps ? 'الطوابع' : 'النقاط',
        balance: { string: String(current) },
      },
      textModulesData: [
        { header: 'الحالة', body: isStamps ? `الطوابع: ${current} / ${target}` : `النقاط: ${current}`, id: 'status' },
      ],
    };

    const patchRes = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${wallet.object_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`فشل تحديث البطاقة في جوجل: ${errText}`);
    }

    await supabase.from('wallet_passes')
      .update({ stamps: newStamps, points: newPoints, last_synced_at: new Date().toISOString() })
      .eq('id', wallet.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[google-wallet-update]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
