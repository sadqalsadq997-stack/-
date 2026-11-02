// ══════════════════════════════════════════════════════════════════
// طباعة فورية بدون نوافذ منبثقة: إطار مخفي داخل الصفحة نفسها
// (النوافذ المنبثقة يمنعها المتصفح، والسكربتات داخلها تمنعها سياسة الأمان)
// للطباعة بدون نافذة المتصفح نهائياً: شغّل كروم بخيار --kiosk-printing
// ══════════════════════════════════════════════════════════════════


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
    const safe = (v) => String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const header = '<header data-felsy-brand="true" style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 14px;margin:0 0 18px;border-bottom:2px solid #222;font-family:Cairo,Arial,sans-serif;direction:rtl;text-align:right">' +
      '<div style="display:flex;align-items:center;gap:12px;min-width:0">' +
      (logo ? '<img src="' + safe(logo) + '" alt="شعار المنشأة" style="width:76px;height:64px;object-fit:contain">' : '') +
      '<div><div style="font-size:18px;font-weight:800">' + safe(name) + '</div>' +
      '<div style="font-size:10px;line-height:1.8">' + details.map(safe).join(' · ') + '</div></div></div>' +
      '<div style="font-size:11px;font-weight:700;color:#555">نسخة صادرة من نظام فلسي</div></header>';
    if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, '<body$1>' + header);
    return html.replace(/<html([^>]*)>/i, '<html$...[truncated]