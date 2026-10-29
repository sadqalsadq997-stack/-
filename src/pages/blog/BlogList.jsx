import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Clock, ArrowLeft, Rss, Newspaper } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { supabase } from '@/integrations/supabase/client';
import { BLOG_CATEGORIES, BLOG_TITLE, BLOG_DESC, categoryLabel, fmtDateAr } from '@/content/blog';

const PAGE = 12;

export function PostCard({ p, big = false }) {
  return (
    <Link to={`/blog/${encodeURIComponent(p.slug)}`}
      className={`group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-xl ${big ? 'md:flex-row' : ''}`}>
      <div className={`relative overflow-hidden bg-gradient-to-br from-sage-100 to-beige ${big ? 'aspect-[16/9] md:aspect-auto md:w-1/2' : 'aspect-[16/9]'}`}>
        {p.cover_url
          ? <img src={p.cover_url} alt={p.cover_alt || p.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="flex h-full items-center justify-center"><Newspaper className="h-12 w-12 text-sage-400" /></div>}
        <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-sage-800 shadow-sm">{categoryLabel(p.category)}</span>
      </div>
      <div className={`flex flex-1 flex-col p-5 ${big ? 'md:justify-center md:p-8' : ''}`}>
        <h2 className={`font-black leading-snug text-ink group-hover:text-sage-700 ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{p.title}</h2>
        {p.excerpt && <p className={`mt-2 text-slate-600 ${big ? 'line-clamp-3' : 'line-clamp-2 text-sm'}`}>{p.excerpt}</p>}
        <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-slate-500">
          <time dateTime={p.published_at}>{fmtDateAr(p.published_at)}</time>
          {p.reading_minutes && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.reading_minutes} د قراءة</span>}
          <span className="mr-auto flex items-center gap-1 font-bold text-sage-700">اقرأ <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" /></span>
        </div>
      </div>
    </Link>
  );
}

export default function BlogList() {
  const [params, setParams] = useSearchParams();
  const cat = params.get('c') || '';
  const q = params.get('q') || '';
  const page = Math.max(0, Number(params.get('p') || 0));
  const [term, setTerm] = useState(q);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(d => (d ? { ...d, loading: true } : null));
    supabase.rpc('public_blog_list', { p_category: cat || null, p_q: q || null, p_limit: PAGE, p_offset: page * PAGE })
      .then(({ data: r }) => alive && setData(r || { rows: [], total: 0, categories: {} }));
    return () => { alive = false; };
  }, [cat, q, page]);

  useEffect(() => { const t = setTimeout(() => { if (term !== q) setParams(term ? { q: term } : {}, { replace: true }); }, 400); return () => clearTimeout(t); }, [term]); // eslint-disable-line

  const head = useMemo(() => ({
    title: cat ? `${categoryLabel(cat)} | مدونة فلسي` : BLOG_TITLE,
    description: cat ? (BLOG_CATEGORIES.find(c => c.id === cat)?.desc || BLOG_DESC) : BLOG_DESC,
    keywords: 'مدونة فلسي, نظام كاشير, الفوترة الإلكترونية, هيئة الزكاة, مطاعم, كافيهات, محلات',
    canonical: `https://felsy.org/blog${cat ? `?c=${cat}` : ''}`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: 'مدونة فلسي', url: 'https://felsy.org/blog', inLanguage: 'ar' },
  }), [cat]);

  const rows = data?.rows || [];
  const counts = data?.categories || {};
  const pages = Math.ceil((data?.total || 0) / PAGE);
  const [first, ...rest] = rows;
  const showHero = !q && page === 0 && first;

  return (
    <MarketingLayout path="/blog" head={head}>
      <section className="bg-gradient-to-b from-beige to-paper px-4 pb-10 pt-28 sm:px-6 lg:pt-36">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-bold text-sage-700">مدونة فلسي</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">حلول عملية لأصحاب المطاعم والمحلات</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">نكتب عن اللي يواجهك كل يوم: الكاشير، الضريبة والفوترة، المخزون، الولاء، وزيادة المبيعات — بلغة بسيطة وخطوات تقدر تطبقها اليوم.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input value={term} onChange={e => setTerm(e.target.value)} placeholder="ابحث في المقالات..." aria-label="بحث"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-4 pr-12 text-[15px] shadow-sm focus:border-sage-500 focus:outline-none" />
            </div>
            <a href="/blog/rss.xml" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-sage-700"><Rss className="h-4 w-4" />RSS</a>
          </div>
          <nav aria-label="التصنيفات" className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
            <button onClick={() => setParams({}, { replace: true })}
              className={`h-10 flex-shrink-0 rounded-full px-5 text-sm font-bold ${!cat ? 'bg-ink text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>الكل</button>
            {BLOG_CATEGORIES.filter(c => counts[c.id]).map(c => (
              <button key={c.id} onClick={() => setParams({ c: c.id }, { replace: true })}
                className={`h-10 flex-shrink-0 rounded-full px-5 text-sm font-bold ${cat === c.id ? 'bg-ink text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                {c.label} <span className="opacity-60">{counts[c.id]}</span>
              </button>
            ))}
          </nav>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {!data ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-3xl bg-slate-100" />)}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 py-20 text-center text-slate-500">{q ? `ما لقينا مقالات عن "${q}"` : 'المقالات قادمة قريباً'}</div>
          ) : (
            <>
              {showHero && <div className="mb-8"><PostCard p={first} big /></div>}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {(showHero ? rest : rows).map(p => <PostCard key={p.slug} p={p} />)}
              </div>
              {pages > 1 && (
                <nav aria-label="الصفحات" className="mt-12 flex justify-center gap-2">
                  {Array.from({ length: pages }).map((_, i) => (
                    <button key={i} onClick={() => setParams({ ...(cat ? { c: cat } : {}), ...(q ? { q } : {}), p: String(i) })}
                      className={`h-10 w-10 rounded-xl text-sm font-bold ${i === page ? 'bg-ink text-white' : 'bg-white ring-1 ring-slate-200'}`}>{i + 1}</button>
                  ))}
                </nav>
              )}
            </>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
