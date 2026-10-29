// ══════════════════════════════════════════════════════════════════
// المدونة بصفحات قابلة للفهرسة — Vercel Edge
//   /blog              ⇒ قائمة المقالات (Blog + ItemList)
//   /blog/<slug>       ⇒ المقالة كاملة كـ HTML + BlogPosting + Breadcrumb + FAQ
//   /blog/rss.xml      ⇒ RSS        /sitemap-blog.xml ⇒ خريطة المقالات
// المحتوى يُحوَّل بنفس المحوّل الآمن المستخدم في المتصفح (src/lib/markdown.js)
// ══════════════════════════════════════════════════════════════════

import { renderMarkdown, escapeHtml as esc } from '../src/lib/markdown.js';
import { categoryLabel, BLOG_TITLE, BLOG_DESC, absImage, articleJsonLd } from '../src/content/blog.js';

export const config = { runtime: 'edge' };

async function rpc(fn, args) {
  const upstream = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!upstream || !key) return null;
  const res = await fetch(`${upstream}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(args),
  });
  return res.ok ? res.json().catch(() => null) : null;
}

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' };
const fmt = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });

function headTags({ title, description, canonical, image, type = 'website', jsonLd, robots = 'index,follow,max-image-preview:large' }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<link rel="alternate" type="application/rss+xml" title="مدونة فلسي" href="https://felsy.org/blog/rss.xml" />`,
    `<meta property="og:type" content="${type}" />`, `<meta property="og:locale" content="ar_SA" />`, `<meta property="og:site_name" content="فلسي Felsy" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`, `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
}

function inject(shell, head, body) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>\s*<meta name="robots" content="noindex,nofollow" \/>/, head)
    .replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const shell = await (await fetch(new URL('/app-shell.html', origin))).text();
  const raw = url.searchParams.get('slug');

  // ── مقالة ──
  if (raw) {
    let slug = raw;
    try { slug = decodeURIComponent(raw); } catch { /* */ }
    if (!/^[\p{L}\p{N}-]{1,120}$/u.test(slug)) return new Response(shell, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const post = await rpc('public_blog_post', { p_slug: slug });
    if (!post) {
      return new Response(inject(shell, headTags({ title: 'المقالة غير موجودة | مدونة فلسي', description: '', canonical: `${origin}/blog`, robots: 'noindex' }), ''),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=60' } });
    }
    const canonical = `${origin}/blog/${encodeURIComponent(post.slug)}`;
    const { html } = renderMarkdown(post.content);
    const head = headTags({
      title: `${post.seo_title || post.title} | مدونة فلسي`, description: (post.seo_description || post.excerpt || '').slice(0, 300),
      canonical, image: absImage(post.cover_url, origin), type: 'article', jsonLd: articleJsonLd(post, canonical, origin),
    }) + `\n    <meta property="article:published_time" content="${esc(post.published_at)}" />`
      + `\n    <meta property="article:modified_time" content="${esc(post.updated_at || post.published_at)}" />`;
    const body = `<article dir="rtl" style="max-width:760px;margin:auto;padding:110px 16px 40px;font-family:Cairo,sans-serif;line-height:2">
<nav><a href="/">الرئيسية</a> › <a href="/blog">المدونة</a> › <a href="/blog?c=${esc(post.category)}">${esc(categoryLabel(post.category))}</a></nav>
<h1>${esc(post.title)}</h1>${post.excerpt ? `<p>${esc(post.excerpt)}</p>` : ''}
<p>${esc(post.author_name || 'فريق فلسي')} · <time datetime="${esc(post.published_at)}">${fmt(post.published_at)}</time></p>
${post.cover_url ? `<img src="${esc(absImage(post.cover_url, origin))}" alt="${esc(post.cover_alt || post.title)}" style="width:100%">` : ''}
<div class="prose-felsy">${html}</div>
${(post.faq || []).length ? `<h2>أسئلة شائعة</h2>${post.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}` : ''}
${(post.related || []).length ? `<h2>مقالات ذات صلة</h2><ul>${post.related.map((r) => `<li><a href="/blog/${encodeURIComponent(r.slug)}">${esc(r.title)}</a></li>`).join('')}</ul>` : ''}
</article>`;
    return new Response(inject(shell, head, body), { headers: HTML_HEADERS });
  }

  // ── قائمة المدونة ──
  const list = (await rpc('public_blog_list', { p_category: null, p_q: null, p_limit: 50, p_offset: 0 })) || { rows: [] };
  const canonical = `${origin}/blog`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Blog', '@id': `${canonical}#blog`, name: 'مدونة فلسي', url: canonical, inLanguage: 'ar', description: BLOG_DESC,
    publisher: { '@type': 'Organization', name: 'فلسي Felsy', logo: { '@type': 'ImageObject', url: `${origin}/logo-square.png` } },
    blogPost: list.rows.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${origin}/blog/${encodeURIComponent(p.slug)}`, datePublished: p.published_at })),
  };
  const body = `<main dir="rtl" style="max-width:960px;margin:auto;padding:110px 16px 40px;font-family:Cairo,sans-serif">
<h1>مدونة فلسي — حلول عملية لأصحاب المطاعم والمحلات</h1><p>${esc(BLOG_DESC)}</p>
<ul>${list.rows.map((p) => `<li><a href="/blog/${encodeURIComponent(p.slug)}">${esc(p.title)}</a> — ${esc(p.excerpt || '')}</li>`).join('')}</ul></main>`;
  return new Response(inject(shell, headTags({ title: BLOG_TITLE, description: BLOG_DESC, canonical, image: `${origin}/og-image.png`, jsonLd }), body), { headers: HTML_HEADERS });
}
