import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BellRing, Calculator, UtensilsCrossed, Coffee, ShoppingBag, ReceiptText, Globe, Car, Check, ArrowLeft, ChevronLeft, Receipt, Package, Gift,
} from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { Reveal, FAQList, CTABand } from '@/components/marketing/blocks';
import { SOLUTIONS, PRICES } from '@/content/seo';

const ICONS = { BellRing, Calculator, UtensilsCrossed, Coffee, ShoppingBag, ReceiptText, Globe, Car, Receipt, Package, Gift };

export default function SolutionPage({ slug }) {
  const page = SOLUTIONS.find(s => s.slug === slug);
  if (!page) return <Navigate to="/" replace />;
  const Icon = ICONS[page.icon] || ReceiptText;
  const related = page.related.map(r => SOLUTIONS.find(s => s.slug === r)).filter(Boolean);

  return (
    <MarketingLayout path={`/${slug}`}>
      <article>
        {/* الهيرو */}
        <header className="relative overflow-hidden bg-beige px-4 pb-28 pt-28 sm:px-6 lg:pt-32">
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 60 C240 10 480 90 720 50 C960 10 1200 70 1440 30 L1440 96 L0 96 Z" fill="#A3C1AD" opacity="0.35" />
            <path d="M0 80 C300 50 520 100 760 74 C1000 48 1220 86 1440 64 L1440 96 L0 96 Z" fill="#FAFAFA" />
          </svg>
          <div className="relative mx-auto max-w-6xl">
            <nav aria-label="مسار التنقل" className="mb-8 flex items-center gap-1.5 text-sm text-slate-500">
              <Link to="/" className="hover:text-sage-700">الرئيسية</Link>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span aria-current="page" className="text-ink/80">{page.nav}</span>
            </nav>
            <div className="grid items-start gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-700 text-white">
                  <Icon className="h-7 w-7" />
                </motion.span>
                <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                  className="text-4xl font-black leading-[1.2] tracking-tight sm:text-5xl">{page.h1}</motion.h1>
                <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}
                  className="mt-6 max-w-2xl text-lg leading-relaxed text-ink/65">{page.lead}</motion.p>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }}
                  className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/auth/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-sage-400 px-7 py-4 text-lg font-black text-ink shadow-lg shadow-sage-500/30 hover:bg-sage-500">
                    ابدأ بـ {PRICES[0].price} ريال شهرياً <ArrowLeft className="h-5 w-5" />
                  </Link>
                  <Link to="/pricing" className="inline-flex items-center justify-center rounded-full border-2 border-sage-300 bg-white px-7 py-4 text-lg font-bold text-slate-800 hover:border-slate-500">
                    قارن الباقات
                  </Link>
                </motion.div>
              </div>
              <motion.ul initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
                className="rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)]">
                {page.highlights.map(h => (
                  <li key={h} className="flex items-center gap-3 border-b border-slate-100 py-3.5 font-bold last:border-0">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-sage-50 text-sage-700"><Check className="h-4 w-4" /></span>
                    {h}
                  </li>
                ))}
              </motion.ul>
            </div>
          </div>
        </header>

        {/* الأقسام */}
        <div className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-16">
            {page.sections.map(sec => (
              <Reveal key={sec.h2}>
                <section>
                  <h2 className="text-3xl font-black leading-snug">{sec.h2}</h2>
                  {sec.body && <p className="mt-4 text-lg leading-loose text-ink/65">{sec.body}</p>}
                  {sec.points && (
                    <ul className="mt-6 space-y-3">
                      {sec.points.map(pt => (
                        <li key={pt} className="flex gap-3 text-[17px] leading-relaxed text-ink/80">
                          <span className="mt-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-sage-500" />{pt}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </Reveal>
            ))}

            <Reveal>
              <section className="rounded-3xl bg-ink p-8 text-white">
                <h2 className="text-2xl font-black">كم السعر؟</h2>
                <p className="mt-3 text-slate-300">كل باقات فلسي فيها نقطة البيع والفوترة الإلكترونية والبيجر الإلكتروني:</p>
                <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                  {PRICES.map(p => (
                    <li key={p.code} className="rounded-2xl bg-white/5 p-4">
                      <p className="text-sm text-slate-400">{p.name}</p>
                      <p className="mt-1"><span className="text-3xl font-black">{p.price}</span> <span className="text-sm text-slate-400">ريال / شهرياً</span></p>
                    </li>
                  ))}
                </ul>
                <Link to="/pricing" className="mt-6 inline-flex items-center gap-1.5 font-bold text-peach-300 hover:text-peach-200">تفاصيل الباقات <ArrowLeft className="h-4 w-4" /></Link>
              </section>
            </Reveal>

            <section aria-labelledby="faq-h">
              <h2 id="faq-h" className="mb-6 text-3xl font-black">أسئلة شائعة</h2>
              <FAQList faqs={page.faqs} />
            </section>

            {related.length > 0 && (
              <nav aria-label="حلول ذات صلة">
                <h2 className="mb-4 text-xl font-black">حلول ذات صلة</h2>
                <ul className="grid gap-3 sm:grid-cols-3">
                  {related.map(r => {
                    const RIcon = ICONS[r.icon] || ReceiptText;
                    return (
                      <li key={r.slug}>
                        <Link to={`/${r.slug}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 font-bold hover:border-sage-500 hover:text-sage-700">
                          <RIcon className="h-5 w-5" />{r.nav}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        </div>
      </article>
      <CTABand />
    </MarketingLayout>
  );
}
