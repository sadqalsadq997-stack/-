// ══════════════════════════════════════════════════════════════════
// رفع الصور خارج Supabase — Cloudflare R2 (Vercel Edge)
// ──────────────────────────────────────────────────────────────────
// لماذا؟ الصور هي أكبر استهلاك للمساحة والباندويدث. R2:
//   • 10GB مجاناً ثم ~0.015$ لكل GB شهرياً
//   • بدون رسوم خروج (egress) — مهما زاد زوار المنيو
// الصورة تُضغط في المتصفح أولاً (WebP ≤ 800px ≈ 40–120KB) ثم تُرفع هنا.
//
// متغيرات البيئة (Vercel → Settings → Environment Variables):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//   R2_PUBLIC_URL   (مثل https://img.felsy.org — دومين عام مربوط بالـ bucket)
// إذا ما ضبطتها ⇒ يرجع 501 والواجهة ترفع على Supabase (بعد الضغط) تلقائياً.
// ══════════════════════════════════════════════════════════════════

import { AwsClient } from 'aws4fetch';

export const config = { runtime: 'edge' };

const MAX = 600 * 1024; // بعد الضغط، أي صورة أكبر = خطأ
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const FOLDERS = new Set(['products', 'logos', 'loyalty', 'purchases', 'categories']);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function tenantOf(token) {
  const upstream = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!upstream || !key || !token) return null;
  // my_tenant_id بتوكن المستخدم نفسه ⇒ RLS يتحقق إنه عضو فعّال في منشأة
  const res = await fetch(`${upstream}/rest/v1/rpc/my_tenant_id`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return null;
  const id = await res.json().catch(() => null);
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return json({ error: 'r2_not_configured' }, 501);
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const tenant = await tenantOf(token);
  if (!tenant) return json({ error: 'unauthorized' }, 401);

  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  const ext = TYPES[type];
  if (!ext) return json({ error: 'صور فقط (WebP/JPG/PNG)' }, 415);
  const folder = new URL(req.url).searchParams.get('folder') || 'products';
  if (!FOLDERS.has(folder)) return json({ error: 'bad_folder' }, 400);

  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX) return json({ error: 'حجم الصورة كبير' }, 413);
  // نتحقق من توقيع الملف الحقيقي (مو بس الاسم/النوع المرسل)
  const b = new Uint8Array(body.slice(0, 12));
  const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  const isJpg = b[0] === 0xff && b[1] === 0xd8;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (!({ webp: isWebp, jpg: isJpg, png: isPng })[ext]) return json({ error: 'الملف ليس صورة صحيحة' }, 415);

  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), x => x.toString(16).padStart(2, '0')).join('');
  const key = `${tenant}/${folder}/${Date.now().toString(36)}-${rand}.${ext}`;
  const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  const put = await r2.fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: 'PUT', body,
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  if (!put.ok) return json({ error: 'upload_failed' }, 502);
  return json({ url: `${R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`, key, bytes: body.byteLength });
}
