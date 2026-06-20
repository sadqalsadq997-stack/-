// ══════════════════════════════════════════════════════════════════
// Edge Function: google-wallet-issue
// ══════════════════════════════════════════════════════════════════
// الهدف: إصدار بطاقة ولاء حقيقية على Google Wallet لعميل معيّن.
//
// كيف يعمل Google Wallet فعلياً (هذا الجزء التقني المهم):
//  1) كل منشأة (tenant) تحتاج "Loyalty Class" واحد يوصف شكل بطاقتها
//     (الشعار، الألوان، اسم البرنامج). نُنشئه مرة واحدة فقط لكل
//     منشأة عبر Google Wallet REST API ونحفظ id الناتج.
//  2) كل عميل يحتاج "Loyalty Object" واحد يمثّل بطاقته الشخصية
//     (عدد طوابعه/نقاطه الحالية) ويُربط بـ Class الخاص بمنشأته.
//  3) لتوليد رابط "Save to Google Wallet" الذي يفتح البطاقة في
//     جوال العميل فوراً، نوقّع JWT يحتوي على الـ Object كاملاً،
//     موقّع بمفتاح Service Account الخاص بحساب جوجل (RS256).
//     الرابط النهائي: https://pay.google.com/gp/v/save/<JWT>
//
// المتطلبات (Secrets يجب ضبطها في Supabase → Edge Functions → Secrets):
//   GOOGLE_WALLET_ISSUER_ID        — رقم Issuer ID من Google Pay & Wallet Console
//   GOOGLE_WALLET_SERVICE_ACCOUNT  — محتوى ملف Service Account JSON كاملاً (نص)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — موجودة افتراضياً في كل Edge Function
//
// ⚠️ ملاحظة أمان حرجة: GOOGLE_WALLET_SERVICE_ACCOUNT يحتوي على private_key.
// لا يوضع هذا أبداً في كود الواجهة الأمامية (React) ولا في أي ملف .env
// يُرفع للمتصفح. يبقى فقط هنا، في Supabase Secrets، على السيرفر.
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── أدوات JWT/RS256 بدون مكتبات خارجية (Web Crypto API المدعومة في Deno) ──

function base64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signRS256(payload: object, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64  = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsigned    = `${headerB64}.${payloadB64}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64url(signature)}`;
}

// ── الحصول على Access Token من جوجل عبر Service Account (OAuth2 Server-to-Server) ──

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
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل الحصول على Access Token من جوجل: ${errText}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

// ── بناء جسم Loyalty Class (شكل البطاقة، مرة واحدة لكل منشأة) ──

function buildLoyaltyClass(classId: string, design: any, issuerName: string) {
  return {
    id: classId,
    issuerName: issuerName || 'Felsy',
    programName: design.program_name || 'برنامج الولاء',
    programLogo: design.logo_url ? {
      sourceUri: { uri: design.logo_url },
    } : undefined,
    hexBackgroundColor: design.background_color || '#dc2626',
    reviewStatus: 'UNDER_REVIEW',
  };
}

// ── بناء جسم Loyalty Object (بطاقة العميل الشخصية) ──

function buildLoyaltyObject(objectId: string, classId: string, design: any, customer: any, wallet: any, saveBaseUrl: string) {
  const isStamps = design.program_type === 'stamps';
  const current = isStamps ? (wallet.stamps || 0) : (wallet.points || 0);
  const target  = isStamps ? (design.stamps_required || 10) : null;

  const secondaryLabel = isStamps
    ? `الطوابع: ${current} / ${target}`
    : `النقاط: ${current}`;

  return {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customer.id,
    accountName: customer.name || 'عميل',
    loyaltyPoints: {
      label: isStamps ? 'الطوابع' : 'النقاط',
      balance: { string: String(current) },
    },
    textModulesData: [
      { header: 'الحالة', body: secondaryLabel, id: 'status' },
      { header: 'المكافأة', body: design.reward_description || 'مكافأة مجانية', id: 'reward' },
    ],
    barcode: {
      type: 'QR_CODE',
      value: `${saveBaseUrl}/wallet/${wallet.qr_token}`,
      alternateText: customer.phone || '',
    },
    hexBackgroundColor: design.background_color || '#dc2626',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { tenant_id, customer_id } = await req.json();

    if (!tenant_id || !customer_id) {
      return new Response(JSON.stringify({ error: 'tenant_id و customer_id مطلوبان' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── جلب الإعدادات السرية ──
    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
    const serviceAccountRaw = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');

    if (!issuerId || !serviceAccountRaw) {
      return new Response(JSON.stringify({
        error: 'لم يتم ضبط مفاتيح Google Wallet بعد. يجب إضافة GOOGLE_WALLET_ISSUER_ID و GOOGLE_WALLET_SERVICE_ACCOUNT في إعدادات Supabase Edge Functions Secrets.',
      }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);

    // ── جلب بيانات العميل + تصميم البطاقة الخاص بمنشأته ──
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (custErr || !customer) {
      return new Response(JSON.stringify({ error: 'العميل غير موجود' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: design, error: designErr } = await supabase
      .from('loyalty_card_designs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (designErr || !design) {
      return new Response(JSON.stringify({ error: 'لم يتم تصميم بطاقة الولاء لهذه المنشأة بعد. اذهب لشاشة "تصميم بطاقة الولاء" أولاً.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, name_ar')
      .eq('id', tenant_id)
      .maybeSingle();

    // ── الحصول على Access Token من جوجل ──
    const accessToken = await getGoogleAccessToken(serviceAccount);

    // ── تحديد Class ID الخاص بهذه المنشأة (فريد، ثابت طوال عمر المنشأة) ──
    const classId = design.google_wallet_class_id || `${issuerId}.tenant_${tenant_id.replace(/-/g, '')}`;

    // ── إنشاء/تحديث Class في جوجل (idempotent — PATCH ينشئ لو غير موجود أحياناً يفشل، فنستخدم insert ثم fallback لـ patch) ──
    const classBody = buildLoyaltyClass(classId, design, tenant?.name_ar || tenant?.name);

    const classRes = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (classRes.status === 404) {
      const createRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(classBody),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`فشل إنشاء Loyalty Class في جوجل: ${errText}`);
      }
    } else if (classRes.ok) {
      await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(classBody),
      });
    }

    // حفظ class_id بقاعدة البيانات لو أول مرة
    if (!design.google_wallet_class_id) {
      await supabase.from('loyalty_card_designs')
        .update({ google_wallet_class_id: classId, google_wallet_class_synced: true })
        .eq('id', design.id);
    }

    // ── البحث عن بطاقة موجودة مسبقاً لهذا العميل أو إنشاء واحدة جديدة ──
    let { data: wallet } = await supabase
      .from('wallet_passes')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('customer_id', customer_id)
      .eq('provider', 'google')
      .maybeSingle();

    if (!wallet) {
      const qrToken = crypto.randomUUID().replace(/-/g, '');
      const { data: created, error: createErr } = await supabase
        .from('wallet_passes')
        .insert({
          tenant_id, customer_id, card_design_id: design.id,
          provider: 'google', qr_token: qrToken, status: 'pending',
          stamps: customer.loyalty_stamps || 0,
          points: customer.loyalty_points || 0,
        })
        .select()
        .single();
      if (createErr) throw new Error(`فشل إنشاء سجل البطاقة: ${createErr.message}`);
      wallet = created;
    }

    const objectId = wallet.object_id || `${issuerId}.object_${wallet.id.replace(/-/g, '')}`;

    const appUrl = Deno.env.get('APP_PUBLIC_URL') || 'https://felsy.org';
    const objectBody = buildLoyaltyObject(objectId, classId, design, customer, wallet, appUrl);

    // ── إنشاء/تحديث Object في جوجل ──
    const objRes = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (objRes.status === 404) {
      const createObjRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(objectBody),
      });
      if (!createObjRes.ok) {
        const errText = await createObjRes.text();
        throw new Error(`فشل إنشاء Loyalty Object في جوجل: ${errText}`);
      }
    } else if (objRes.ok) {
      await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(objectBody),
      });
    }

    // ── توقيع JWT الخاص بـ "Save to Google Wallet" ──
    const saveJwtPayload = {
      iss: serviceAccount.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { loyaltyObjects: [{ id: objectId }] },
    };
    const saveJwt = await signRS256(saveJwtPayload, serviceAccount.private_key);
    const saveUrl = `https://pay.google.com/gp/v/save/${saveJwt}`;

    // ── تحديث سجل البطاقة بالنتيجة النهائية ──
    await supabase.from('wallet_passes')
      .update({ object_id: objectId, save_url: saveUrl, status: 'issued', last_synced_at: new Date().toISOString() })
      .eq('id', wallet.id);

    return new Response(JSON.stringify({
      success: true,
      save_url: saveUrl,
      qr_token: wallet.qr_token,
      qr_page_url: `${appUrl}/wallet/${wallet.qr_token}`,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[google-wallet-issue]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
