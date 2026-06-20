// ══════════════════════════════════════════════════════════════════
// felsy — حماية الكود من التلاعب والسرقة
// ══════════════════════════════════════════════════════════════════

// ── 1. كشف DevTools ─────────────────────────────────────────────
let devToolsOpen = false;

export function detectDevTools(onDetect?: () => void): () => void {
  if (!import.meta.env.PROD) return () => {};

  function check() {
    const threshold = 160;
    const widthDiff  = window.outerWidth  - window.innerWidth  > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    const wasOpen = devToolsOpen;
    devToolsOpen = widthDiff || heightDiff;
    if (devToolsOpen && !wasOpen) {
      onDetect?.();
      triggerProtection();
    }
  }

  // كشف إضافي عبر debugger timing
  function debuggerCheck() {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    if (performance.now() - start > 100) {
      devToolsOpen = true;
      onDetect?.();
    }
  }

  const interval = setInterval(check, 1000);
  const dbgInterval = setInterval(debuggerCheck, 3000);

  return () => { clearInterval(interval); clearInterval(dbgInterval); };
}

// ── 2. رد الفعل عند اكتشاف التلاعب ─────────────────────────────
export function triggerProtection(): void {
  if (!import.meta.env.PROD) return;
  // مسح الجلسة بالكامل بما فيها مفاتيح plaintext القديمة
  sessionStorage.clear();
  localStorage.removeItem('activeBranch');
  // تعطيل console
  const noop = () => {};
  Object.assign(window.console, {
    log: noop, warn: noop, error: noop, info: noop, debug: noop,
  });
  // إعادة تحميل الصفحة بعد تأخير قصير
  setTimeout(() => window.location.replace('/'), 300);
}

// ── 3. منع Right-Click في production ────────────────────────────
export function disableRightClick(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('contextmenu', e => e.preventDefault());
}

// ── 4. منع اختصارات المطورين ────────────────────────────────────
export function disableDevShortcuts(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('keydown', e => {
    const forbidden = (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I','J','C','K'].includes(e.key)) ||
      (e.ctrlKey && e.key === 'U') ||
      (e.metaKey && e.altKey && ['I','J','C'].includes(e.key))
    );
    if (forbidden) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

// ── 5. منع نسخ المحتوى الحساس ───────────────────────────────────
export function protectContent(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('copy', (e) => {
    const selection = window.getSelection()?.toString() || '';
    if (selection.includes('FELSY') || selection.match(/\d{4}[\s-]?\d{4}/)) {
      e.clipboardData?.setData('text/plain', '*** محمي ***');
      e.preventDefault();
    }
  });
}

// ── 6. Content Security Policy header (يُضاف في الـ server) ──────
export const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' https://fonts.googleapis.com https://api.qrserver.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

// ── 7. تشويش رسائل الخطأ في production ──────────────────────────
export function obfuscateErrors(): void {
  if (!import.meta.env.PROD) return;
  window.addEventListener('error', (e) => {
    e.preventDefault();
    return false;
  });
  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    return false;
  });
}

// ── 8. Anti-iframe (Clickjacking) ───────────────────────────────
export function preventIframing(): void {
  if (window.top !== window.self) {
    window.top!.location.href = window.self.location.href;
  }
}

// ── 9. تشغيل كل الحمايات دفعة واحدة ────────────────────────────
export function initSecurityLayer(): void {
  preventIframing();
  disableRightClick();
  disableDevShortcuts();
  protectContent();
  obfuscateErrors();
  detectDevTools();
}
