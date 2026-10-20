import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig, useScroll, useSpring } from 'framer-motion';
import { Menu, X, Phone, Mail, MapPin, ChevronDown } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import zatcaLogo from '@/assets/zatca-logo-wide.png';
import { SITE, SOLUTIONS, getHead } from '@/content/seo';

// ── تحديث وسوم الـ head عند التنقل داخل الموقع (SPA) ───────────────
export function useHead(path) {
  useEffect(() => {
    const h = getHead(path);
    if (!h || typeof document === 'undefined') return;
    document.title = h.title;
    const meta = (attr, key, val) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    meta('name', 'description', h.description);
    meta('name', 'keywords', h.keywords);
    meta('name', 'robots', 'index,follow,max-image-preview:large');
    meta('property', 'og:title', h.title);
    meta('property', 'og:description', h.description);
    meta('property', 'og:url', h.canonical);
    meta('name', 'twitter:title', h.title);
    meta('name', 'twitter:description', h.description);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = h.canonical;
    let ld = document.getElementById('ld-json');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-json'; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify(h.jsonLd);
  }, [path]);
}

const NAV = [
  { to: '/electronic-pager', label: 'البيجر الإلكتروني' },
  { to: '/accounting-software', label: 'المحاسبة' },
  { to: '/zatca-e-invoicing', label: 'الفوترة الإلكترونية' },
  { to: '/pricing', label: 'الأسعار' },
];

export default function MarketingLayout({ children, path }) {
  const location = useLocation();
  const current = path || location.pathname;
  useHead(current);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [solOpen, setSolOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setMenuOpen(false); setSolOpen(false); window.scrollTo?.(0, 0); }, [location.pathname]);

  const solid = scrolled || menuOpen || current !== '/';

  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" lang="ar" className="min-h-screen bg-paper text-ink antialiased">
        <motion.div className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-[100%] bg-sage-500" style={{ scaleX: progress }} />

        <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid ? 'border-b border-slate-200/80 bg-white/90 backdrop-blur-xl' : 'bg-transparent'}`}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link to="/" className="flex items-center" aria-label="فلسي — الرئيسية">
              <Logo size={38} />
            </Link>
            <nav aria-label="الرئيسية" className="hidden items-center gap-6 text-[15px] font-medium text-ink/70 lg:flex">
              <div className="relative" onMouseLeave={() => setSolOpen(false)}>
                <button onClick={() => setSolOpen(o => !o)} onMouseEnter={() => setSolOpen(true)} aria-expanded={solOpen}
                  className="flex items-center gap-1 hover:text-sage-700">الحلول <ChevronDown className="h-4 w-4" /></button>
                <AnimatePresence>
                  {solOpen && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      className="absolute start-0 top-full w-64 pt-3">
                      <ul className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {SOLUTIONS.map(s => (
                          <li key={s.slug}><Link to={`/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 hover:text-sage-700">{s.nav}</Link></li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {NAV.map(n => (
                <Link key={n.to} to={n.to} className={`transition-colors hover:text-sage-700 ${current === n.to ? 'text-sage-700' : ''}`}>{n.label}</Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/auth/login" className="hidden text-sm font-bold text-slate-700 hover:text-sage-700 sm:block">دخول</Link>
              <Link to="/auth/signup" className="hidden rounded-full bg-sage-400 px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-sage-500 sm:block">ابدأ بـ 29 ريال</Link>
              <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(o => !o)} aria-label="القائمة" aria-expanded={menuOpen}>
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {menuOpen && (
              <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="max-h-[80vh] overflow-y-auto border-t border-slate-100 lg:hidden">
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <Link to="/pricing" className="rounded-lg px-3 py-2.5 font-bold text-slate-800 hover:bg-slate-50">الأسعار</Link>
                  {SOLUTIONS.map(s => (
                    <Link key={s.slug} to={`/${s.slug}`} className="rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{s.nav}</Link>
                  ))}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Link to="/auth/login" className="rounded-xl border border-slate-200 py-2.5 text-center text-sm font-bold">دخول</Link>
                    <Link to="/auth/signup" className="rounded-xl bg-sage-400 py-2.5 text-center text-sm font-bold text-ink">أنشئ حسابك</Link>
                  </div>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main id="top">{children}</main>

        <footer className="bg-ink px-4 pb-8 pt-16 text-slate-400 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <Logo size={40} variant="light" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed">فلسي (Felsy) نظام نقاط بيع سحابي سعودي: كاشير، محاسبة، فوترة إلكترونية، وبيجر إلكتروني — من 29 ريال شهرياً.</p>
              <div className="mt-5 inline-flex rounded-xl bg-white px-3 py-2"><img src={zatcaLogo} alt="متوافق مع هيئة الزكاة والضريبة والجمارك" className="h-8 w-auto" /></div>
            </div>
            <nav aria-label="الحلول">
              <p className="mb-3 text-sm font-bold text-white">الحلول</p>
              <ul className="space-y-2 text-sm">
                {SOLUTIONS.slice(0, 4).map(s => <li key={s.slug}><Link to={`/${s.slug}`} className="hover:text-white">{s.nav}</Link></li>)}
              </ul>
            </nav>
            <nav aria-label="المزيد">
              <p className="mb-3 text-sm font-bold text-white">المزيد</p>
              <ul className="space-y-2 text-sm">
                {SOLUTIONS.slice(4).map(s => <li key={s.slug}><Link to={`/${s.slug}`} className="hover:text-white">{s.nav}</Link></li>)}
                <li><Link to="/pricing" className="hover:text-white">الأسعار</Link></li>
              </ul>
            </nav>
            <div>
              <p className="mb-3 text-sm font-bold text-white">تواصل معنا</p>
              <ul className="space-y-2.5 text-sm">
                <li><a href={`tel:${SITE.phone}`} className="inline-flex items-center gap-2 hover:text-white"><Phone className="h-4 w-4" /><span dir="ltr">{SITE.phone}</span></a></li>
                <li><a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 hover:text-white"><Mail className="h-4 w-4" />{SITE.email}</a></li>
                <li className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />الرياض، المملكة العربية السعودية</li>
              </ul>
            </div>
          </div>
          <div className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs sm:flex-row">
            <p>© {new Date().getFullYear()} فلسي Felsy. جميع الحقوق محفوظة.</p>
            <ul className="flex gap-5">
              <li><Link to="/about" className="hover:text-white">من نحن</Link></li>
              <li><Link to="/terms" className="hover:text-white">الشروط والأحكام</Link></li>
              <li><Link to="/privacy" className="hover:text-white">سياسة الخصوصية</Link></li>
            </ul>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
