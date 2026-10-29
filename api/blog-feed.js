// خريطة مقالات المدونة (/sitemap-blog.xml) وRSS (/blog/rss.xml) — Vercel Edge
import { escapeHtml as esc } from '../src/lib/markdown.js';
import { BLOG_TITLE, BLOG_DESC, absImage } from '../src/content/blog.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const upstream = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  let posts = [];
  if (upstream && key) {
    const r = await fetch(`${upstream}/rest/v1/rpc/public_blog_feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }, body: '{}',
    });
    if (r.ok) posts = (await r.json().catch(() => [])) || [];
  }
  const link = (p) => `${origin}/blog/${encodeURIComponent(p.slug)}`;
  const headers = { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' };

  if (url.searchParams.get('type') === 'rss') {
    const items = posts.slice(0, 50).map((p) => `<item><title>${esc(p.title)}</title><link>${link(p)}</link><guid isPermaLink="true">${link(p)}</guid>`
      + `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${esc(p.excerpt || '')}</description>`
      + (p.cover_url ? `<enclosure url="${esc(absImage(p.cover_url, origin))}" type="image/webp" length="0"/>` : '') + `</item>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>`
      + `<title>${esc(BLOG_TITLE)}</title><link>${origin}/blog</link><description>${esc(BLOG_DESC)}</description><language>ar</language>`
      + `<atom:link href="${origin}/blog/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
    return new Response(xml, { headers: { ...headers, 'Content-Type': 'application/rss+xml; charset=utf-8' } });
  }

  const urls = [`<url><loc>${origin}/blog</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`]
    .concat(posts.map((p) => `<url><loc>${link(p)}</loc><lastmod>${new Date(p.updated_at || p.published_at).toISOString()}</lastmod>`
      + (p.cover_url ? `<image:image><image:loc>${esc(absImage(p.cover_url, origin))}</image:loc></image:image>` : '') + `</url>`));
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8' } });
}
