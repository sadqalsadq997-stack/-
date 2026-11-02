// Shared print helpers. Every generated report/printout carries the active business identity.
function brandedPrintHTML(html) {
  try {
    const read = (key) => JSON.parse(localStorage.getItem(key) || '{}');
    const data = { ...read('activeBranch'), ...read('felsy_print_brand') };
    const name = data.business_name || data.zatca_seller_name || data.name_ar || data.name || '';
    const logo = data.logo_url || '';
    const details = [
      data.vat_number ? 'الرقم الضريبي: ' + data.vat_number : '',
      data.cr_number ? 'السجل التجاري: ' + data.cr_number : '',
      data.address || data.zatca_address || '',
      data.phone || ''
    ].filter(Boolean);
    if (!name && !logo && !details.length) return html;
    const safe = (value) => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const header =
      '<header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 14px;margin:0 0 18px;border-bottom:2px solid #222;font-family:Cairo,Arial,sans-serif;direction:rtl;text-align:right">' +
      '<div style="display:flex;align-items:center;gap:12px;min-width:0">' +
      (logo ? '<img src="' + safe(logo) + '" alt="شعار المنشأة" style="width:76px;height:64px;object-fit:contain">' : '') +
      '<div><div style="font-size:18px;font-weight:800">' + safe(name) + '</div>' +
      '<div style="font-size:10px;line-height:1.8">' + details.map(safe).join(' · ') + '</div></div></div>' +
      '<div style="font-size:11px;font-weight:700;color:#555">نسخة صادرة من نظام فلسي</div></header>';
    if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, '<body$1>' + header);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1><body>' + header).replace(/<\/html>/i, '</body></html>');
    return header + html;
  } catch {
    return html;
  }
}

export function printHTML(html, { copies = 1, includeBusinessBrand = true } = {}) {
  if (includeBusinessBrand) html = brandedPrintHTML(html);
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = async () => {
      const win = frame.contentWindow;
      try {
        const imgs = Array.from(win.document.images || []);
        await Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
        if (win.document.fonts?.ready) await Promise.race([win.document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
        for (let i = 0; i < Math.max(1, copies); i++) { win.focus(); win.print(); }
      } finally {
        setTimeout(() => { frame.remove(); resolve(); }, 1500);
      }
    };
    document.body.appendChild(frame);
  });
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function printFonts() {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return "@font-face{font-family:'SaudiRiyal';src:url('" + origin + "/fonts/saudi-riyal-400.woff2') format('woff2');unicode-range:U+20C1,U+E900}\n" +
    "@font-face{font-family:'Cairo';font-weight:400;src:url('" + origin + "/fonts/cairo-arabic-400-normal.woff2') format('woff2')}\n" +
    "@font-face{font-family:'Cairo';font-weight:700;src:url('" + origin + "/fonts/cairo-arabic-700-normal.woff2') format('woff2')}\n" +
    "body{font-family:Cairo,Arial,sans-serif}";
}
