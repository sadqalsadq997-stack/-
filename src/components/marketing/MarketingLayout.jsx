import React, { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig, useScroll, useSpring } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import zatcaLogo from '@/assets/zatca-logo-wide.png';
import { SITE, SOLUTIONS, getHead } from '@/content/seo';
import PaymentBadges from '@/components/payments/PaymentBadges';

// ── تحديث وسوم الـ head عند التنقل داخل الموقع (SPA) ───────────────
export function useHead(path, override) {
  useEffect(() => {
    const h = override || getHead(path);
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
    if (h.image) meta('property', 'og:image', h.image);
  }, [path, override]);
}

const NAV = [
  { to: '/electronic-pager', ar: 'البيجر الإلكتروني', en: 'Digital Pager' },
  { to: '/accounting-software', ar: 'المحاسبة', en: 'Accounting' },
  { to: '/zatca-e-invoicing', ar: 'الفوترة الإلكترونية', en: 'E-Invoicing' },
  { to: '/pricing', ar: 'الأسعار', en: 'Pricing' },
  { to: '/blog', ar: 'المدونة', en: 'Blog' },
  { to: '/careers', ar: 'الوظائف', en: 'Careers' },
];


function WhatsAppBrand({ className = '' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M20.52 3.48A11.82 11.82 0 0 0 12.08 0C5.48 0 .12 5.36.12 11.96c0 2.11.55 4.17 1.6 5.98L0 24l6.23-1.63a11.94 11.94 0 0 0 5.84 1.49h.01c6.6 0 11.96-5.36 11.96-11.96 0-3.2-1.25-6.2-3.52-8.42ZM12.08 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.6-.23-.37a9.9 9.9 0 0 1-1.52-5.25c0-5.45 4.43-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 6.99c0 5.45-4.44 9.88-9.9 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.31 1.26.5 1.69.64.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg>;
}
function InstagramBrand({ className = '' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;
}
function TikTokBrand({ className = '' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.35V2h-3.4v13.67a2.9 2.9 0 0 1-2.9 2.74 2.9 2.9 0 1 1 0-5.8c.3 0 .6.05.87.13V9.27a6.5 6.5 0 1 0 5.43 6.4V8.73a8.16 8.16 0 0 0 4.77 1.53V6.87c-.35 0-.68-.06-1-.18Z"/></svg>;
}

export default function MarketingLayout({ children, path, head }) {
  const location = useLocation();
  const { lang, switchLang } = useI18n();
  const en = lang === 'en';
  const current = path || location.pathname;
  useHead(current, head);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [solOpen, setSolOpen] = useState(false);
  const [footerOpen, setFooterOpen] = useState('company');
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
      <div dir={en ? "ltr" : "rtl"} lang={lang} className="min-h-screen bg-paper text-ink antialiased">
        <motion.div className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-[100%] bg-sage-500" style={{ scaleX: progress }} />

        <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${solid ? 'border-b border-slate-200/80 bg-white/90 backdrop-blur-xl' : 'bg-transparent'}`}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link to="/" className="flex items-center" aria-label="فلسي — الرئيسية">
              <Logo size={38} />
            </Link>
            <nav aria-label="الرئيسية" className="hidden items-center gap-6 text-[15px] font-medium text-ink/70 lg:flex">
              <div className="relative" onMouseLeave={() => setSolOpen(false)}>
                <button onClick={() => setSolOpen(o => !o)} onMouseEnter={() => setSolOpen(true)} aria-expanded={solOpen}
                  className="flex items-center gap-1 hover:text-sage-700">{en ? 'Solutions' : 'الحلول'} <ChevronDown className="h-4 w-4" /></button>
                <AnimatePresence>
                  {solOpen && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      className="absolute start-0 top-full w-64 pt-3">
                      <ul className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {SOLUTIONS.map(s => (
                          <li key={s.slug}><Link to={`/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 hover:text-sage-700">{en ? (s.nav_en || s.nav) : s.nav}</Link></li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {NAV.map(n => (
                <Link key={n.to} to={n.to} className={`transition-colors hover:text-sage-700 ${current === n.to ? 'text-sage-700' : ''}`}>{en ? n.en : n.ar}</Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => switchLang(en ? "ar" : "en")} className="rounded-full border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{en ? "العربية" : "English"}</button>
              <Link to="/auth/login" className="hidden text-sm font-bold text-slate-700 hover:text-sage-700 sm:block">{en ? "Login" : "دخول"}</Link>
              <Link to="/auth/signup" className="hidden rounded-full bg-sage-400 px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-sage-500 sm:block">{en ? "Start from SAR 29" : "ابدأ بـ 29 ريال"}</Link>
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
                  <Link to="/pricing" className="rounded-lg px-3 py-2.5 font-bold text-slate-800 hover:bg-slate-50">{en ? 'Pricing' : 'الأسعار'}</Link>
                  <Link to="/careers" className="rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{en ? 'Careers' : 'الوظائف'}</Link>
                  {SOLUTIONS.map(s => (
                    <Link key={s.slug} to={`/${s.slug}`} className="rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{s.nav}</Link>
                  ))}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Link to="/auth/login" className="rounded-xl border border-slate-200 py-2.5 text-center text-sm font-bold">دخول</Link>
                    <Link to="/auth/signup" className="rounded-xl bg-sage-400 py-2.5 text-center text-sm font-bold text-ink">{en ? 'Create account' : 'أنشئ حسابك'}</Link>
                  </div>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main id="top">{children}</main>

        <footer className="bg-[#292a2f] px-4 pt-12 text-[#d5d5d7] sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex justify-center pb-10"><Logo size={54} variant="light" /></div>
            <div className="divide-y divide-white/15 border-y border-white/15">
              {[
                {key:'company',title:en?'Company':'الشركة',links:[[en?'About us':'من نحن','/about'],[en?'Careers':'الوظائف','/careers'],[en?'Blog':'المدونة','/blog']]},
                {key:'service',title:en?'Customer service':'خدمة العملاء',links:[[en?'Contact us':'تواصل معنا','/contact'],[en?'WhatsApp support':'الدعم عبر واتساب',SITE.whatsapp]]},
                {key:'policies',title:en?'Policies':'السياسات',links:[[en?'Privacy policy':'سياسة الخصوصية','/privacy'],[en?'Terms & conditions':'الشروط والأحكام','/terms'],[en?'Refund policy':'سياسة الاسترداد','/refund-policy']]}
              ].map(section => <section key={section.key} className="py-4">
                <button type="button" onClick={() => setFooterOpen(open => open === section.key ? '' : section.key)}
                  aria-expanded={footerOpen === section.key} className="flex w-full cursor-pointer items-center justify-between py-1 text-start text-lg font-medium text-white hover:text-white/80">
                  {section.title}<span className="text-2xl leading-none transition-transform">{footerOpen === section.key ? '−' : '+'}</span>
                </button>
                {footerOpen === section.key && <ul className="mt-4 space-y-3 pb-2 text-sm">
                  {section.links.map(([label,href]) => <li key={label}>{href.startsWith('http') ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-white">{label}</a> : <Link to={href} className="hover:text-white">{label}</Link>}</li>)}
                </ul>}
              </section>)}
            </div>
            <div className="py-8 text-center">
              <p className="text-sm">{en ? 'Riyadh, Saudi Arabia' : 'الرياض، المملكة العربية السعودية'}</p>
              <a href={`tel:${SITE.phone}`} className="mt-3 inline-block text-sm font-semibold tracking-wide" dir="ltr">{SITE.phone}</a>
              <div className="mt-8 flex justify-center"><PaymentBadges tone="dark" title="" /></div>
            </div>
            <div className="flex flex-col items-center justify-between gap-5 border-t border-white/15 py-6 sm:flex-row">
              <div className="flex items-center gap-6">
                <a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="rounded-full p-2 transition hover:bg-white/10 hover:text-white"><WhatsAppBrand className="h-6 w-6" /></a>
                <a href="https://www.tiktok.com/@felsy.sa" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="rounded-full p-2 transition hover:bg-white/10 hover:text-white"><TikTokBrand className="h-6 w-6" /></a>
                <a href="https://www.instagram.com/felsy.sa/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full p-2 transition hover:bg-white/10 hover:text-white"><InstagramBrand className="h-6 w-6" /></a>
              </div>
              <p className="text-center text-sm">© {new Date().getFullYear()} Felsy. {en ? 'All rights reserved.' : 'جميع الحقوق محفوظة.'}</p>
            </div>
          </div>
          <div className="mt-2 border-t border-white/15 bg-[#202126]">
            <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 px-4 py-6 text-center sm:flex-row sm:gap-6">
              <img src={zatcaLogo} alt="شعار هيئة الزكاة والضريبة والجمارك" className="h-12 w-auto object-contain" />
              <div><p className="font-bold text-white">{en ? 'Designed to support ZATCA e-invoicing requirements' : 'متوافق مع متطلبات الفوترة الإلكترونية لهيئة الزكاة والضريبة والجمارك'}</p><p className="mt-1 text-xs text-slate-400">{en ? 'Subject to correct configuration and applicable ZATCA requirements.' : 'يعتمد الامتثال على إعداد المنشأة واستيفاء المتطلبات النظامية المطبقة.'}</p></div>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
