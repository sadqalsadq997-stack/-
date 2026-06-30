import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useSpring } from 'framer-motion';
import felsynLogo from '@/assets/felsy-logo.png';
import {
  Check, Star, ChevronDown, ArrowLeft, Shield, Zap, BarChart3,
  Printer, Users, Globe, Receipt, Package, Layers, Warehouse,
  Headphones, Smartphone, Cloud, Lock, ChefHat, Car, Gift,
  TrendingUp, CreditCard, Bell, CheckCircle2, Building2, Store, Truck
} from 'lucide-react';

// ── شعارات الشركاء (شعارات حقيقية) ──────────────────────────────────
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

import { PLANS, PLAN_SELECT_OPTIONS, CONTACT_INFO } from '@/lib/pricingPlans';
import zatcaLogo from '@/assets/zatca-logo.png';
import { useI18n } from '@/lib/i18n';

// ── ميزات النظام ──────────────────────────────────────────────────
const FEATURES = [
  { icon: Receipt, title: 'نقطة بيع متكاملة', desc: 'واجهة سريعة وسهلة مع دعم الباركود والطابعات الحرارية وأساليب دفع متعددة' },
  { icon: ChefHat, title: 'إدارة الطاولات والمطبخ', desc: 'أضف طلبات على الطاولات وأرسلها للمطبخ فوراً، ثم أغلق الفاتورة وحاسب العميل' },
  { icon: Package, title: 'إدارة المنتجات والمخزون', desc: 'تتبع الكميات وتنبيه نفاد المخزون وربط المخزون بالمبيعات تلقائياً' },
  { icon: BarChart3, title: 'تقارير وتحليلات', desc: 'لوحة تحكم شاملة مع توقعات المبيعات والمنتجات الأكثر طلباً وأداء الموظفين' },
  { icon: Globe, title: 'متجر إلكتروني', desc: 'موقع طلبات مخصص بدومين خاص لاستقبال الطلبات أونلاين بشكل احترافي' },
  { icon: Gift, title: 'برنامج الولاء', desc: 'بطاقة ختم رقمية تكافئ عملاءك المميزين وتزيد من تكرار زياراتهم' },
  { icon: Car, title: 'طلبات السيارات', desc: 'خاصية Car Wash و Drive-Through لاستقبال طلبات السيارات بلمسة واحدة' },
  { icon: Shield, title: 'متوافق مع الزكاة والضريبة', desc: 'فواتير ZATCA بالكود QR ومتطلبات الفوترة الإلكترونية المرحلة الثانية كاملة' },
  { icon: Zap, title: 'مساعد ذكاء اصطناعي', desc: 'اسأل النظام عن مبيعاتك وعملاءك واحصل على توصيات ذكية لتنمية أعمالك' },
  { icon: Users, title: 'إدارة الموظفين', desc: 'صلاحيات مخصصة لكل موظف مع تتبع الأداء وسجل العمليات الكاملة' },
  { icon: Truck, title: 'الموردين والمصروفات', desc: 'تتبع مشترياتك ومصروفاتك التشغيلية وانشئ تقارير الربح والخسارة بسهولة' },
  { icon: Cloud, title: 'تزامن سحابي فوري', desc: 'بياناتك محفوظة ومزامنة على السحابة مع إمكانية العمل أوفلاين مؤقتاً' },
];

// ── شعار هيئة الزكاة ─────────────────────────────────────────────
function ZATCABadge() {
  return (
    <img src={zatcaLogo} alt="هيئة الزكاة والضريبة والجمارك" className="h-20 w-auto object-contain" />
  );
}

// ── مكون الانماط المتحركة ─────────────────────────────────────────
function Counter({ to, duration = 2000, suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = to / (duration / 16);
        const timer = setInterval(() => {
          start += step;
          if (start >= to) { setVal(to); clearInterval(timer); } else setVal(Math.floor(start));
        }, 16);
        obs.disconnect();
      }
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val.toLocaleString('ar')}{suffix}</span>;
}

// ── تأثير ظهور تدريجي عند التمرير — يُستخدم لتنشيط كل قسم بأسلوب موحّد ──
function Reveal({ children, delay = 0, y = 24 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

// ── العنصر البصري المميز: محاكاة حية لشاشة نقطة بيع فعلية ──
// (بدل صناديق رمادية ثابتة — منتجات حقيقية، عربة تتحرك، إجمالي يتزايد، إشعار نجاح)
const DEMO_PRODUCTS = [
  { name: 'قهوة عربية', price: 18, emoji: '☕' },
  { name: 'كرواسون', price: 14, emoji: '🥐' },
  { name: 'عصير برتقال', price: 16, emoji: '🍊' },
  { name: 'ساندويش', price: 24, emoji: '🥪' },
  { name: 'كيك شوكولاتة', price: 22, emoji: '🍫' },
  { name: 'موهيتو', price: 19, emoji: '🍹' },
];

function LivePOSDemo() {
  const [cart, setCart] = useState([]);
  const [showToast, setShowToast] = useState(false);
  const cycleRef = useRef(0);

  useEffect(() => {
    let timeouts = [];
    function runCycle() {
      setCart([]);
      setShowToast(false);
      const picks = [...DEMO_PRODUCTS].sort(() => Math.random() - 0.5).slice(0, 3);
      picks.forEach((p, i) => {
        timeouts.push(setTimeout(() => setCart(c => [...c, p]), 700 * (i + 1)));
      });
      timeouts.push(setTimeout(() => setShowToast(true), 700 * (picks.length + 1) + 300));
      timeouts.push(setTimeout(() => runCycle(), 700 * (picks.length + 1) + 3200));
    }
    runCycle();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const total = cart.reduce((s, p) => s + p.price, 0);

  return (
    <div className="bg-gray-900 rounded-3xl p-2 shadow-2xl border border-gray-700 relative">
      <div className="bg-white rounded-2xl overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white rounded-lg px-3 py-1 text-xs text-gray-400 text-center border border-gray-200 max-w-xs mx-auto">
            🔒 felsy.org/pos
          </div>
        </div>

        <div className="bg-gray-50 p-6 min-h-64 flex gap-4">
          {/* شبكة المنتجات */}
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-red-100 rounded-lg w-32 flex items-center px-2 text-[10px] font-bold text-red-500">المشروبات والمأكولات</div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_PRODUCTS.map((p, i) => {
                const active = cart.some(c => c.name === p.name);
                return (
                  <motion.div key={i}
                    animate={active ? { scale: [1, 1.06, 1] } : {}}
                    transition={{ duration: 0.4 }}
                    className={`h-16 rounded-xl border flex flex-col items-center justify-center gap-0.5 p-2 transition-colors ${active ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
                    <span className="text-lg leading-none">{p.emoji}</span>
                    <span className="text-[9px] text-gray-500 leading-none">{p.name}</span>
                    <span className="text-[9px] font-bold text-red-500 leading-none">{p.price} ر.س</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* سلة الطلب الحية */}
          <div className="w-44 bg-white rounded-2xl border border-gray-200 p-3 flex flex-col">
            <div className="h-3 bg-gray-100 rounded w-20 mb-2 flex items-center px-1 text-[8px] text-gray-400 font-bold">الطلب الحالي</div>
            <div className="flex-1 space-y-1.5 min-h-20">
              <AnimatePresence mode="popLayout">
                {cart.map((p, i) => (
                  <motion.div key={p.name + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2">
                    <span className="text-xs">{p.emoji}</span>
                    <span className="flex-1 text-[9px] text-gray-600 truncate">{p.name}</span>
                    <span className="text-[9px] font-bold text-gray-700">{p.price}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[9px] text-gray-400">الإجمالي</span>
                <motion.span key={total} initial={{ scale: 1.3, color: '#dc2626' }} animate={{ scale: 1, color: '#111827' }}
                  className="text-xs font-black">{total} ر.س</motion.span>
              </div>
              <div className="h-8 bg-red-600 rounded-xl flex items-center justify-center text-white text-[10px] font-bold">
                دفع ✓
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* إشعار نجاح عملية الدفع — يظهر بعد كل دورة */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute -bottom-4 right-6 bg-white shadow-xl border border-green-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">تمت العملية بنجاح</p>
              <p className="text-[10px] text-gray-400">فاتورة ضريبية ZATCA جاهزة</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { lang, t, switchLang } = useI18n();
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [name, setName]       = useState('');
  const [plan, setPlan]       = useState('احترافي');
  const [signupStep, setSignupStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [faq, setFaq]         = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const scrollProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password: `Felsy${Date.now()}!`, options: { data: { full_name: name, phone, plan } } });
      if (error) throw error;
      setSignupStep(2);
    } catch (err) {
      alert(err.message || 'حدث خطأ');
    } finally { setLoading(false); }
  };

  const FAQS = [
    { q: 'هل يعمل النظام بدون إنترنت؟', a: 'نعم، النظام يعمل أوفلاين مؤقتاً ويتزامن تلقائياً عند عودة الاتصال.' },
    { q: 'هل النظام متوافق مع هيئة الزكاة؟', a: 'نعم، الفواتير الإلكترونية متوافقة مع متطلبات المرحلة الثانية من الفوترة الإلكترونية بالكامل.' },
    { q: 'كم عدد الفروع المسموح بها؟', a: 'يعتمد على الباقة: الأساسية فرع واحد، الاحترافية 3 فروع، والمؤسسية فروع غير محدودة.' },
    { q: 'هل يمكنني تجربة النظام مجاناً؟', a: 'نعم، نقدم تجربة مجانية 14 يوماً بدون أي تعهدات أو بطاقة ائتمانية.' },
    { q: 'ما أنواع الأعمال التي يدعمها النظام؟', a: 'المطاعم والمقاهي، المتاجر العامة، محلات الأحذية والملابس، غسيل السيارات، وأي نشاط تجاري آخر.' },
    { q: 'كيف يتم الدعم الفني؟', a: 'عبر الواتساب والبريد الإلكتروني وتذاكر الدعم داخل النظام. الباقات المؤسسية تحصل على مدير حساب مخصص.' },
  ];

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-white text-gray-900 font-sans" style={{ fontFamily: "'Segoe UI', 'Cairo', sans-serif" }}>

      {/* ── شريط تقدّم التمرير ── */}
      <motion.div
        className="fixed top-0 right-0 left-0 h-[3px] bg-red-600 z-[60] origin-left"
        style={{ scaleX: scrollProgress }}
      />

      {/* ── Navbar ── */}
      <nav className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm py-0' : 'bg-transparent border-b border-transparent py-1.5'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={felsynLogo} alt="فلسي Felsy" className="h-9 w-auto object-contain" />
            <span className="text-xs text-gray-400 font-medium">felsy.org</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-red-600 transition-colors">{t('الميزات', 'Features')}</a>
            <a href="#pricing" className="hover:text-red-600 transition-colors">{t('الأسعار', 'Pricing')}</a>
            <a href="#partners" className="hover:text-red-600 transition-colors">{t('عملاؤنا', 'Customers')}</a>
            <a href="#faq" className="hover:text-red-600 transition-colors">{t('الأسئلة الشائعة', 'FAQ')}</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => switchLang(lang === 'ar' ? 'en' : 'ar')}
              className="text-xs font-bold border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors">
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            <button onClick={() => navigate('/auth/login')}
              className="text-sm font-bold text-gray-700 hover:text-red-600 transition-colors">
              {t('تسجيل الدخول', 'Login')}
            </button>
            <a href="#signup"
              className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200">
              {t('ابدأ مجاناً', 'Start Free')}
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
        {/* خلفية متحركة — شبكة شفافة + ضباب لوني هادئ، إشارة بصرية لطابع نقطة البيع الرقمية */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{ backgroundImage: 'linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
        <motion.div className="absolute top-10 left-10 w-80 h-80 bg-red-100 rounded-full blur-3xl pointer-events-none"
          animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.08, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-amber-50 rounded-full blur-3xl pointer-events-none"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1.05, 1, 1.05] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }} />

        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-red-50 text-red-700 text-sm font-bold px-4 py-2 rounded-full mb-6 border border-red-100">
            <Zap className="w-4 h-4" />
            {t('نظام نقاط البيع الأذكى في المملكة', 'The Smartest POS System in the Kingdom')}
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-gray-900 leading-tight mb-6"
            style={{ lineHeight: '1.15' }}>
            {t('أدِر مشروعك', 'Run Your Business')}<br />
            <span className="text-red-600">{t('بذكاء حقيقي', 'With Real Intelligence')}</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.2 }}
            className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('نظام فلسي — حل متكامل لنقاط البيع، الفواتير الإلكترونية، إدارة المخزون، الطاولات، والمتجر الإلكتروني. كل ما تحتاجه في مكان واحد.',
               'Felsy — an all-in-one solution for point-of-sale, e-invoicing, inventory management, tables, and your online store. Everything you need in one place.')}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4 mb-14">
            <motion.a whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} href="#signup"
              className="bg-red-600 text-white px-8 py-4 rounded-2xl text-lg font-black hover:bg-red-700 transition-colors shadow-xl shadow-red-200 flex items-center gap-2">
              {t('ابدأ تجربتك المجانية', 'Start Your Free Trial')} <ArrowLeft className="w-5 h-5" />
            </motion.a>
            <motion.a whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} href="#pricing"
              className="bg-white text-gray-800 px-8 py-4 rounded-2xl text-lg font-bold border-2 border-gray-200 hover:border-red-300 transition-colors">
              {t('شاهد الأسعار', 'View Pricing')}
            </motion.a>
          </motion.div>

          {/* إحصائيات */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.4 }}
            className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            {[
              { num: 100, suf: '+', label: t('متجر يثق بنا', 'Stores Trust Us') },
              { num: 99, suf: '%', label: t('رضا العملاء', 'Customer Satisfaction') },
              { num: 4, suf: '+', label: t('سنوات خبرة', 'Years of Experience') },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-black text-red-600"><Counter to={s.num} suffix={s.suf} /></p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* صورة المنتج — محاكاة حية لنقطة بيع فعلية */}
        <motion.div className="max-w-4xl mx-auto mt-16"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}>
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
            <LivePOSDemo />
          </motion.div>
        </motion.div>
      </section>

      {/* ── الميزات ── */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-4xl font-black text-gray-900 mb-4">{t('كل ما تحتاجه في نظام واحد', 'Everything You Need in One System')}</h2>
              <p className="text-xl text-gray-500">{t('مصمم خصيصاً للأعمال السعودية مع دعم كامل لمتطلبات هيئة الزكاة والضريبة', 'Built specifically for Saudi businesses with full ZATCA compliance support')}</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: (i % 3) * 0.1 }}
                whileHover={{ y: -4 }}
                className="bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-red-200 rounded-2xl p-6 transition-colors duration-200 group">
                <div className="w-12 h-12 bg-white group-hover:bg-red-100 border border-gray-200 group-hover:border-red-200 rounded-xl flex items-center justify-center mb-4 shadow-sm transition-colors">
                  <f.icon className="w-6 h-6 text-gray-600 group-hover:text-red-600 transition-colors" />
                </div>
                <h3 className="font-black text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── شهادة ZATCA ── */}
      <section className="py-14 px-6 bg-green-50 border-y border-green-100">
        <Reveal>
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 text-center md:text-right">
            <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
              <ZATCABadge />
            </motion.div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">متوافق مع الفوترة الإلكترونية المرحلة الثانية</h3>
              <p className="text-gray-600 leading-relaxed">
                فواتير ضريبية معتمدة مع QR Code، XML موقع، وإرسال مباشر لمنظومة فاتورة. مطابق لمتطلبات هيئة الزكاة والضريبة والجمارك بالكامل.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── عملاؤنا ── */}
      <section id="partners" className="py-20 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-black text-gray-900 mb-4">{t('أكثر من 100 شركة تثق بنا', 'Trusted by 100+ Businesses')}</h2>
              <p className="text-gray-500">{t('من المطاعم والمقاهي إلى محلات الأحذية والملابس ومحطات غسيل السيارات', 'From restaurants and cafés to shoe stores, clothing brands, and car wash stations')}</p>
            </div>
          </Reveal>
        </div>

        {/* شريط شعارات متحرك بلا توقف — يكرّر القائمة مرتين لضمان استمرارية الحركة */}
        <div className="relative w-full">
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <div key={i} className="flex items-center justify-center mx-8 shrink-0" style={{ width: '160px', height: '90px' }}>
                <img src={p.logo} alt={p.name} title={p.name}
                  className="max-w-full max-h-full object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
              </div>
            ))}
          </div>
          {/* تلطيف الحواف لإخفاء بداية/نهاية الشريط */}
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        </div>

        <p className="text-center text-gray-400 text-sm mt-8">{t('وأكثر من 90 عميلاً آخر في المملكة العربية السعودية', 'And 90+ more businesses across Saudi Arabia')}</p>
      </section>

      {/* ── الأسعار ── */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-4xl font-black text-gray-900 mb-4">{t('أسعار شفافة بدون مفاجآت', 'Transparent Pricing, No Surprises')}</h2>
              <p className="text-xl text-gray-500">{t('اختر الباقة التي تناسب حجم نشاطك — يمكنك الترقية في أي وقت', 'Choose the plan that fits your business — upgrade anytime')}</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((pl, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                whileHover={{ y: -6 }}
                className={`bg-white border-2 ${pl.color} rounded-3xl p-7 flex flex-col relative shadow-sm hover:shadow-xl transition-shadow`}>
                {pl.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className={`text-xs font-black px-4 py-1.5 rounded-full ${pl.badge === 'الأكثر شيوعاً' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}`}>
                      {pl.badge}
                    </span>
                  </div>
                )}
                <h3 className="font-black text-xl text-gray-900 mb-3">{pl.name}</h3>
                {pl.price ? (
                  <div className="mb-5">
                    <span className="text-5xl font-black text-gray-900">{pl.price}</span>
                    <span className="text-gray-500 mr-1"> ر.س</span>
                    <p className="text-gray-400 text-sm mt-1">{pl.period} + ضريبة 15%</p>
                  </div>
                ) : (
                  <div className="mb-5">
                    <span className="text-3xl font-black text-gray-900">حسب الطلب</span>
                    <p className="text-gray-400 text-sm mt-2">سعر مخصص لاحتياجاتك</p>
                  </div>
                )}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {pl.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="#signup"
                  className={`block text-center py-3 rounded-2xl font-bold text-sm transition-all ${i === 1 ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>
                  {pl.cta}
                </a>
              </motion.div>
            ))}
          </div>

          {/* ── شارة الاعتماد الرسمي من هيئة الزكاة والضريبة والجمارك ── */}
          <div className="mt-10 flex items-center justify-center gap-3 text-gray-500">
            <img src={zatcaLogo} alt="هيئة الزكاة والضريبة والجمارك" className="h-16 w-auto object-contain" />
            <span className="text-sm">فلسي متوافق رسمياً مع متطلبات الفاتورة الإلكترونية (ZATCA)</span>
          </div>
        </div>
      </section>

      {/* ── التسجيل ── */}
      <section id="signup" className="py-20 px-6 bg-white">
        <div className="max-w-xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <h2 className="text-4xl font-black text-gray-900 mb-4">{t('ابدأ تجربتك المجانية الآن', 'Start Your Free Trial Now')}</h2>
              <p className="text-gray-500">{t('14 يوماً مجاناً — بدون بطاقة ائتمانية — بدون تعهدات', '14 days free — no credit card required — no commitments')}</p>
            </div>
          </Reveal>

          {signupStep === 1 ? (
            <motion.form onSubmit={handleSignup}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5 }}
              className="bg-gray-50 border border-gray-200 rounded-3xl p-8 space-y-5 shadow-lg">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t('اسم النشاط التجاري', 'Business Name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder={t('مثال: مطعم الوادي', 'e.g. Al-Wadi Restaurant')}
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t('البريد الإلكتروني', 'Email Address')}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t('رقم الجوال', 'Mobile Number')}</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="05xxxxxxxx"
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">{t('الباقة المختارة', 'Selected Plan')}</label>
                <select value={plan} onChange={e => setPlan(e.target.value)}
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors">
                  {PLAN_SELECT_OPTIONS.map((label, i) => (
                    <option key={i}>{label}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-13 bg-red-600 text-white rounded-2xl font-black text-base hover:bg-red-700 transition-colors disabled:opacity-60 py-3.5">
                {loading ? t('جاري التسجيل...', 'Creating account...') : t('أنشئ حسابك مجاناً ←', 'Create Your Free Account ←')}
              </button>
              <p className="text-xs text-gray-400 text-center">{t('بالتسجيل توافق على', 'By signing up you agree to our')} <a href="/terms" className="underline">{t('شروط الاستخدام', 'Terms of Use')}</a> {t('و', 'and')} <a href="/privacy" className="underline">{t('سياسة الخصوصية', 'Privacy Policy')}</a></p>
            </motion.form>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-3xl p-10 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-gray-900 mb-2">{t('تم إنشاء حسابك!', 'Your Account Has Been Created!')}</h3>
              <p className="text-gray-600 mb-6">{t('تحقق من بريدك الإلكتروني لتفعيل الحساب، ثم سجل دخولك للبدء.', 'Check your email to activate your account, then log in to get started.')}</p>
              <button onClick={() => navigate('/auth/login')}
                className="bg-red-600 text-white px-8 py-3.5 rounded-2xl font-black hover:bg-red-700 transition-colors">
                {t('تسجيل الدخول الآن', 'Log In Now')}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── الأسئلة الشائعة ── */}
      <section id="faq" className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <Reveal><h2 className="text-4xl font-black text-gray-900 text-center mb-12">{t('الأسئلة الشائعة', 'Frequently Asked Questions')}</h2></Reveal>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <button onClick={() => setFaq(faq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-right hover:bg-gray-50 transition-colors">
                  <span className="font-bold text-gray-900">{f.q}</span>
                  <motion.span animate={{ rotate: faq === i ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {faq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}>
                      <div className="px-6 pb-4 text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                        {f.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl p-1.5">
                <img src={felsynLogo} alt="فلسي Felsy" className="h-7 w-auto object-contain" />
              </div>
              <div>
                <p className="text-xs text-gray-400">نظام نقاط البيع الذكي</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
              <a href={`tel:${CONTACT_INFO.phone}`} className="hover:text-white transition-colors">📞 {CONTACT_INFO.phone}</a>
              <a href={`mailto:${CONTACT_INFO.email}`} className="hover:text-white transition-colors">✉️ {CONTACT_INFO.email}</a>
              <span>📍 {CONTACT_INFO.address}</span>
            </div>

            <div className="flex gap-6 text-sm">
              <a href="/about" className="hover:text-white transition-colors">{t('من نحن', 'About Us')}</a>
              <a href="/privacy" className="hover:text-white transition-colors">{t('سياسة الخصوصية', 'Privacy Policy')}</a>
              <a href="/terms" className="hover:text-white transition-colors">{t('الشروط والأحكام', 'Terms & Conditions')}</a>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <p>© {new Date().getFullYear()} {t('فلسي — جميع الحقوق محفوظة', 'Felsy — All rights reserved')}</p>
            <div className="flex items-center gap-2">
              <img src={zatcaLogo} alt="هيئة الزكاة والضريبة والجمارك" className="h-12 w-auto object-contain bg-white rounded-lg px-2 py-1" />
              <span className="text-green-400">متوافق مع هيئة الزكاة والضريبة والجمارك</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
