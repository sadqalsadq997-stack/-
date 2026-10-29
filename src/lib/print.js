// ══════════════════════════════════════════════════════════════════
// طباعة فورية بدون نوافذ منبثقة: إطار مخفي داخل الصفحة نفسها
// (النوافذ المنبثقة يمنعها المتصفح، والسكربتات داخلها تمنعها سياسة الأمان)
// للطباعة بدون نافذة المتصفح نهائياً: شغّل كروم بخيار --kiosk-printing
// ══════════════════════════════════════════════════════════════════

export function printHTML(html, { copies = 1 } = {}) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = async () => {
      const win = frame.contentWindow;
      try {
        // ننتظر الصور (الشعار / QR) قبل الطباعة
        const imgs = Array.from(win.document.images || []);
        await Promise.all(imgs.map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))));
        if (win.document.fonts?.ready) await Promise.race([win.document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
        for (let i = 0; i < Math.max(1, copies); i++) { win.focus(); win.print(); }
      } finally {
        setTimeout(() => { frame.remove(); resolve(); }, 1500);
      }
    };
    document.body.appendChild(frame);
  });
}

/** يمنع أي نص (اسم منتج، ملاحظة) من التحول لكود داخل الفاتورة */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** خطوط الموقع (Cairo + رمز الريال) لصفحات الطباعة — من سيرفر الموقع نفسه */
export function printFonts() {
  return `@font-face{font-family:'SaudiRiyal';src:url('${location.origin}/fonts/saudi-riyal-400.woff2') format('woff2');unicode-range:U+20C1,U+E900}
@font-face{font-family:'Cairo';font-weight:400;src:url('${location.origin}/fonts/cairo-arabic-400-normal.woff2') format('woff2')}
@font-face{font-family:'Cairo';font-weight:700;src:url('${location.origin}/fonts/cairo-arabic-700-normal.woff2') format('woff2')}
@font-face{font-family:'Cairo';font-weight:900;src:url('${location.origin}/fonts/cairo-arabic-900-normal.woff2') format('woff2')}
@font-face{font-family:'Cairo';font-weight:400;src:url('${location.origin}/fonts/cairo-latin-400-normal.woff2') format('woff2');unicode-range:U+0000-00FF}
@font-face{font-family:'Cairo';font-weight:700;src:url('${location.origin}/fonts/cairo-latin-700-normal.woff2') format('woff2');unicode-range:U+0000-00FF}`;
}
