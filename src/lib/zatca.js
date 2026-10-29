// ══════════════════════════════════════════════════════════════════
// أدوات الفوترة في الواجهة
// • رمز QR للمرحلة الأولى (Tags 1–5) — يُستخدم فقط إذا الفرع غير مربوط
//   بالهيئة أو تعذر التوقيع لحظة البيع. بعد الربط يُطبع QR المرحلة الثانية
//   القادم من السيرفر (فيه البصمة والتوقيع والمفتاح العام).
// • التوقيع والـ XML والإرسال للهيئة: Edge Function "zatca-einvoice" فقط.
// ══════════════════════════════════════════════════════════════════

// طول TLV بترميز BER: أقل من 128 = بايت واحد، وإلا 0x81/0x82 + الطول.
// (اسم عربي طويل > 127 بايت كان يُفسد الـ QR بالترميز القديم ذي البايت الواحد)
function berLength(n) {
  if (n < 0x80) return [n];
  if (n <= 0xff) return [0x81, n];
  return [0x82, (n >> 8) & 0xff, n & 0xff];
}

function toTLV(tag, value) {
  const enc = new TextEncoder().encode(String(value ?? ''));
  return [tag, ...berLength(enc.length), ...enc];
}

/** QR المرحلة الأولى: اسم البائع، الرقم الضريبي، الوقت، الإجمالي، الضريبة */
export function generateZATCAQR({ sellerName, vatNumber, invoiceDate, invoiceTotal, vatAmount }) {
  const bytes = [
    ...toTLV(1, sellerName || ''),
    ...toTLV(2, vatNumber || ''),
    ...toTLV(3, invoiceDate || new Date().toISOString()),
    ...toTLV(4, Number(invoiceTotal || 0).toFixed(2)),
    ...toTLV(5, Number(vatAmount || 0).toFixed(2)),
  ];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** التحقق من صحة الرقم الضريبي السعودي (15 رقم يبدأ وينتهي بـ 3) */
export function validateVATNumber(vat) {
  return typeof vat === 'string' && /^3\d{13}3$/.test(vat);
}

export function getZATCAStatusLabel(status) {
  const labels = {
    pending: 'بانتظار التوقيع', signed: 'موقّعة — بانتظار الإرسال',
    reported: 'مُبلّغة للهيئة ✓', reported_warnings: 'مُبلّغة (مع ملاحظات)',
    cleared: 'معتمدة ✓', cleared_warnings: 'معتمدة (مع ملاحظات)',
    rejected: 'مرفوضة ❌', error: 'تعذر الإرسال — يعاد تلقائياً',
  };
  return labels[status] || status || '—';
}

/** تنزيل XML كملف (للمراجعة والأرشفة) */
export function downloadXML(xmlContent, filename) {
  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'invoice.xml';
  a.click();
  URL.revokeObjectURL(url);
}
