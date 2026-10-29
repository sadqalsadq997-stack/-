// ══════════════════════════════════════════════════════════════════
// حساب الأسعار — نسخة مطابقة لحساب القاعدة (felsy_price_doc في 027)
// كل الحسابات بأعداد صحيحة (هللات) وقسمة مقرّبة نصف لأعلى — مثل
// round() في Postgres تماماً. (الضرب بـ 0.15 بالكسور يعطي 10.4999… بدل 10.5)
// الفاتورة الرسمية تُحسب في السيرفر — هذا للعرض فقط ويطابقه بالهللة.
// ══════════════════════════════════════════════════════════════════

const toH = (sar) => Math.round((Number(sar) || 0) * 100 + Number.EPSILON * 100);
export const fromH = (h) => h / 100;

/** قسمة صحيحة مقرّبة نصف لأعلى (للأعداد غير السالبة) */
export function rdiv(num, den) {
  const q = Math.floor(num / den);
  const r = num - q * den;
  return 2 * r >= den ? q + 1 : q;
}

const catOf = (p) => String(p?.vat_category || (Number(p?.tax_rate ?? 15) === 0 ? 'O' : 'S')).toUpperCase();

/** أجزاء سعر الوحدة بالهللة: { net, vat, gross, rate, cat, code } */
export function unitParts(product) {
  const base = toH(product?.base_price ?? product?.price ?? 0);
  const cat = catOf(product);
  const ratePct = cat === 'S' ? 15 : 0;
  const code = cat === 'S' ? null : (product?.vat_exemption_code || (cat === 'O' ? 'VATEX-SA-OOS' : null));
  if (product?.tax_inclusive || ratePct === 0) {
    const net = rdiv(base * 100, 100 + ratePct);
    return { net, vat: base - net, gross: base, rate: ratePct, cat, code };
  }
  const vat = rdiv(base * ratePct, 100);
  return { net: base, vat, gross: base + vat, rate: ratePct, cat, code };
}

/**
 * مجاميع السلة مع الخصم — نفس طريقة السيرفر وطريقة هيئة الزكاة:
 *   صافي الوحدة = round(السعر الشامل ÷ (1+النسبة))، صافي السطر = صافي الوحدة × الكمية
 *   ضريبة السطر = round(صافي السطر × النسبة)
 *   الخصم (شامل) يتوزع على فئات الضريبة بنسبة إجمالي كل فئة (الباقي للأخيرة)
 *   ضريبة الفئة: بدون خصم = مجموع ضرائب الأسطر، مع خصم = round(الخاضع × النسبة)
 *   العميل يدفع مجموع الأسعار الشاملة − الخصم، والفرق هللات = تقريب
 * @param lines [{ qty, unit: unitParts() }]
 * @param discount الخصم بالريال (شامل الضريبة)
 */
export function cartTotals(lines, discount = 0) {
  const groups = new Map();
  let grossH = 0;
  for (const l of lines) {
    const q = Math.max(0, Math.trunc(Number(l.qty) || 0));
    if (!q) continue;
    const rate = l.unit.rate ?? 15;
    const cat = l.unit.cat || (rate === 0 ? 'O' : 'S');
    const unitNet = rdiv(l.unit.gross * 100, 100 + rate);
    const lineNet = unitNet * q;
    const lineVat = rdiv(lineNet * rate, 100);
    const lineGross = l.unit.gross * q;
    const key = `${cat}|${l.unit.code || ''}`;
    const g = groups.get(key) || { cat, code: l.unit.code || null, rate, net: 0, lvat: 0, gross: 0 };
    g.net += lineNet; g.lvat += lineVat; g.gross += lineGross;
    groups.set(key, g);
    grossH += lineGross;
  }
  // نفس ترتيب السيرفر: القياسية أولاً ثم بالفئة ثم بالرمز
  const ordered = [...groups.values()].sort((a, b) =>
    (b.cat === 'S') - (a.cat === 'S') || a.cat.localeCompare(b.cat) || String(a.code || '').localeCompare(String(b.code || '')));
  let d = Math.max(0, toH(discount));
  if (d >= grossH) d = 0; // السيرفر يرفض خصم ≥ الإجمالي — الواجهة تمنعه قبل الإرسال
  let allocated = 0, linesNet = 0, allowT = 0, taxT = 0;
  const breakdown = ordered.map((g, i) => {
    const dg = d === 0 ? 0 : i === ordered.length - 1 ? d - allocated : rdiv(d * g.gross, grossH);
    allocated += dg;
    const allow = g.rate > 0 ? rdiv(dg * 100, 100 + g.rate) : dg;
    const taxable = g.net - allow;
    const tax = d === 0 ? g.lvat : rdiv(taxable * g.rate, 100);
    linesNet += g.net; allowT += allow; taxT += tax;
    return { category: g.cat, code: g.code, rate: g.rate, discount: fromH(dg), taxable: fromH(taxable), tax: fromH(tax) };
  });
  const payable = grossH - d;
  return {
    linesNet: fromH(linesNet), discount: fromH(d), discountNet: fromH(allowT),
    subtotal: fromH(linesNet - allowT), vat: fromH(taxT), total: fromH(payable),
    rounding: fromH(payable - (linesNet - allowT) - taxT), gross: fromH(grossH), breakdown,
  };
}

export const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
