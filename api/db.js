// ══════════════════════════════════════════════════════════════════
// وكيل قاعدة البيانات — Vercel Edge Function
// المتصفح يكلّم felsy.org/api/db فقط. رابط Supabase ومفتاحه موجودين في
// متغيرات البيئة على السيرفر (SUPABASE_URL و SUPABASE_ANON_KEY — بدون
// بادئة VITE_) فلا يظهرون في كود الموقع ولا في أدوات المطوّر.
//
// إضافات أمان:
//   • يمنع تسجيل الدخول المباشر بكلمة المرور (لازم يمر عبر auth-login
//     اللي يطبّق حد 10 محاولات لكل جهاز)
//   • يمنع قراءة مخطط قاعدة البيانات (OpenAPI) ومسارات الإدارة
//   • يمرر IP العميل الحقيقي لقاعدة البيانات (لحدود المحاولات)
// ══════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' };

const ALLOWED_PREFIXES = ['/rest/v1/', '/auth/v1/', '/storage/v1/', '/functions/v1/'];
const PUBLIC_TOKEN = 'felsy-public';
const MAX_BODY = 6 * 1024 * 1024; // 6MB

const DROP_REQ_HEADERS = new Set([
  'host', 'connection', 'content-length', 'accept-encoding', 'cookie',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip',
  'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-forwarded-for', 'forwarded',
  'x-felsy-client-ip', 'apikey',
]);
const DROP_RES_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection',
  'sb-gateway-version', 'sb-project-ref', 'x-envoy-upstream-service-time', 'server', 'via',
  'cf-ray', 'cf-cache-status', 'alt-svc', 'strict-transport-security',
]);

function deny(status, message) {
  return new Response(JSON.stringify({ error: message, message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(req) {
  const upstream = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!upstream || !anonKey) return deny(503, 'service_not_configured');

  const url = new URL(req.url);
  // المسار يجي إما من إعادة التوجيه (?__path=) أو من الرابط نفسه
  let path = url.searchParams.get('__path');
  url.searchParams.delete('__path');
  path = '/' + (path ?? url.pathname.replace(/^\/api\/db\/?/, '')).replace(/^\/+/, '');

  if (path.includes('..') || path.includes('//')) return deny(400, 'bad_path');
  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return deny(404, 'not_found');

  // مخطط قاعدة البيانات (قائمة كل الجداول) — لا يُعرض لأحد
  if (path === '/rest/v1/' || path === '/rest/v1') return deny(404, 'not_found');
  // مسارات الإدارة في Auth
  if (path.startsWith('/auth/v1/admin')) return deny(403, 'forbidden');
  // تسجيل الدخول بكلمة المرور إجباري عبر auth-login (حد 10 محاولات لكل جهاز)
  if (path.startsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
    return deny(403, 'use_auth_login');
  }

  const headers = new Headers();
  for (const [k, v] of req.headers) {
    if (!DROP_REQ_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  }
  headers.set('apikey', anonKey);
  const auth = req.headers.get('authorization') || '';
  if (!auth || auth === `Bearer ${PUBLIC_TOKEN}`) headers.set('authorization', `Bearer ${anonKey}`);
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) headers.set('x-felsy-client-ip', ip);

  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_BODY) return deny(413, 'payload_too_large');
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY) return deny(413, 'payload_too_large');
  }

  let res;
  try {
    res = await fetch(upstream + path + (url.search || ''), {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch {
    return deny(502, 'upstream_unreachable');
  }

  const out = new Headers();
  for (const [k, v] of res.headers) {
    if (!DROP_RES_HEADERS.has(k.toLowerCase())) out.set(k, v);
  }
  // روابط التخزين/التحويل اللي ترجع من Supabase تُعاد كتابتها على دومين الموقع
  const loc = res.headers.get('location');
  if (loc && loc.startsWith(upstream)) out.set('location', url.origin + '/api/db' + loc.slice(upstream.length));
  if (!path.startsWith('/storage/v1/object/public/')) out.set('Cache-Control', 'no-store');
  // صور المنتجات والشعارات: أسماءها فريدة ولا تتغير ⇒ كاش سنة على شبكة Vercel والمتصفح
  // (كل صورة تُجلب من Supabase مرة وحدة تقريباً ⇒ استهلاك شبه صفر مع آلاف الزوار)
  else if (res.ok && req.method === 'GET') out.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  // الملفات المرفوعة تُعرض كملفات فقط — لا يُنفَّذ أي سكربت بداخلها
  if (path.startsWith('/storage/')) {
    out.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    out.set('X-Content-Type-Options', 'nosniff');
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
