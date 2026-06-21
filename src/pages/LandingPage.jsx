import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import felsynLogo from '@/assets/felsy-logo.png';
import {
  Check, Star, ChevronDown, ArrowLeft, Shield, Zap, BarChart3,
  Printer, Users, Globe, Receipt, Package, Layers, Warehouse,
  Headphones, Smartphone, Cloud, Lock, ChefHat, Car, Gift,
  TrendingUp, CreditCard, Bell, CheckCircle2, Building2, Store
} from 'lucide-react';

// ── شعارات الشركاء ────────────────────────────────────────────────
const PARTNERS = [
  { name: 'إبرة وخيط', icon: '🪡' },
  { name: 'الأقدام الذهبية', icon: '👟' },
  { name: 'جولدن روز', icon: '🌹' },
  { name: 'فلورينا للأحذية', icon: '👠' },
  { name: 'بلاكدير التركية', icon: '🦌' },
  { name: 'كافيه النخيل', icon: '🌴' },
  { name: 'مطعم الوادي', icon: '🍽️' },
  { name: 'سبلاش كارواش', icon: '🚗' },
  { name: 'حلويات الشامي', icon: '🍬' },
  { name: 'بوتيك لمسة', icon: '👗' },
];

// ── خطط الأسعار ──────────────────────────────────────────────────
const PLANS = [
  {
    name: 'أساسي',
    price: 90,
    period: 'شهرياً',
    color: 'border-gray-200',
    badge: null,
    features: [
      'فرع واحد',
      'نقطة بيع كاملة',
      'إدارة المنتجات والمخزون',
      'الفواتير والتقارير الأساسية',
      'دعم فني عبر الواتساب',
      'متوافق مع هيئة الزكاة والضريبة',
    ],
    cta: 'ابدأ الآن',
  },
  {
    name: 'احترافي',
    price: 150,
    period: 'شهرياً',
    color: 'border-red-500',
    badge: 'الأكثر شيوعاً',
    features: [
      'حتى 3 فروع',
      'جميع مزايا الأساسي',
      'إدارة الطاولات مع طلبات المطبخ',
      'متجر إلكتروني مخصص',
      'برنامج ولاء العملاء',
      'تقارير تحليلية متقدمة',
      'مساعد ذكاء اصطناعي',
      'دومين مخصص مجاناً',
    ],
    cta: 'ابدأ تجربة مجانية',
  },
  {
    name: 'مؤسسي',
    price: 350,
    period: 'شهرياً',
    color: 'border-gray-800',
    badge: 'للمؤسسات الكبيرة',
    features: [
      'فروع غير محدودة',
      'جميع مزايا الاحترافي',
      'إدارة متعددة المستخدمين',
      'تقارير مالية ZATCA متكاملة',
      'API للتكامل مع أنظمة خارجية',
      'مدير حساب مخصص',
      'اتفاقية مستوى الخدمة SLA',
      'تدريب وتأهيل الفريق',
    ],
    cta: 'تواصل معنا',
  },
  {
    name: 'مخصص',
    price: null,
    period: null,
    color: 'border-gray-300 bg-gray-50',
    badge: 'حسب الطلب',
    features: [
      'سعر يناسب احتياجاتك',
      'خصائص مبرمجة حسب الطلب',
      'تكامل مع أنظمتك الحالية',
      'دعم فني مخصص 24/7',
    ],
    cta: 'احصل على عرض سعر',
  },
];

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
    <div className="inline-flex items-center gap-3 bg-white border-2 border-green-600 rounded-2xl px-6 py-4 shadow-lg">
      <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
        <span className="text-white font-black text-lg">ز</span>
      </div>
      <div className="text-right">
        <p className="font-black text-green-700 text-sm">متوافق مع هيئة الزكاة</p>
        <p className="text-xs text-green-600">والضريبة والجمارك</p>
        <p className="text-[10px] text-gray-500 mt-0.5">ZATCA Compliant E-Invoice</p>
      </div>
    </div>
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

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [name, setName]       = useState('');
  const [plan, setPlan]       = useState('احترافي');
  const [signupStep, setSignupStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [faq, setFaq]         = useState(null);

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
    <div dir="rtl" className="min-h-screen bg-white text-gray-900 font-sans" style={{ fontFamily: "'Segoe UI', 'Cairo', sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 right-0 left-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={felsynLogo} alt="فلسي Felsy" className="h-9 w-auto object-contain" />
            <span className="text-xs text-gray-400 font-medium">felsy.org</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-red-600 transition-colors">الميزات</a>
            <a href="#pricing" className="hover:text-red-600 transition-colors">الأسعار</a>
            <a href="#partners" className="hover:text-red-600 transition-colors">عملاؤنا</a>
            <a href="#faq" className="hover:text-red-600 transition-colors">الأسئلة الشائعة</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/auth/login')}
              className="text-sm font-bold text-gray-700 hover:text-red-600 transition-colors">
              تسجيل الدخول
            </button>
            <a href="#signup"
              className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200">
              ابدأ مجاناً
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
        {/* خلفية ديكورية */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-red-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-red-50 rounded-full blur-3xl opacity-40 pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-red-50 text-red-700 text-sm font-bold px-4 py-2 rounded-full mb-6 border border-red-100">
            <Zap className="w-4 h-4" />
            نظام نقاط البيع الأذكى في المملكة
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-gray-900 leading-tight mb-6"
            style={{ lineHeight: '1.15' }}>
            أدِر مشروعك<br />
            <span className="text-red-600">بذكاء حقيقي</span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            نظام فلسي — حل متكامل لنقاط البيع، الفواتير الإلكترونية، إدارة المخزون، الطاولات، والمتجر الإلكتروني. كل ما تحتاجه في مكان واحد.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
            <a href="#signup"
              className="bg-red-600 text-white px-8 py-4 rounded-2xl text-lg font-black hover:bg-red-700 transition-all shadow-xl shadow-red-200 flex items-center gap-2">
              ابدأ تجربتك المجانية <ArrowLeft className="w-5 h-5" />
            </a>
            <a href="#pricing"
              className="bg-white text-gray-800 px-8 py-4 rounded-2xl text-lg font-bold border-2 border-gray-200 hover:border-red-300 transition-all">
              شاهد الأسعار
            </a>
          </div>

          {/* إحصائيات */}
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            {[
              { num: 1000, suf: '+', label: 'متجر يثق بنا' },
              { num: 99, suf: '%', label: 'رضا العملاء' },
              { num: 4, suf: '+', label: 'سنوات خبرة' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl font-black text-red-600"><Counter to={s.num} suffix={s.suf} /></p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* صورة المنتج — محاكي شاشة */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="bg-gray-900 rounded-3xl p-2 shadow-2xl border border-gray-700">
            <div className="bg-white rounded-2xl overflow-hidden">
              {/* شريط عنوان المتصفح */}
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
              {/* محتوى POS */}
              <div className="bg-gray-50 p-6 min-h-48 flex gap-4">
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-red-100 rounded-lg w-32" />
                  <div className="grid grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center gap-1 p-2">
                        <div className="w-6 h-6 bg-red-100 rounded-lg" />
                        <div className="h-2 bg-gray-200 rounded w-10" />
                        <div className="h-2 bg-red-200 rounded w-8" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-44 bg-white rounded-2xl border border-gray-200 p-3 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-20" />
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-100 rounded-lg" />
                      <div className="flex-1 h-2 bg-gray-100 rounded" />
                      <div className="h-2 bg-red-100 rounded w-8" />
                    </div>
                  ))}
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <div className="h-8 bg-red-600 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── الميزات ── */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black text-gray-900 mb-4">كل ما تحتاجه في نظام واحد</h2>
            <p className="text-xl text-gray-500">مصمم خصيصاً للأعمال السعودية مع دعم كامل لمتطلبات هيئة الزكاة والضريبة</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-red-200 rounded-2xl p-6 transition-all duration-200 group">
                <div className="w-12 h-12 bg-white group-hover:bg-red-100 border border-gray-200 group-hover:border-red-200 rounded-xl flex items-center justify-center mb-4 shadow-sm transition-colors">
                  <f.icon className="w-6 h-6 text-gray-600 group-hover:text-red-600 transition-colors" />
                </div>
                <h3 className="font-black text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── شهادة ZATCA ── */}
      <section className="py-14 px-6 bg-green-50 border-y border-green-100">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 text-center md:text-right">
          <ZATCABadge />
          <div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">متوافق مع الفوترة الإلكترونية المرحلة الثانية</h3>
            <p className="text-gray-600 leading-relaxed">
              فواتير ضريبية معتمدة مع QR Code، XML موقع، وإرسال مباشر لمنظومة فاتورة. مطابق لمتطلبات هيئة الزكاة والضريبة والجمارك بالكامل.
            </p>
          </div>
        </div>
      </section>

      {/* ── عملاؤنا ── */}
      <section id="partners" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black text-gray-900 mb-4">أكثر من 1,000 شركة تثق بنا</h2>
            <p className="text-gray-500">من المطاعم والمقاهي إلى محلات الأحذية والملابس ومحطات غسيل السيارات</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {PARTNERS.map((p, i) => (
              <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center hover:border-red-200 hover:bg-red-50 transition-all">
                <div className="text-3xl mb-2">{p.icon}</div>
                <p className="text-xs font-bold text-gray-700">{p.name}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-400 text-sm mt-6">وأكثر من 990 عميل آخر في المملكة العربية السعودية</p>
        </div>
      </section>

      {/* ── الأسعار ── */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black text-gray-900 mb-4">أسعار شفافة بدون مفاجآت</h2>
            <p className="text-xl text-gray-500">اختر الباقة التي تناسب حجم نشاطك — يمكنك الترقية في أي وقت</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((pl, i) => (
              <div key={i} className={`bg-white border-2 ${pl.color} rounded-3xl p-7 flex flex-col relative shadow-sm hover:shadow-xl transition-shadow`}>
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── التسجيل ── */}
      <section id="signup" className="py-20 px-6 bg-white">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-gray-900 mb-4">ابدأ تجربتك المجانية الآن</h2>
            <p className="text-gray-500">14 يوماً مجاناً — بدون بطاقة ائتمانية — بدون تعهدات</p>
          </div>

          {signupStep === 1 ? (
            <form onSubmit={handleSignup} className="bg-gray-50 border border-gray-200 rounded-3xl p-8 space-y-5 shadow-lg">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">اسم النشاط التجاري</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: مطعم الوادي" 
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">البريد الإلكتروني</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">رقم الجوال</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="05xxxxxxxx"
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-1.5">الباقة المختارة</label>
                <select value={plan} onChange={e => setPlan(e.target.value)}
                  className="w-full h-12 bg-white border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:border-red-500 transition-colors">
                  <option>أساسي — 90 ر.س/شهر</option>
                  <option>احترافي — 150 ر.س/شهر</option>
                  <option>مؤسسي — 350 ر.س/شهر</option>
                  <option>مخصص — حسب الطلب</option>
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-13 bg-red-600 text-white rounded-2xl font-black text-base hover:bg-red-700 transition-colors disabled:opacity-60 py-3.5">
                {loading ? 'جاري التسجيل...' : 'أنشئ حسابك مجاناً ←'}
              </button>
              <p className="text-xs text-gray-400 text-center">بالتسجيل توافق على <a href="#" className="underline">شروط الاستخدام</a> و<a href="#" className="underline">سياسة الخصوصية</a></p>
            </form>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-3xl p-10 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-gray-900 mb-2">تم إنشاء حسابك!</h3>
              <p className="text-gray-600 mb-6">تحقق من بريدك الإلكتروني لتفعيل الحساب، ثم سجل دخولك للبدء.</p>
              <button onClick={() => navigate('/auth/login')}
                className="bg-red-600 text-white px-8 py-3.5 rounded-2xl font-black hover:bg-red-700 transition-colors">
                تسجيل الدخول الآن
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── الأسئلة الشائعة ── */}
      <section id="faq" className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-black text-gray-900 text-center mb-12">الأسئلة الشائعة</h2>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <button onClick={() => setFaq(faq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-right hover:bg-gray-50 transition-colors">
                  <span className="font-bold text-gray-900">{f.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${faq === i ? 'rotate-180' : ''}`} />
                </button>
                {faq === i && (
                  <div className="px-6 pb-4 text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl p-1.5">
                <img src={felsynLogo} alt="فلسي Felsy" className="h-7 w-auto object-contain" />
              </div>
              <div>
                <p className="text-xs text-gray-400">نظام نقاط البيع الذكي</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <a href="#" className="hover:text-white transition-colors">سياسة الخصوصية</a>
              <a href="#" className="hover:text-white transition-colors">شروط الاستخدام</a>
              <a href="#" className="hover:text-white transition-colors">تواصل معنا</a>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <p>© {new Date().getFullYear()} فلسي — جميع الحقوق محفوظة</p>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span className="text-green-400">متوافق مع هيئة الزكاة والضريبة والجمارك</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
