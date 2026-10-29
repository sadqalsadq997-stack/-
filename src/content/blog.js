// تصنيفات المدونة — نفس القيم المسموحة في owner-admin-api
export const BLOG_CATEGORIES = [
  { id: 'solutions', label: 'حلول', desc: 'حلول عملية لمشاكل التشغيل اليومية' },
  { id: 'guides', label: 'أدلة', desc: 'شروحات خطوة بخطوة' },
  { id: 'zatca', label: 'الضريبة والفوترة', desc: 'الفوترة الإلكترونية والإقرارات' },
  { id: 'restaurants', label: 'المطاعم والكافيهات', desc: 'تشغيل المطاعم وزيادة المبيعات' },
  { id: 'retail', label: 'المحلات', desc: 'المخزون والباركود والفروع' },
  { id: 'news', label: 'أخبار', desc: 'أخبار القطاع والأنظمة' },
  { id: 'updates', label: 'تحديثات فلسي', desc: 'الجديد في النظام' },
];
export const categoryLabel = (id) => BLOG_CATEGORIES.find((c) => c.id === id)?.label || 'مقالات';
export const BLOG_TITLE = 'مدونة فلسي — حلول ونصائح لأصحاب المطاعم والمحلات';
export const BLOG_DESC = 'مقالات عملية عن أنظمة الكاشير، الفوترة الإلكترونية وهيئة الزكاة، إدارة المخزون، برامج الولاء، وزيادة مبيعات المطاعم والكافيهات والمحلات في السعودية.';

/** رابط صورة كامل (الصور المرفوعة تمر عبر وكيل الموقع) */
export const absImage = (url, origin = 'https://felsy.org') => (!url ? '' : /^https?:\/\//.test(url) ? url : origin + url);
export const fmtDateAr = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });

/** Schema.org: BlogPosting + Breadcrumb + FAQ — نفس الدالة في الصفحة وفي صفحات SEO على السيرفر */
export function articleJsonLd(post, url, origin = 'https://felsy.org') {
  const graph = [
    {
      '@type': 'BlogPosting', '@id': `${url}#article`, mainEntityOfPage: url, headline: post.title.slice(0, 110),
      description: post.seo_description || post.excerpt || '', inLanguage: 'ar',
      datePublished: post.published_at, dateModified: post.updated_at || post.published_at,
      ...(post.cover_url ? { image: [absImage(post.cover_url, origin)] } : {}),
      author: { '@type': 'Organization', name: post.author_name || 'فريق فلسي', url: origin },
      publisher: { '@type': 'Organization', name: 'فلسي Felsy', logo: { '@type': 'ImageObject', url: `${origin}/logo-square.png` } },
      articleSection: categoryLabel(post.category), keywords: (post.tags || []).join(', '),
    },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: origin },
      { '@type': 'ListItem', position: 2, name: 'المدونة', item: `${origin}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ] },
  ];
  if (Array.isArray(post.faq) && post.faq.length) {
    graph.push({ '@type': 'FAQPage', mainEntity: post.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

