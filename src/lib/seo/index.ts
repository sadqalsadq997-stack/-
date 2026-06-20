/**
 * Felsy SEO Engine — Dynamic Metadata + Structured Data
 * يدعم: Arabic + English | OpenGraph | Twitter Cards | JSON-LD
 */

interface SEOConfig {
  title:          string;
  description:    string;
  canonical?:     string;
  image?:         string;
  type?:          'website' | 'article' | 'product';
  noindex?:       boolean;
  schema?:        Record<string, unknown>[];
  locale?:        'ar' | 'en';
}

const SITE_NAME = 'فلسي — Felsy POS & ERP';
const BASE_URL  = import.meta.env.VITE_APP_URL || 'https://felsy.sa';
const OG_IMAGE  = `${BASE_URL}/og-default.png`;

export function setSEO(config: SEOConfig) {
  const { title, description, canonical, image, type = 'website', noindex, schema, locale = 'ar' } = config;
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const imgUrl    = image || OG_IMAGE;
  const canonUrl  = canonical || window.location.href;

  // Basic
  setMeta('title', fullTitle, 'title');
  setMeta('description', description);
  document.documentElement.lang = locale === 'ar' ? 'ar' : 'en';
  document.documentElement.dir  = locale === 'ar' ? 'rtl' : 'ltr';

  // Canonical
  setLink('canonical', canonUrl);

  // Robots
  setMeta('robots', noindex ? 'noindex,nofollow' : 'index,follow');

  // OpenGraph
  setMeta('og:title',       fullTitle,   undefined, 'property');
  setMeta('og:description', description, undefined, 'property');
  setMeta('og:image',       imgUrl,      undefined, 'property');
  setMeta('og:url',         canonUrl,    undefined, 'property');
  setMeta('og:type',        type,        undefined, 'property');
  setMeta('og:site_name',   SITE_NAME,   undefined, 'property');
  setMeta('og:locale',      locale === 'ar' ? 'ar_SA' : 'en_US', undefined, 'property');

  // Twitter Card
  setMeta('twitter:card',        'summary_large_image');
  setMeta('twitter:title',       fullTitle);
  setMeta('twitter:description', description);
  setMeta('twitter:image',       imgUrl);

  // JSON-LD Structured Data
  const defaultSchema = buildDefaultSchema(fullTitle, description, canonUrl, imgUrl);
  const allSchemas = [defaultSchema, ...(schema || [])];
  injectSchema(allSchemas);
}

function buildDefaultSchema(title: string, desc: string, url: string, image: string) {
  return {
    '@context': 'https://schema.org',
    '@type':    'SoftwareApplication',
    name:       'Felsy POS',
    description: desc,
    url,
    image,
    applicationCategory: 'BusinessApplication',
    operatingSystem:     'Web',
    offers: {
      '@type':    'Offer',
      price:      '45',
      priceCurrency: 'SAR',
    },
    publisher: {
      '@type': 'Organization',
      name:    'Felsy',
      url:     BASE_URL,
    },
  };
}

// ── Predefined page configs ───────────────────────────────────────
export const PAGE_SEO: Record<string, SEOConfig> = {
  '/':           { title: 'لوحة التحكم',       description: 'إدارة منشأتك من لوحة تحكم ذكية وشاملة' },
  '/pos':        { title: 'نقطة البيع',         description: 'نقطة بيع سريعة وسهلة الاستخدام' },
  '/orders':     { title: 'الطلبات',            description: 'إدارة ومتابعة جميع الطلبات' },
  '/invoices':   { title: 'الفواتير',           description: 'فواتير إلكترونية متوافقة مع ZATCA' },
  '/inventory':  { title: 'المخزون',            description: 'إدارة المخزون متعدد المستودعات' },
  '/customers':  { title: 'العملاء',            description: 'إدارة بيانات العملاء وسجلاتهم' },
  '/accounting': { title: 'المحاسبة',           description: 'نظام محاسبي احترافي متكامل' },
  '/analytics':  { title: 'التقارير',           description: 'تقارير مالية وتشغيلية تفاعلية' },
  '/home':       { title: 'منصة ERP وPOS ذكية', description: 'فلسي — منصة SaaS متكاملة للمطاعم والمتاجر', type: 'website' },
};

// ── Helpers ──────────────────────────────────────────────────────
function setMeta(name: string, content: string, type = 'meta', attr = 'name') {
  if (type === 'title') { document.title = content; return; }
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

function injectSchema(schemas: Record<string, unknown>[]) {
  document.querySelectorAll('script[type="application/ld+json"][data-felsy]').forEach(s => s.remove());
  for (const schema of schemas) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-felsy', '1');
    s.textContent = JSON.stringify(schema);
    document.head.appendChild(s);
  }
}
