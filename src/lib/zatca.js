/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZATCA Phase 2 — دوال مساعدة للـ Frontend فقط
 *
 * ⚠️  تنبيه أمني:
 *  - هذا الملف يحتوي على دوال مساعدة للواجهة الأمامية فقط
 *  - جميع العمليات الحساسة (CSR, CSID, توقيع, شهادات) تتم في Supabase Edge Functions
 *  - لا يُخزَّن أي مفتاح خاص أو شهادة في المتصفح
 *  - للتكامل الكامل استخدم: @/services/zatcaService
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── بناء QR Code TLV للعرض المحلي (وفق ZATCA Phase 2 Tags 1-5) ────────────
// ملاحظة: QR الكامل مع التوقيع يُنشأ في Backend
function toTLV(tag, value) {
  const enc = new TextEncoder().encode(value);
  return new Uint8Array([tag, enc.length, ...enc]);
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

/**
 * توليد QR Code TLV الأساسي (Tags 1-5 فقط) للعرض المحلي
 * للـ QR الكامل مع التوقيع والـ Hash استخدم zatcaService.submitInvoice()
 */
export function generateZATCAQR(params) {
  const { sellerName, vatNumber, invoiceDate, invoiceTotal, vatAmount } = params;

  const tlvData = concatUint8Arrays([
    toTLV(1, sellerName || ''),
    toTLV(2, vatNumber  || ''),
    toTLV(3, invoiceDate || new Date().toISOString()),
    toTLV(4, Number(invoiceTotal).toFixed(2)),
    toTLV(5, Number(vatAmount).toFixed(2)),
  ]);

  let binary = '';
  tlvData.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

/**
 * حساب ضريبة القيمة المضافة (15%)
 */
export function calcVAT(amount, rate = 15) {
  return Math.round(amount * (rate / 100) * 100) / 100;
}

/**
 * التحقق من صحة رقم الضريبة السعودي (15 رقم يبدأ بـ 3)
 */
export function validateVATNumber(vat) {
  return typeof vat === 'string' && /^3[0-9]{14}$/.test(vat);
}

/**
 * تنسيق رقم الفاتورة
 */
export function generateInvoiceNumber(branchCode, counter, prefix = 'INV') {
  const pad  = String(counter).padStart(6, '0');
  const year = new Date().getFullYear();
  return `${prefix}-${branchCode || 'BR'}-${year}-${pad}`;
}

/**
 * الحصول على وصف حالة ZATCA بالعربية
 */
export function getZATCAStatusLabel(status) {
  const labels = {
    pending:   'قيد الإرسال',
    reported:  'تم الإبلاغ ✅',
    cleared:   'تم التخليص ✅',
    rejected:  'مرفوض ❌',
    cancelled: 'ملغي',
    error:     'خطأ ⚠️',
  };
  return labels[status] || status;
}

/**
 * تنزيل XML كملف (للمراجعة والأرشفة)
 * XML الرسمي يُنشأ في Backend
 */
export function downloadXML(xmlContent, filename) {
  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'invoice.xml';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// الدوال التالية محذوفة (fake implementation):
//   - buildZATCAXML()  ← moved to Edge Function: zatca-invoice
//   - signInvoice()    ← moved to Edge Function: zatca-invoice
//   - generateCSR()    ← moved to Edge Function: zatca-onboarding
//   - requestOTP()     ← moved to Edge Function: zatca-onboarding
//   - getCSID()        ← moved to Edge Function: zatca-onboarding
//
// استخدم بدلاً من ذلك:
//   import { submitInvoice, requestOTP, ... } from '@/services/zatcaService';
// ═══════════════════════════════════════════════════════════════════════════
