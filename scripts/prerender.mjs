// ══════════════════════════════════════════════════════════════════
// Prerender: يحوّل صفحات التسويق إلى HTML ثابت كامل المحتوى + sitemap
// يعمل بعد: vite build && vite build --ssr src/entry-server.jsx --outDir dist-ssr
// ══════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const entry = fs.readdirSync(ssrDir).find(f => /^entry-server\.(m?js)$/.test(f));
const { render, PUBLIC_ROUTES, getHead, SITE } = await import(pathToFileURL(path.join(ssrDir, entry)).href);

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const verify = process.env.VITE_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION || '';
const bingVerify = process.env.BING_SITE_VERIFICATION || '';

function headBlock(h) {
  return [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" />`,
    `<meta name="keywords" content="${esc(h.keywords)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />`,
    `<link rel="canonical" href="${h.canonical}" />`,
    `<link rel="alternate" hreflang="ar-SA" href="${h.canonical}" />`,
    `<link rel="alternate" hreflang="x-default" href="${h.canonical}" />`,
    `<meta property="og:url" content="${h.canonical}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta name="twitter:title" content="${esc(h.title)}" />`,
    `<meta name="twitter:description" content="${esc(h.description)}" />`,
    verify && `<meta name="google-site-verification" content="${esc(verify)}" />`,
    bingVerify && `<meta name="msvalidate.01" content="${esc(bingVerify)}" />`,
    `<script type="application/ld+json" id="ld-json">${JSON.stringify(h.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n    ');
}

const SEO_BLOCK = /<!-- SEO:START[\s\S]*?<!-- SEO:END -->/;
if (!SEO_BLOCK.test(template)) throw new Error('index.html is missing the SEO:START/END block');

// 1) قالب التطبيق الداخلي (لوحة التحكم وغيرها) — لا يُفهرس
const shell = template.replace(SEO_BLOCK, `<title>فلسي Felsy</title>\n    <meta name="robots" content="noindex,nofollow" />`);
fs.writeFileSync(path.join(dist, 'app-shell.html'), shell);

// 2) صفحات التسويق
for (const route of PUBLIC_ROUTES) {
  const head = getHead(route);
  // عناصر الحركة تبدأ مخفية (opacity:0) — نظهرها في الـ HTML الثابت حتى
  // يراها الزائر ومحركات البحث فوراً قبل تحميل JavaScript
  const body = render(route).replace(/style="([^"]*)"/g, (m, css) => {
    if (/height:0/.test(css)) return m; // إجابات الأسئلة المطوية تبقى مطوية
    const cleaned = css.split(';').filter(d => d && !/^\s*opacity:0(\.0+)?\s*$/.test(d) && !/^\s*transform:/.test(d)).join(';');
    return cleaned ? `style="${cleaned}"` : '';
  });
  if (!body || body.length < 500) throw new Error(`Prerender produced empty HTML for ${route}`);
  const html = template
    .replace(SEO_BLOCK, headBlock(head))
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
  fs.writeFileSync(path.join(dist, file), html);
  console.log(`✓ prerendered ${route} → ${file} (${(body.length / 1024).toFixed(1)} KB)`);
}

// 3) sitemap.xml
const today = new Date().toISOString().slice(0, 10);
const prio = r => (r === '/' ? '1.0' : r === '/pricing' ? '0.9' : ['/terms', '/privacy', '/about'].includes(r) ? '0.4' : '0.8');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PUBLIC_ROUTES.map(r => {
  const loc = r === '/' ? `${SITE.url}/` : `${SITE.url}${r}`;
  return `  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="ar-SA" href="${loc}"/>
    <lastmod>${today}</lastmod>
    <changefreq>${r === '/' || r === '/pricing' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${prio(r)}</priority>
  </url>`;
}).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);
fs.rmSync(ssrDir, { recursive: true, force: true });
console.log(`✓ sitemap.xml (${PUBLIC_ROUTES.length} URLs)`);
