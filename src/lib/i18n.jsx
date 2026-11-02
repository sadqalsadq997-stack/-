import React, { createContext, useContext, useEffect, useState } from 'react';

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
    pricing_title���q�^