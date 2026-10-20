import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import zatcaLogo from '@/assets/zatca-logo-wide.png';
import {
  Check, Receipt, ChefHat, Package, BarChart3, Globe, Gift, Car, Users, Truck, Cloud, Sparkles,
  UtensilsCrossed, Coffee, ShoppingBag, Printer, QrCode, CreditCard, ArrowLeft, BellRing, Calculator, ReceiptText,
} from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { Reveal, PricingCards, FAQList, CTABand } from '@/components/marketing/blocks';
import { HeroVisual, HeroWaves, ChartCardVisual, PhoneCardVisual, InvoiceCardVisual, SetupVisual } from '@/components/marketing/illustrations';
import { HOME_FAQS, SOLUTIONS } from '@/content/seo';

import zahraLogo from '@/assets/partners/zahra.png';
import alshamSweetsLogo from '@/assets/partners/alsham-sweets.png';
import brghCarLogo from '@/assets/partners/brgh-car.png';
import goldenRoseLogo from '@/assets/partners/golden-rose.png';
import goldenFeetLogo from '@/assets/partners/golden-feet.png';
import blackDeerLogo from '@/assets/partners/black-deer.png';
import florinaLogo from '@/assets/partners/florina.png';

const PARTNERS = [
  { name: 'زهرة', logo: zahraLogo },
  { name: 'حلويات الشام', logo: alshamSweetsLogo },
  { name: 'برق كار', logo: brghCarLogo },
  { name: 'جولدن روز', logo: goldenRoseLogo },
  { name: 'الأقدام الذهبية', logo: goldenFeetLogo },
  { name: 'بلاك دير', logo: blackDeerLogo },
  { name: 'فلورينا', logo: florinaLogo },
];

// ── عدّاد يبدأ عند ظهوره على الشاشة ─────────────────────────────
function Counter({ to, duration = 1600, suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    let timer;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      let start = 0;
      const step = to / (duration / 16);
      timer = setInterval(() => {
        start += step;
        if (start >= to) { setVal(to); clearInterval(timer); } else setVal(Math.floor(start));
      }, 16);
      obs.disconnect();
    });
    if (ref.current) obs.observe(ref.current);
    return () => { obs.disconnect(); clearInterval(timer); };
  }, [to, duration]);
  return <span ref={ref}>{val.toLocaleString('ar-SA')}{suffix}</span>;
}

// ── محاكاة حية لشاشة نقطة البيع ───────────────────────────────────
const DEMO_PRODUCTS = [
  { name: 'قهوة عربية', en: 'Arabic coffee', price: 18, emoji: '☕' },
  { name: 'كرواسون', en: 'Croissant', price: 14, emoji: '🥐' },
  { name: 'عصير برتقال', en: 'Orange juice', price: 16, emoji: '🍊' },
  { name: 'ساندويش', en: 'Sandwich', price: 24, emoji: '🥪' },
  { name: 'كيك شوكولاتة', en: 'Chocolate cake', price: 22, emoji: '🍫' },
  { name: 'موهيتو', en: 'Mojito', price: 19, emoji: '🍹' },
];

function LivePOSDemo({ t, lang }) {
  const [cart, setCart] = useState([]);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const timeouts = [];
    function runCycle() {
      setCart([]);
      setShowToast(false);
      const picks = [...DEMO_PRODUCTS].sort(() => Math.random() - 0.5).slice(0, 3);
      picks.forEach((p, i) => timeouts.push(setTimeout(() => setCart(c => [...c, p]), 700 * (i + 1))));
      timeouts.push(setTimeout(() => setShowToast(true), 700 * (picks.length + 1) + 300));
      timeouts.push(setTimeout(runCycle, 700 * (picks.length + 1) + 3200));
    }
    runCycle();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const total = cart.reduce((s, p) => s + p.price, 0);
  const label = p => (lang === 'ar' ? p.name : p.en);

  return (
    <div className="relative rounded-[28px] border border-white/10 bg-ink p-2 shadow-[0_40px_80px_-30px_rgba(44,62,80,0.45)]">
      <div className="overflow-hidden rounded-[22px] bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2">
          <div className="flex gap-1.5" dir="ltr">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="mx-auto max-w-[12rem] flex-1 rounded-md border border-slate-200 bg-white px-3 py-0.5 text-center text-[11px] text-slate-400" dir="ltr">
            felsy.org/pos
          </div>
        </div>

        <div className="flex min-h-[15rem] gap-3 bg-slate-50 p-3 sm:p-5">
          <div className="flex-1">
            <p className="mb-2 text-[11px] font-bold text-slate-500">{t('المشروبات والمأكولات', 'Drinks & food')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO_PRODUCTS.map((p, i) => {
                const active = cart.some(c => c.name === p.name);
                return (
                  <motion.div key={i} animate={active ? { scale: [1, 1.06, 1] } : {}} transition={{ duration: 0.4 }}
                    className={`flex h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border p-1.5 transition-colors ${active ? 'border-sage-300 bg-sage-50' : 'border-slate-200 bg-white'}`}>
                    <span className="text-lg leading-none">{p.emoji}</span>
                    <span className="text-[10px] leading-tight text-slate-600">{label(p)}</span>
                    <span className="text-[10px] font-bold leading-none text-sage-700">{p.price} {t('ر.س', 'SAR')}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="flex w-32 flex-col rounded-2xl border border-slate-200 bg-white p-2.5 sm:w-44 sm:p-3">
            <p className="mb-2 text-[10px] font-bold text-slate-400">{t('الطلب الحالي', 'Current order')}</p>
            <div className="min-h-[5rem] flex-1 space-y-1.5">
              <AnimatePresence mode="popLayout">
                {cart.map((p, i) => (
                  <motion.div key={p.name + i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5">
                    <span className="text-xs">{p.emoji}</span>
                    <span className="flex-1 truncate text-[10px] text-slate-600">{label(p)}</span>
                    <span className="text-[10px] font-bold text-slate-800">{p.price}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-[10px] text-slate-400">{t('الإجمالي', 'Total')}</span>
                <motion.span key={total} initial={{ scale: 1.3, color: '#6A8F77' }} animate={{ scale: 1, color: '#2C3E50' }}
                  className="text-xs font-black">{total} {t('ر.س', 'SAR')}</motion.span>
              </div>
              <div className="flex h-8 items-center justify-center rounded-lg bg-sage-400 text-[11px] font-bold text-ink">
                {t('دفع', 'Pay')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.92 }}
            className="absolute -bottom-5 start-6 flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-white px-4 py-2.5 shadow-xl">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-800">{t('تمت العملية بنجاح', 'Payment complete')}</p>
              <p className="text-[11px] text-slate-500">{t('الفاتورة الضريبية جاهزة', 'Tax invoice ready')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── فاتورة ZATCA بشكل إيصال حراري ────────────────────────────────
function QRMark() {
  // نمط زخرفي يشبه رمز QR (ثابت، ليس رمزاً حقيقياً)
  const N = 21;
  const finder = (x, y, ox, oy) => {
    const dx = x - ox, dy = y - oy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  const cells = [];
  let seed = 7;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    let on = finder(x, y, 0, 0) ?? finder(x, y, N - 7, 0) ?? finder(x, y, 0, N - 7);
    const nearFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    if (on === null) on = nearFinder ? false : (seed >> 8) % 2 === 0;
    if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} className="h-20 w-20 fill-ink" aria-hidden="true" shapeRendering="crispEdges">{cells}</svg>
  );
}

function ZatcaReceipt({ t }) {
  const rows = [
    [t('قهوة عربية × 2', 'Arabic coffee × 2'), '36.00'],
    [t('كرواسون', 'Croissant'), '14.00'],
    [t('كيك شوكولاتة', 'Chocolate cake'), '22.00'],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[19rem] rotate-[-2deg] bg-white px-6 pb-8 pt-6 text-[13px] text-ink shadow-[0_30px_60px_-25px_rgba(0,0,0,0.35)]"
      style={{ maskImage: 'radial-gradient(circle at 8px 100%, transparent 6px, #000 6.5px)', maskSize: '16px 100%', maskPosition: 'bottom', WebkitMaskImage: 'radial-gradient(circle at 8px 100%, transparent 6px, #000 6.5px)', WebkitMaskSize: '16px 100%' }}>
      <div className="text-center">
        <p className="text-base font-black">{t('مقهى الورد', 'Al-Ward Café')}</p>
        <p className="text-[11px] text-slate-500">{t('فاتورة ضريبية مبسطة', 'Simplified tax invoice')}</p>
        <p className="text-[11px] text-slate-500" dir="ltr">VAT 310XXXXXXX00003</p>
      </div>
      <div className="my-3 border-t border-dashed border-slate-300" />
      {rows.map(([a, b]) => (
        <div key={a} className="flex justify-between py-0.5"><span>{a}</span><span dir="ltr">{b}</span></div>
      ))}
      <div className="my-3 border-t border-dashed border-slate-300" />
      <div className="flex justify-between text-slate-500"><span>{t('ضريبة القيمة المضافة 15%', 'VAT 15%')}</span><span dir="ltr">9.39</span></div>
      <div className="mt-1 flex justify-between text-base font-black"><span>{t('الإجمالي', 'Total')}</span><span dir="ltr">72.00 SAR</span></div>
      <div className="mt-4 flex justify-center"><QRMark /></div>
    </div>
  );
}

// ── المزايا حسب نوع النشاط ─────────────────────────────────────────
const ALL_FEATURES = {
  pos:       { icon: Receipt,  ar: ['نقطة بيع سريعة', 'باركود، طابعات حرارية، مدى وآبل باي ونقد في شاشة واحدة'], en: ['Fast checkout', 'Barcode, thermal printers, mada, Apple Pay and cash on one screen'] },
  tables:    { icon: UtensilsCrossed, ar: ['الطاولات', 'افتح طلباً على الطاولة وأضف عليه حتى يطلب العميل الحساب'], en: ['Tables', 'Open an order on a table and keep adding until the guest asks for the bill'] },
  kitchen:   { icon: ChefHat,  ar: ['شاشة المطبخ', 'الطلب يوصل للمطبخ لحظة إرساله، مرتّب حسب الوقت'], en: ['Kitchen display', 'Orders reach the kitchen the moment they are sent, in time order'] },
  inventory: { icon: Package,  ar: ['المخزون', 'ينقص تلقائياً مع كل بيعة، وينبهك قبل ما تخلص الكمية'], en: ['Inventory', 'Deducted with every sale, with an alert before you run out'] },
  loyalty:   { icon: Gift,     ar: ['بطاقة الولاء', 'ختم رقمي في محفظة جوال العميل يرجّعه لك مرة ثانية'], en: ['Loyalty card', 'A digital stamp card in the customer’s phone wallet'] },
  store:     { icon: Globe,    ar: ['متجر إلكتروني', 'منيو وطلبات أونلاين على دومين باسم محلك'], en: ['Online store', 'Menu and online ordering on your own domain'] },
  cars:      { icon: Car,      ar: ['طلبات السيارات', 'استقبل طلب العميل وهو في سيارته وبلّغه لما يجهز'], en: ['Car orders', 'Take orders curbside and notify the customer when ready'] },
  reports:   { icon: BarChart3,ar: ['التقارير', 'مبيعات اليوم، أكثر المنتجات طلباً، وأداء كل موظف'], en: ['Reports', 'Daily sales, best sellers and per-employee performance'] },
  staff:     { icon: Users,    ar: ['الموظفون والصلاحيات', 'لكل موظف رمز PIN ويشوف بس الشاشات المسموحة له'], en: ['Staff & permissions', 'Each employee has a PIN and sees only their screens'] },
  suppliers: { icon: Truck,    ar: ['الموردون والمصروفات', 'سجّل مشترياتك ومصاريفك واعرف ربحك الفعلي'], en: ['Suppliers & expenses', 'Track purchases and costs to see your real profit'] },
  ai:        { icon: Sparkles, ar: ['المساعد الذكي', 'اسأله عن مبيعاتك بالعربي ويعطيك الجواب من بياناتك'], en: ['AI assistant', 'Ask about your sales in plain language'] },
  pager:     { icon: BellRing, ar: ['البيجر الإلكتروني', 'العميل يمسح الباركود ويرن جواله أول ما يجهز طلبه — بدون أجهزة'], en: ['Electronic pager', 'Customers scan a QR and their phone rings when the order is ready'] },
  cloud:     { icon: Cloud,    ar: ['يعمل بدون إنترنت', 'تكمل البيع إذا انقطع النت، ويتزامن أول ما يرجع'], en: ['Works offline', 'Keep selling when the internet drops; syncs when it’s back'] },
};

const INDUSTRIES = [
  { id: 'restaurant', icon: UtensilsCrossed, ar: 'مطعم',   en: 'Restaurant', keys: ['pos', 'tables', 'kitchen', 'pager', 'inventory', 'store'] },
  { id: 'cafe',       icon: Coffee,          ar: 'كافيه',  en: 'Café',       keys: ['pos', 'pager', 'loyalty', 'kitchen', 'inventory', 'cars'] },
  { id: 'retail',     icon: ShoppingBag,     ar: 'متجر',   en: 'Retail',     keys: ['pos', 'inventory', 'suppliers', 'store', 'loyalty', 'reports'] },
  { id: 'carwash',    icon: Car,             ar: 'مغسلة سيارات', en: 'Car wash', keys: ['pos', 'cars', 'pager', 'staff', 'loyalty', 'reports'] },
];

const SOLUTION_ICONS = { BellRing, Calculator, UtensilsCrossed, Coffee, ShoppingBag, ReceiptText, Globe, Car };

const HIGHLIGHT_CARDS = [
  { Art: ChartCardVisual, title: 'مبيعات وتقارير واضحة', sub: 'نقطة البيع والمحاسبة', text: 'كل بيعة تنزل في التقارير والحسابات لحظياً، وتعرف ربحك الفعلي من جوالك.', to: '/accounting-software' },
  { Art: PhoneCardVisual, title: 'البيجر الإلكتروني', sub: 'بدون أجهزة', text: 'العميل يمسح الباركود ويرن جواله أول ما يجهز طلبه. متاح في كل الباقات.', to: '/electronic-pager' },
  { Art: InvoiceCardVisual, title: 'فواتير معتمدة', sub: 'هيئة الزكاة — المرحلة الثانية', text: 'رمز QR وتوقيع إلكتروني وربط مع منصة فاتورة، بدون أي إجراء منك.', to: '/zatca-e-invoicing' },
];

const STEPS = [
  ['أنشئ حسابك', 'بالبريد أو حساب جوجل، واكتب اسم محلك.'],
  ['اختر باقتك وادفع', 'من 29 ريال بالشهر، بمدى أو فيزا أو ماستركارد. يتفعّل فوراً.'],
  ['أضف منتجاتك وابدأ', 'اضبط رمز PIN، أضف الموظفين، واطبع أول فاتورة اليوم.'],
];

export default function LandingPage() {
  const lang = 'ar';
  const isAr = true;
  const t = (ar) => ar;
  const [industry, setIndustry] = useState(INDUSTRIES[0].id);
  const current = INDUSTRIES.find(i => i.id === industry);

  return (
    <MarketingLayout path="/">
      {/* ── الهيرو ── */}
      <section className="relative overflow-hidden bg-beige px-4 pb-44 pt-28 sm:px-6 lg:pb-52 lg:pt-32">
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="relative z-10">
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="text-[2.4rem] font-extrabold leading-[1.25] text-ink sm:text-[3.2rem] lg:text-[3.4rem]">
              <span className="text-sage-700">فلسي:</span> تنمية أعمالك
              <span className="block">بذكاء وهدوء.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-ink/70">
              نظام نقاط بيع ومحاسبة سحابي للمطاعم والكافيهات والمحلات في السعودية — كاشير، مخزون، فواتير معتمدة من هيئة الزكاة، وبيجر إلكتروني لعملائك.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-flex">
                <Link to="/auth/signup" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sage-400 px-8 py-4 text-lg font-black text-ink shadow-[0_14px_30px_-14px_rgba(106,143,119,0.8)] transition-colors hover:bg-sage-500 sm:w-auto">
                  ابدأ بـ 29 ريال <ArrowLeft className="h-5 w-5" />
                </Link>
              </motion.span>
              <a href="#how" className="inline-flex items-center justify-center rounded-full px-6 py-4 text-lg font-bold text-sage-700 hover:bg-white/60">
                شوف كيف يشتغل
              </a>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-6 text-sm text-ink/55">
              بدون عقود ولا رسوم تركيب · أقل من ريال باليوم
            </motion.p>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}
            className="relative z-10 -mx-4 sm:mx-0">
            <HeroVisual />
          </motion.div>
        </div>
        <HeroWaves className="pointer-events-none absolute inset-x-0 -bottom-px h-56 w-full sm:h-72" />
      </section>

      {/* ── ثلاث بطاقات فوق الهيرو ── */}
      <section aria-label="أبرز المزايا" className="relative z-10 -mt-36 px-4 sm:px-6 lg:-mt-40">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {HIGHLIGHT_CARDS.map(({ Art, title, sub, text, to }, i) => (
            <motion.article key={title}
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 + i * 0.12 }}
              whileHover={{ y: -6 }}
              className="group flex flex-col rounded-[1.75rem] bg-white p-6 shadow-[0_24px_50px_-28px_rgba(23,53,46,0.35)] ring-1 ring-sage-100">
              <Art />
              <h3 className="mt-3 text-xl font-black text-ink">{title}</h3>
              <p className="text-sm font-bold text-sage-600">{sub}</p>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink/65">{text}</p>
              <Link to={to} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-peach-600 hover:text-peach-700">
                اعرف أكثر <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ── طريقتنا ── */}
      <section id="how" className="scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-4xl font-black leading-tight text-ink sm:text-5xl">تبدأ البيع خلال دقائق</h2>
            <p className="mt-4 max-w-md text-lg text-ink/65">ما تحتاج أجهزة خاصة ولا فني تركيب. فلسي يشتغل على الآيباد أو الكمبيوتر أو الجوال اللي عندك.</p>
            <ol className="mt-10 space-y-7">
              {STEPS.map(([title, desc], i) => (
                <li key={title} className="flex gap-5">
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-sage-100 text-lg font-black text-sage-700">
                    {(i + 1).toLocaleString('ar-SA')}
                  </span>
                  <div>
                    <h3 className="text-xl font-black text-ink">{title}</h3>
                    <p className="mt-1 text-ink/65">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.1}><SetupVisual /></Reveal>
        </div>
      </section>

      {/* ── شاشة البيع الحية ── */}
      <section className="bg-beige px-4 py-24 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <h2 className="text-4xl font-black leading-tight text-ink sm:text-5xl">كاشير سريع ما يعلّق وقت الزحمة</h2>
            <p className="mt-4 max-w-md text-lg text-ink/65">اختر المنتج، الإجمالي والضريبة تنحسب لحالها، والفاتورة تطلع جاهزة. ولو انقطع النت تكمل البيع عادي.</p>
            <ul className="mt-8 space-y-3">
              {['مدى، آبل باي، STC Pay ونقد', 'طابعات حرارية 58 و 80 ملم', 'يشتغل بدون إنترنت ويتزامن لحاله'].map(x => (
                <li key={x} className="flex items-center gap-3 font-bold text-ink/80">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-600 text-white"><Check className="h-3.5 w-3.5" /></span>{x}
                </li>
              ))}
            </ul>
          </Reveal>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
              <LivePOSDemo t={t} lang={lang} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── المزايا حسب نوع النشاط ── */}
      <section id="features" className="scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-black text-ink sm:text-5xl">وش نوع محلك؟</h2>
            <p className="mt-4 text-lg text-ink/65">اختر نشاطك وشوف الأدوات اللي بتستخدمها كل يوم.</p>
          </Reveal>
          <div role="tablist" aria-label="نوع النشاط" className="mt-10 flex flex-wrap justify-center gap-2">
            {INDUSTRIES.map(ind => {
              const on = ind.id === industry;
              return (
                <button key={ind.id} role="tab" aria-selected={on} onClick={() => setIndustry(ind.id)}
                  className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold transition-colors ${on ? 'text-white' : 'bg-sage-50 text-sage-700 hover:bg-sage-100'}`}>
                  {on && <motion.span layoutId="industry-pill" className="absolute inset-0 rounded-full bg-sage-700" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <ind.icon className="relative h-4 w-4" />
                  <span className="relative">{ind.ar}</span>
                </button>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            <motion.ul key={industry} role="tabpanel"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
              className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {current.keys.map(k => {
                const f = ALL_FEATURES[k];
                const [title, desc] = f.ar;
                return (
                  <li key={k} className="flex gap-4 rounded-3xl bg-white p-6 ring-1 ring-sage-100 transition-shadow hover:shadow-[0_20px_40px_-28px_rgba(23,53,46,0.4)]">
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-sage-50 text-sage-600">
                      <f.icon className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="font-black text-ink">{title}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink/65">{desc}</p>
                    </div>
                  </li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        </div>
      </section>

      {/* ── الفوترة الإلكترونية ── */}
      <section id="zatca" className="scroll-mt-20 overflow-hidden bg-paper px-4 py-24 text-ink sm:px-6">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-4xl font-black leading-tight sm:text-5xl">الفاتورة تطلع صحيحة من أول مرة</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink/65">
              كل بيعة تطلع لها فاتورة ضريبية فيها رمز QR وتوقيع إلكتروني، وتنرسل لمنصة فاتورة تلقائياً.
            </p>
            <ul className="mt-8 space-y-3">
              {[[QrCode, 'رمز QR حسب متطلبات الهيئة'], [Printer, 'طباعة على أي طابعة حرارية'], [CreditCard, 'ربط مباشر مع منصة فاتورة — المرحلة الثانية']].map(([Icon, txt]) => (
                <li key={txt} className="flex items-center gap-3 text-[15px]"><Icon className="h-5 w-5 flex-shrink-0 text-sage-700" strokeWidth={1.8} /> {txt}</li>
              ))}
            </ul>
            <div className="mt-10 inline-flex rounded-2xl border border-beige-200 bg-white px-5 py-3">
              <img src={zatcaLogo} alt="هيئة الزكاة والضريبة والجمارك" className="h-10 w-auto object-contain" />
            </div>
          </Reveal>
          <motion.div initial={{ opacity: 0, y: 40, rotate: 2 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7 }}>
            <ZatcaReceipt t={t} />
          </motion.div>
        </div>
      </section>

      {/* ── عملاؤنا ── */}
      <section aria-labelledby="clients-h" className="py-24">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <Reveal>
            <h2 id="clients-h" className="text-4xl font-black text-ink sm:text-5xl">محلات تثق في فلسي</h2>
            <p className="mt-4 text-lg text-ink/65">من المطاعم والكافيهات إلى محلات الأحذية ومغاسل السيارات.</p>
          </Reveal>
          <dl className="mx-auto mt-10 grid max-w-xl grid-cols-3 gap-4">
            {[[100, '+', 'منشأة'], [99, '%', 'رضا العملاء'], [4, '+', 'سنوات']].map(([n, s, l]) => (
              <div key={l} className="rounded-3xl bg-sage-50 py-5">
                <dt className="sr-only">{l}</dt>
                <dd className="text-3xl font-black text-sage-700"><Counter to={n} suffix={s} /></dd>
                <p className="text-sm text-ink/60">{l}</p>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative mt-12 w-full overflow-hidden" dir="ltr">
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <div key={i} className="mx-8 flex h-20 w-36 shrink-0 items-center justify-center">
                <img src={p.logo} alt={i < PARTNERS.length ? p.name : ''} aria-hidden={i >= PARTNERS.length}
                  className="max-h-full max-w-full object-contain opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0" />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white" />
        </div>
      </section>

      {/* ── الأسعار ── */}
      <section id="pricing" className="scroll-mt-20 bg-gradient-to-b from-sage-50 to-white px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <h2 className="text-4xl font-black text-ink sm:text-5xl">أسعار تريّح ميزانيتك</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-ink/65">الباقة الأساسية بأقل من ريال باليوم. ترقّي أو توقّف متى ما بغيت.</p>
          </Reveal>
          <div className="mt-16"><PricingCards /></div>
        </div>
      </section>

      {/* ── الحلول ── */}
      <section aria-labelledby="solutions-h" className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 id="solutions-h" className="text-4xl font-black text-ink sm:text-5xl">كل اللي يحتاجه محلك</h2></Reveal>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SOLUTIONS.map(s => {
              const Icon = SOLUTION_ICONS[s.icon] || Receipt;
              return (
                <li key={s.slug}>
                  <Link to={`/${s.slug}`} className="group flex items-center gap-3 rounded-2xl bg-sage-50 px-4 py-4 font-bold text-ink transition-colors hover:bg-sage-100">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sage-600"><Icon className="h-5 w-5" /></span>
                    <span className="flex-1">{s.nav}</span>
                    <ArrowLeft className="h-4 w-4 text-sage-500 transition-transform group-hover:-translate-x-1" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── الأسئلة ── */}
      <section id="faq" className="scroll-mt-20 px-4 pb-24 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.6fr]">
          <Reveal>
            <h2 className="text-4xl font-black text-ink sm:text-5xl">أسئلة تتكرر</h2>
            <p className="mt-4 text-ink/65">ما لقيت جوابك؟ كلّمنا على <a href="tel:+966542432992" className="font-bold text-sage-700 hover:underline" dir="ltr">+966542432992</a></p>
          </Reveal>
          <FAQList faqs={HOME_FAQS} />
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  );
}
