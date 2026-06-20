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
  },
};

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('felsy_lang') || 'ar');

  const t = (key) => translations[lang]?.[key] ?? key;

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
