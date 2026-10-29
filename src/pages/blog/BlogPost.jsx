import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, ChevronLeft, Share2, Check, MessageCircle, ArrowLeft, ListTree } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { supabase } from '@/integrations/supabase/client';
import { renderMarkdown } from '@/lib/markdown';
import { categoryLabel, fmtDateAr, absImage, articleJsonLd } from '@/content/blog';
import { whatsappLink } from '@/lib/contact';
import { PostCard } from './BlogList';

function CTA({ kind }) {
  if (kind === 'none') return null;
  const wa = kind === 'whatsapp' || kind === 'demo';
  return (
    <div className="my-12 overflow-hidden rounded-3xl bg-ink p-8 text-white sm:p-10">
      <p className="text-2xl font-black">{wa ? 'تبي نشوف وضع منشأتك سوا؟' : 'جرّب فلسي لمنشأتك'}</p>
      <p className="mt-2 text-white/70">كاشير + فوترة إلكترونية + بيجر + ولاء — من 29 ⃁ للفرع شهرياً، فواتير بلا حد.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/auth/signup" className="inline-flex h-12 items-center rounded-2xl bg-white px-6 font-black text-ink">ابدأ الآن</Link>
        <a href={whatsappLink('السلام عليكم، قرأت مقالكم وأبي أستفسر عن فلسي')} target="_blank" rel="noopener"
          className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/30 px-6 font-bold"><MessageCircle className="h-5 w-5" />كلمنا واتساب</a>
      </div>
    </div>
  );
}

export default function BlogPost() {
  const { slug: raw } = useParams();
  const slug = decodeURIComponent(raw || '');
  const [post, setPost] = useState(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setPost(undefined);
    supabase.rpc('public_blog_post', { p_slug: slug }).then(({ data }) => alive && setPost(data || null));
    return () => { alive = false; };
  }, [slug]);

  const rendered = useMemo(() => (post ? renderMarkdown(post.content) : null), [post]);
  const url = `https://felsy.org/blog/${encodeURIComponent(slug)}`;
  const head = useMemo(() => (post ? {
    title: `${post.seo_title || post.title} | مدونة فلسي`, description: post.seo_description || post.excerpt || '',
    keywords: (post.tags || []).join(', '), canonical: url, image: absImage(post.cover_url), jsonLd: articleJsonLd(post, url),
  } : { title: 'مدونة فلسي', description: '', keywords: '', canonical: url, jsonLd: {} }), [post, url]);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    } catch { /* إلغاء المشاركة */ }
  }

  return (
    <MarketingLayout path={`/blog/${slug}`} head={head}>
      {post === undefined ? (
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-32"><div className="h-10 w-3/4 animate-pulse rounded-xl bg-slate-100" /><div className="mt-6 h-64 animate-pulse rounded-3xl bg-slate-100" /></div>
      ) : !post ? (
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-36 text-center">
          <h1 className="text-3xl font-black">المقالة غير موجودة</h1>
          <Link to="/blog" className="mt-6 inline-flex font-bold text-sage-700">تصفح كل المقالات ←</Link>
        </div>
      ) : (
        <article className="px-4 pb-16 pt-28 sm:px-6 lg:pt-32">
          <div className="mx-auto max-w-3xl">
            <nav aria-label="مسار التنقل" className="flex items-center gap-1 text-sm text-slate-500">
              <Link to="/" className="hover:text-sage-700">الرئيسية</Link><ChevronLeft className="h-4 w-4" />
              <Link to="/blog" className="hover:text-sage-700">المدونة</Link><ChevronLeft className="h-4 w-4" />
              <Link to={`/blog?c=${post.category}`} className="hover:text-sage-700">{categoryLabel(post.category)}</Link>
            </nav>
            <h1 className="mt-4 text-3xl font-black leading-tight text-ink sm:text-5xl">{post.title}</h1>
            {post.excerpt && <p className="mt-4 text-lg leading-relaxed text-slate-600">{post.excerpt}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 pb-6 text-sm text-slate-500">
              <span className="font-bold text-ink">{post.author_name}</span>
              <time dateTime={post.published_at}>{fmtDateAr(post.published_at)}</time>
              {post.reading_minutes && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{post.reading_minutes} دقائق قراءة</span>}
              <button onClick={share} className="mr-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-200">
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {copied ? 'تم النسخ' : 'مشاركة'}
              </button>
            </div>
          </div>

          {post.cover_url && (
            <figure className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-3xl">
              <img src={post.cover_url} alt={post.cover_alt || post.title} className="aspect-[16/9] w-full object-cover" />
            </figure>
          )}

          <div className="mx-auto mt-10 max-w-3xl">
            {rendered.toc.length >= 3 && (
              <details className="mb-8 rounded-2xl border border-slate-200 bg-white p-4" open>
                <summary className="flex cursor-pointer items-center gap-2 font-black"><ListTree className="h-5 w-5 text-sage-700" />محتويات المقالة</summary>
                <ol className="mt-3 space-y-1.5 text-[15px]">
                  {rendered.toc.map(t => <li key={t.id} className={t.level === 3 ? 'pr-5 text-slate-500' : 'font-medium'}><a href={`#${t.id}`} className="hover:text-sage-700">{t.text}</a></li>)}
                </ol>
              </details>
            )}
            {/* المحتوى محوَّل بمحوّل آمن (يهرّب كل HTML) — راجع src/lib/markdown.js */}
            <div className="prose-felsy" dangerouslySetInnerHTML={{ __html: rendered.html }} />

            {Array.isArray(post.faq) && post.faq.length > 0 && (
              <section className="mt-12">
                <h2 className="mb-4 text-2xl font-black">أسئلة شائعة</h2>
                <div className="space-y-3">
                  {post.faq.map((f, i) => (
                    <details key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <summary className="cursor-pointer font-bold">{f.q}</summary>
                      <p className="mt-2 leading-relaxed text-slate-600">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {post.tags?.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2">
                {post.tags.map(t => <Link key={t} to={`/blog?q=${encodeURIComponent(t)}`} className="rounded-full bg-sage-50 px-3 py-1 text-sm font-medium text-sage-800 hover:bg-sage-100">#{t}</Link>)}
              </div>
            )}

            <CTA kind={post.cta} />
          </div>

          {post.related?.length > 0 && (
            <section className="mx-auto max-w-6xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black">مقالات ذات صلة</h2>
                <Link to="/blog" className="flex items-center gap-1 font-bold text-sage-700">كل المقالات <ArrowLeft className="h-4 w-4" /></Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{post.related.map(p => <PostCard key={p.slug} p={p} />)}</div>
            </section>
          )}
        </article>
      )}
    </MarketingLayout>
  );
}
