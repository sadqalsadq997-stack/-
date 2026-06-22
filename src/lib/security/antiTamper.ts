// ══════════════════════════════════════════════════════════════════
// felsy — حماية الواجهة (نسخة مُصححة)
// ملاحظة: أُزيلت آلية "كشف DevTools" القديمة بالكامل لأنها كانت
// تعطي نتائج خاطئة (false positives) بسبب اختلاف أبعاد النافذة
// الطبيعي بين المتصفحات/الأجهزة، وكانت تدخل التطبيق في حلقة إعادة
// تحميل لا تنتهي (صفحة بيضاء دائمة). كما أُزيل تعطيل رسائل الخطأ
// (obfuscateErrors) لأنه كان يخفي أي خطأ برمجي حقيقي عن المطوّر
// والمستخدم، مما يجعل أي عطل مستقبلي مستحيل التشخيص.
// الحمايات المفيدة فعلياً (CSP، منع clickjacking، منع نسخ محتوى
// حساس) أُبقيت كما هي.
// ══════════════════════════════════════════════════════════════════

// ── منع Right-Click في production (اختياري، تجربة مستخدم فقط) ───
export function disableRightClick(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('contextmenu', e => e.preventDefault());
}

// ── منع اختصارات المطورين الأساسية (تجربة مستخدم فقط، لا حماية حقيقية) ──
export function disableDevShortcuts(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('keydown', e => {
    const forbidden = (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key)) ||
      (e.ctrlKey && e.key === 'U')
    );
    if (forbidden) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

// ── منع نسخ المحتوى الحساس (أرقام بطاقات مثلاً) ─────────────────
export function protectContent(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('copy', (e) => {
    const selection = window.getSelection()?.toString() || '';
    if (selection.match(/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/)) {
      e.clipboardData?.setData('text/plain', '*** محمي ***');
      e.preventDefault();
    }
  });
}

// ── Content Security Policy header (يُضاف فعلياً من vercel.json/netlify.toml) ──
export const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' https://fonts.googleapis.com https://api.qrserver.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://generativelanguage.googleapis.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

// ── Anti-iframe حقيقي وآمن (clickjacking) — لا يكسر التطبيق إذا فشلت المقارنة ──
export function preventIframing(): void {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = window.self.location.href;
    }
  } catch {
    // الوصول لـ window.top قد يُرفض من المتصفح في بعض السياقات (cross-origin) —
    // هذا متوقع وآمن تجاهله، لا نريد كسر التطبيق بسببه.
  }
}

// ── تشغيل الحمايات غير المؤثرة على استقرار التطبيق فقط ──────────
export function initSecurityLayer(): void {
  try { preventIframing(); } catch { /* تجاهل */ }
  try { disableRightClick(); } catch { /* تجاهل */ }
  try { disableDevShortcuts(); } catch { /* تجاهل */ }
  try { protectContent(); } catch { /* تجاهل */ }
}

// تُركت كدالة فارغة للتوافق مع أي استدعاء قديم متبقٍ في الكود —
// لم تعد تفعل أي شيء (كانت السبب في حلقة الصفحة البيضاء).
export function detectDevTools(): () => void {
  return () => {};
}
export function triggerProtection(): void {
  /* تم تعطيلها نهائياً — كانت السبب في مسح البيانات وإعادة التوجيه اللا منتهية */
}
export function obfuscateErrors(): void {
  /* تم تعطيلها نهائياً — كانت تخفي كل الأخطاء البرمجية الحقيقية */
}
