// ══════════════════════════════════════════════════════════════════
// felsy — مصدر الحقيقة الوحيد للتسعير في كل التطبيق
// أي تعديل على الأسعار أو المميزات يكون هنا فقط، ويظهر تلقائياً في:
// الصفحة الرئيسية (LandingPage) وصفحة الدفع (PaymentGate)
// لا تُعرّف أسعار أو خطط في أي ملف آخر — استورد من هنا فقط.
// ══════════════════════════════════════════════════════════════════

export const PLANS = [
  {
    id: 'basic',
    code: 'basic',
    name: 'الباقة العادية',
    price: 45,
    period: 'شهر',
    icon: '🌱',
    badge: null,
    color: 'border-gray-200',
    features: [
      'فرع واحد',
      'كاشير متعدد (غير محدود)',
      'منتجات غير محدودة',
      'تقارير أساسية',
      'برنامج ولاء العملاء',
      'فاتورة ضريبية ZATCA',
      'دعم فني',
    ],
    cta: 'ابدأ الآن',
  },
  {
    id: 'premium',
    code: 'premium',
    name: 'الباقة المميزة',
    price: 99,
    period: 'شهر',
    icon: '🚀',
    badge: 'الأكثر شيوعاً',
    color: 'border-red-500',
    popular: true,
    features: [
      'فروع متعددة',
      'كاشير متعدد (غير محدود)',
      'مساعد الذكاء الاصطناعي',
      'شاشة الطلب الذاتي (Kiosk)',
      'جهاز الباجر (Pager)',
      'طلبات الدليفري',
      'تحليلات متقدمة',
      'دعم ذهبي',
    ],
    cta: 'ابدأ تجربة مجانية',
  },
  {
    id: 'business',
    code: 'business',
    name: 'باقة الأعمال',
    price: 145,
    period: 'شهر',
    icon: '🏢',
    badge: 'للأعمال المتوسطة',
    color: 'border-gray-800',
    features: [
      'كل مميزات الباقة المميزة',
      'عدد فروع أعلى',
      'دعم أولوية على مدار الساعة (24/7)',
      'تقارير وتحليلات متقدمة أكثر',
    ],
    cta: 'ابدأ الآن',
  },
  {
    id: 'custom',
    code: 'custom',
    name: 'باقة مخصصة',
    price: null,
    period: null,
    icon: '✨',
    badge: 'حسب الطلب',
    color: 'border-gray-300 bg-gray-50',
    contactOnly: true,
    features: [
      'فروع غير محدودة',
      'تخصيص كامل حسب احتياجك',
      'مدير حساب مخصص',
      'تواصل معنا للتسعير',
    ],
    cta: 'تواصل معنا',
  },
];

// قائمة منسّقة للاستخدام في عناصر <select> (مثل نموذج التسجيل)
export const PLAN_SELECT_OPTIONS = PLANS.map(p =>
  p.price !== null ? `${p.name} — ${p.price} ر.س/شهر` : `${p.name} — حسب الطلب`
);

export function getPlanByLabel(label) {
  return PLANS.find(p => label.startsWith(p.name)) || PLANS[1];
}
