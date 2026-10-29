// هل الموقع مفتوح كـ "تطبيق" (مثبّت على الشاشة الرئيسية أو داخل تطبيق الجوال)؟
// في وضع التطبيق: شاشة الدخول فقط — إنشاء الحساب يكون من الموقع الإلكتروني.
export function isAppMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') sessionStorage.setItem('felsy_app_mode', '1');
    if (sessionStorage.getItem('felsy_app_mode') === '1') return true;
  } catch { /* تخزين غير متاح */ }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const webview = /FelsyApp|; wv\)/i.test(navigator.userAgent || '');
  return Boolean(standalone || webview);
}
