// ══════════════════════════════════════════════════════════════════
// منيو كل منشأة بصفحة قابلة للفهرسة — felsy.org/m/<رقم الحساب أو الاسم>
// Vercel Edge: يجيب بيانات المنيو العامة (بدون أي بيانات داخلية) ويحقن:
//   • العنوان والوصف ورابط المشاركة (OG) باسم المطعم
//   • Schema.org: Restaurant + Menu + MenuSection + MenuItem + Offer
//   • نسخة نصية من المنيو داخل الصفحة (يقرأها Google قبل تشغيل الجافاسكربت)
// لا نضيف تقييمات (AggregateRating) مخترعة — Google يعاقب عليها.
// ══════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SLUG_RE = /^[a-z0-9-]{1,60}$/i;

async function fetchMenu(slug) {
  const upstream = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!upstream || !key) return null;
  const res = await fetch(`${upstream}/rest/v1/rpc/public_menu_by_slug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function buildJsonLd(menu, url) {
  const cats = menu.categories || [];
  const prods = menu.products || [];
  const item = (p) => ({
    '@type': 'MenuItem',
    name: p.name_ar || p.name,
    ...(p.description_ar || p.description ? { description: p.description_ar || p.description } : {}),
    ...(p.image_url ? { image: p.image_url } : {}),
    offers: { '@type': 'Offer', price: Number(p.price).toFixed(2), priceCurrency: 'SAR', availability: 'https://schema.org/InStock' },
  });
  const sections = cats.map(c => ({
    '@type': 'MenuSection', name: c.name_ar || c.name,
    hasMenuItem: prods.filter(p => p.category_id === c.id).slice(0, 60).map(item),
  })).filter(s => s.hasMenuItem.length);
  const loose = prods.filter(p => !cats.some(c => c.id === p.category_id)).slice(0, 60).map(item);
  const prices = prods.map(p => Number(p.price)).filter(n => n > 0);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url + '#restaurant',
    name: menu.business_name,
    url,
    ...(menu.logo_url ? { image: menu.logo_url, logo: menu.logo_url } : {}),
    ...(menu.phone ? { telephone: menu.phone } : {}),
    address: { '@type': 'PostalAddress', ...(menu.address ? { streetAddress: menu.address } : {}), ...(menu.city ? { addressLocality: menu.city } : {}), addressCountry: 'SA' },
    ...(avg ? { priceRange: avg < 25 ? '$' : avg < 70 ? '$$' : '$$$' } : {}),
    currenciesAccepted: 'SAR',
    servesCuisine: cats.slice(0, 6).map(c => c.name_ar || c.name),
    acceptsReservations: false,
    hasMenu: {
      '@type': 'Menu', name: `منيو ${menu.business_name}`, inLanguage: 'ar',
      ...(sections.length ? { hasMenuSection: sections } : {}),
      ...(loose.length ? { hasMenuItem: loose } : {}),
    },
  };
}

function snapshotHtml(menu) {
  const cats = menu.categories || [];
  const prods = menu.products || [];
  const li = (p) => `<li><strong>${esc(p.name_ar || p.name)}</strong> — ${Number(p.price).toFixed(2)} ريال${p.description_ar ? `<br><small>${esc(p.description_ar)}</small>` : ''}</li>`;
  const sections = cats.map(c => {
    const items = prods.filter(p => p.category_id === c.id);
    return items.length ? `<section><h2>${esc(c.name_ar || c.name)}</h2><ul>${items.map(li).join('')}</ul></section>` : '';
  }).join('');
  const loose = prods.filter(p => !cats.some(c => c.id === p.category_id));
  return `<main dir="rtl" style="font-family:Cairo,sans-serif;max-width:720px;margin:auto;padding:16px">
<h1>${esc(menu.business_name)} — المنيو</h1>
${menu.city || menu.address ? `<p>${esc([menu.address, menu.city].filter(Boolean).join('، '))}</p>` : ''}
${sections}${loose.length ? `<ul>${loose.map(li).join('')}</ul>` : ''}
<p><a href="https://felsy.org/?utm_source=menu&utm_medium=made_by">صنع بواسطة فلسي</a></p>
</main>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  const shellRes = await fetch(new URL('/app-shell.html', url.origin));
  let html = await shellRes.text();
  if (!SLUG_RE.test(slug)) return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const menu = await fetchMenu(slug).catch(() => null);
  if (!menu?.business_name) {
    return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  }

  const canonical = `${url.origin}/m/${encodeURIComponent(slug.toLowerCase())}`;
  const cats = (menu.categories || []).map(c => c.name_ar || c.name).slice(0, 5).join('، ');
  const top = (menu.products || []).slice(0, 4).map(p => p.name_ar || p.name).join('، ');
  const where = menu.city ? ` في ${menu.city}` : '';
  const title = `${menu.business_name}${where} | المنيو والأسعار — اطلب أونلاين`;
  const desc = `منيو ${menu.business_name}${where} بالأسعار المحدّثة${cats ? ': ' + cats : ''}${top ? '. جرّب ' + top : ''}. اطلب مباشرة من الجوال.`.slice(0, 300);
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="restaurant.menu" />`,
    `<meta property="og:locale" content="ar_SA" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    menu.logo_url ? `<meta property="og:image" content="${esc(menu.logo_url)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${JSON.stringify(buildJsonLd(menu, canonical)).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n    ');

  html = html
    .replace(/<title>[\s\S]*?<\/title>\s*<meta name="robots" content="noindex,nofollow" \/>/, head)
    .replace(/<div id="root"><\/div>/, `<div id="root">${snapshotHtml(menu)}</div>`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // كاش على شبكة Vercel: دقيقتين + تحديث بالخلفية ⇒ ضغط شبه صفر على القاعدة
      'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
    },
  });
}
