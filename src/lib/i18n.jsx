import React, { createContext, useContext, useState } from 'react';

const I18nContext = createContext({ lang: 'ar', t: k => k });

const translations = {
  ar: {
    dashboard: 'لوحة التحكم',
    pos: 'نقطة البيع',
    orders: 'الطلبات',
    products: 'المنتجات',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    search: 'بحث',
    loading: 'جارٍ التحميل...',
    error: 'حدث خطأ',
    success: 'تم بنجاح',
    confirm: 'تأكيد',
    // ── الصفحة الرئيسية ──
    nav_features: 'المميزات',
    nav_pricing: 'الأسعار',
    nav_faq: 'الأسئلة الشائعة',
    nav_login: 'تسجيل الدخول',
    hero_title: 'نظام نقطة بيع سعودي ذكي لإدارة أعمالك بالكامل',
    hero_subtitle: 'فواتير ضريبية متوافقة مع ZATCA، إدارة مخزون، تقارير لحظية، ومساعد ذكاء اصطناعي — كل ما يحتاجه نشاطك في مكان واحد.',
    hero_cta_start: 'ابدأ تجربتك المجانية',
    hero_cta_demo: 'شاهد العرض التوضيحي',
    features_title: 'كل ما تحتاجه لإدارة أعمالك',
    features_subtitle: 'مميزات قوية صُممت خصيصاً للسوق السعودي',
    pricing_title: 'أسعار شفافة بدون مفاجآت',
    pricing_subtitle: 'اختر الباقة التي تناسب حجم أعمالك',
    pricing_zatca_note: 'فلسي متوافق رسمياً مع متطلبات الفاتورة الإلكترونية (ZATCA)',
    faq_title: 'الأسئلة الشائعة',
    signup_title: 'أنشئ حسابك الآن',
    signup_subtitle: 'ابدأ تجربتك المجانية لمدة 14 يوماً، بدون بطاقة ائتمانية',
    signup_name: 'الاسم الكامل',
    signup_phone: 'رقم الجوال',
    signup_email: 'البريد الإلكتروني',
    signup_password: 'كلمة المرور',
    signup_plan: 'الباقة',
    signup_cta: 'إنشاء الحساب',
    footer_about: 'من نحن',
    footer_privacy: 'سياسة الخصوصية',
    footer_terms: 'الشروط والأحكام',
    footer_rights: 'جميع الحقوق محفوظة',
  },
  en: {
    dashboard: 'Dashboard',
    pos: 'POS Terminal',
    orders: 'Orders',
    products: 'Products',
    settings: 'Settings',
    logout: 'Logout',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    loading: 'Loading...',
    error: 'An error occurred',
    success: 'Success',
    confirm: 'Confirm',
    // ── Landing page ──
    nav_features: 'Features',
    nav_pricing: 'Pricing',
    nav_faq: 'FAQ',
    nav_login: 'Login',
    hero_title: 'Smart Saudi Point-of-Sale System to Run Your Entire Business',
    hero_subtitle: 'ZATCA-compliant e-invoices, inventory management, real-time reports, and an AI assistant — everything your business needs in one place.',
    hero_cta_start: 'Start Your Free Trial',
    hero_cta_demo: 'Watch Demo',
    features_title: 'Everything You Need to Run Your Business',
    features_subtitle: 'Powerful features built specifically for the Saudi market',
    pricing_title: 'Transparent Pricing, No Surprises',
    pricing_subtitle: 'Choose the plan that fits the size of your business',
    pricing_zatca_note: 'Felsy is officially compliant with ZATCA e-invoicing requirements',
    faq_title: 'Frequently Asked Questions',
    signup_title: 'Create Your Account Now',
    signup_subtitle: 'Start your 14-day free trial, no credit card required',
    signup_name: 'Full Name',
    signup_phone: 'Mobile Number',
    signup_email: 'Email Address',
    signup_password: 'Password',
    signup_plan: 'Plan',
    signup_cta: 'Create Account',
    footer_about: 'About Us',
    footer_privacy: 'Privacy Policy',
    footer_terms: 'Terms & Conditions',
    footer_rights: 'All rights reserved',
  },
};

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('felsy_lang') || 'ar');

  // يدعم استدعاءين:
  // 1) t('dashboard') — بحث بالمفتاح في قاموس الترجمة
  // 2) t('نص عربي مباشر', 'English text') — نص مباشر بدون قاموس (يُستخدم بكثرة في الصفحة الرئيسية)
  const t = (arOrKey, en) => {
    if (en !== undefined) return lang === 'ar' ? arOrKey : en;
    return translations[lang]?.[arOrKey] ?? arOrKey;
  };

  const switchLang = (l) => {
    setLang(l);
    localStorage.setItem('felsy_lang', l);
    document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', l);
  };

  return (
    <I18nContext.Provider value={{ lang, t, switchLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
