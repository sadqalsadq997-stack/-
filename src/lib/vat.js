// ══════════════════════════════════════════════════════════════════
// فئات ضريبة القيمة المضافة ورموز الإعفاء (قائمة هيئة الزكاة)
// نفس القائمة في القاعدة: felsy_vat_reason / felsy_vat_code_ok (027)
// ══════════════════════════════════════════════════════════════════

export const VAT_CATEGORIES = [
  { id: 'S', label: 'خاضع للضريبة 15%', short: '15%' },
  { id: 'Z', label: 'نسبة صفرية 0%', short: 'صفري' },
  { id: 'E', label: 'معفى من الضريبة', short: 'معفى' },
  { id: 'O', label: 'خارج نطاق الضريبة', short: 'خارج النطاق' },
];

export const VAT_EXEMPTIONS = {
  E: [
    { code: 'VATEX-SA-29', label: 'الخدمات المالية المعفاة (المادة 29)' },
    { code: 'VATEX-SA-29-7', label: 'عقود التأمين على الحياة (المادة 29)' },
    { code: 'VATEX-SA-30', label: 'توريد العقارات السكنية المعفاة (المادة 30)' },
  ],
  Z: [
    { code: 'VATEX-SA-35', label: 'الأدوية والمعدات الطبية (المادة 35)' },
    { code: 'VATEX-SA-32', label: 'تصدير السلع (المادة 32)' },
    { code: 'VATEX-SA-33', label: 'تصدير الخدمات (المادة 33)' },
    { code: 'VATEX-SA-34-1', label: 'النقل الدولي للسلع (المادة 34)' },
    { code: 'VATEX-SA-34-2', label: 'النقل الدولي للركاب (المادة 34)' },
    { code: 'VATEX-SA-34-3', label: 'خدمات مرتبطة بالنقل الدولي للركاب (المادة 34)' },
    { code: 'VATEX-SA-34-4', label: 'توريد وسائل النقل المؤهلة (المادة 34)' },
    { code: 'VATEX-SA-34-5', label: 'خدمات مرتبطة بنقل السلع أو الركاب (المادة 34)' },
    { code: 'VATEX-SA-36', label: 'المعادن المؤهلة (المادة 36)' },
    { code: 'VATEX-SA-MLTRY', label: 'السلع العسكرية المؤهلة' },
  ],
  O: [{ code: 'VATEX-SA-OOS', label: 'خارج نطاق ضريبة القيمة المضافة' }],
};

export const vatCategoryOf = (p) => String(p?.vat_category || (Number(p?.tax_rate ?? 15) === 0 ? 'O' : 'S')).toUpperCase();
export const vatRateOf = (p) => (vatCategoryOf(p) === 'S' ? 15 : 0);
export const vatShort = (cat) => VAT_CATEGORIES.find((c) => c.id === cat)?.short || '15%';
export const exemptionLabel = (code) =>
  Object.values(VAT_EXEMPTIONS).flat().find((x) => x.code === code)?.label || '';
