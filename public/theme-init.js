// يضبط الوضع الداكن واتجاه اللغة قبل رسم الصفحة (ملف خارجي ليتوافق مع سياسة CSP)
(function () {
  try {
    var dark = localStorage.getItem('felsy_dark_mode');
    if (dark === '1' || (!dark && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    var lang = localStorage.getItem('felsy_lang') || 'ar';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  } catch (e) { /* التخزين غير متاح */ }
})();
