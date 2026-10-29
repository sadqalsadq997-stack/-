// ══════════════════════════════════════════════════════════════════
// حساب الأسعار — نسخة مطابقة لحساب السيرفر (felsy_price_doc في 027)
// وللموقع (src/lib/pricing.js). كل الحسابات بالهللة (أعداد صحيحة)
// وقسمة مقرّبة نصف لأعلى مثل round() في Postgres تماماً.
// مهم: الإيصال اللي ينطبع بدون إنترنت لازم يطابق الفاتورة اللي تنرسل
// للهيئة بعدين — لذلك أي تغيير هنا يتغير في السيرفر والموقع بنفس الوقت.
// (ملف Dart صافي بدون Flutter ⇒ يُختبر مباشرة مقابل قاعدة البيانات)
// ══════════════════════════════════════════════════════════════════

/// ريال ⇐ هللة
int toHalala(num sar) => (sar * 100 + (sar >= 0 ? 1e-9 : -1e-9)).round();

/// هللة ⇐ ريال
double fromHalala(int h) => h / 100;

/// قسمة صحيحة مقرّبة نصف لأعلى (للأعداد غير السالبة)
int rdiv(int num, int den) {
  final q = num ~/ den;
  final r = num - q * den;
  return 2 * r >= den ? q + 1 : q;
}

/// الفئة الضريبية: S قياسية 15%، Z صفرية، E معفاة، O خارج النطاق
String vatCategoryOf(String? category, num? taxRate) {
  final c = (category ?? '').trim().toUpperCase();
  if (c == 'S' || c == 'Z' || c == 'E' || c == 'O') return c;
  return (taxRate ?? 15) == 0 ? 'O' : 'S';
}

/// أجزاء سعر الوحدة بالهللة
class UnitPrice {
  const UnitPrice({required this.net, required this.vat, required this.gross, required this.rate, required this.category, this.exemptionCode});
  final int net;
  final int vat;
  final int gross;
  final int rate;
  final String category;
  final String? exemptionCode;
}

/// سعر الوحدة من بيانات الصنف (نفس unitParts في الموقع)
UnitPrice unitPrice({required num basePrice, required bool taxInclusive, String? vatCategory, num? taxRate, String? exemptionCode}) {
  final base = toHalala(basePrice);
  final cat = vatCategoryOf(vatCategory, taxRate);
  final rate = cat == 'S' ? 15 : 0;
  final code = cat == 'S' ? null : (exemptionCode ?? (cat == 'O' ? 'VATEX-SA-OOS' : null));
  if (taxInclusive || rate == 0) {
    final net = rdiv(base * 100, 100 + rate);
    return UnitPrice(net: net, vat: base - net, gross: base, rate: rate, category: cat, exemptionCode: code);
  }
  final vat = rdiv(base * rate, 100);
  return UnitPrice(net: base, vat: vat, gross: base + vat, rate: rate, category: cat, exemptionCode: code);
}

/// سطر في السلة
class PriceLine {
  const PriceLine({required this.qty, required this.unit});
  final int qty;
  final UnitPrice unit;
}

/// فئة ضريبية في المستند
class TaxGroup {
  const TaxGroup({required this.category, required this.code, required this.rate, required this.discount, required this.taxable, required this.tax});
  final String category;
  final String? code;
  final int rate;
  final double discount;
  final double taxable;
  final double tax;
}

/// مجاميع المستند
class DocTotals {
  const DocTotals({
    required this.linesNet, required this.discount, required this.discountNet, required this.subtotal,
    required this.vat, required this.total, required this.rounding, required this.gross, required this.breakdown,
  });
  final double linesNet;
  final double discount;
  final double discountNet;
  final double subtotal;
  final double vat;
  final double total;
  final double rounding;
  final double gross;
  final List<TaxGroup> breakdown;

  static const empty = DocTotals(linesNet: 0, discount: 0, discountNet: 0, subtotal: 0, vat: 0, total: 0, rounding: 0, gross: 0, breakdown: []);
}

class _Acc {
  _Acc(this.category, this.code, this.rate);
  final String category;
  final String? code;
  final int rate;
  int net = 0;
  int lvat = 0;
  int gross = 0;
}

/// مجاميع السلة مع الخصم (الخصم بالريال وشامل الضريبة)
///   صافي الوحدة = round(السعر الشامل ÷ (1+النسبة))، صافي السطر = صافي الوحدة × الكمية
///   ضريبة السطر = round(صافي السطر × النسبة)
///   الخصم يتوزع على فئات الضريبة بنسبة إجمالي كل فئة (الباقي للأخيرة)
///   ضريبة الفئة: بدون خصم = مجموع ضرائب الأسطر، مع خصم = round(الخاضع × النسبة)
DocTotals docTotals(List<PriceLine> lines, {num discount = 0}) {
  final groups = <String, _Acc>{};
  var grossH = 0;
  for (final l in lines) {
    final q = l.qty;
    if (q <= 0) continue;
    final rate = l.unit.rate;
    final unitNet = rdiv(l.unit.gross * 100, 100 + rate);
    final lineNet = unitNet * q;
    final lineVat = rdiv(lineNet * rate, 100);
    final lineGross = l.unit.gross * q;
    final key = '${l.unit.category}|${l.unit.exemptionCode ?? ''}';
    final g = groups.putIfAbsent(key, () => _Acc(l.unit.category, l.unit.exemptionCode, rate));
    g.net += lineNet;
    g.lvat += lineVat;
    g.gross += lineGross;
    grossH += lineGross;
  }
  // نفس ترتيب السيرفر: القياسية أولاً ثم بالفئة ثم بالرمز
  final ordered = groups.values.toList()
    ..sort((a, b) {
      final s = (b.category == 'S' ? 1 : 0) - (a.category == 'S' ? 1 : 0);
      if (s != 0) return s;
      final c = a.category.compareTo(b.category);
      if (c != 0) return c;
      return (a.code ?? '').compareTo(b.code ?? '');
    });
  var d = toHalala(discount);
  if (d < 0 || d >= grossH) d = 0; // السيرفر يرفض خصم ≥ الإجمالي — الواجهة تمنعه قبل الإرسال
  var allocated = 0, linesNet = 0, allowT = 0, taxT = 0;
  final breakdown = <TaxGroup>[];
  for (var i = 0; i < ordered.length; i++) {
    final g = ordered[i];
    final dg = d == 0 ? 0 : (i == ordered.length - 1 ? d - allocated : rdiv(d * g.gross, grossH));
    allocated += dg;
    final allow = g.rate > 0 ? rdiv(dg * 100, 100 + g.rate) : dg;
    final taxable = g.net - allow;
    final tax = d == 0 ? g.lvat : rdiv(taxable * g.rate, 100);
    linesNet += g.net;
    allowT += allow;
    taxT += tax;
    breakdown.add(TaxGroup(category: g.category, code: g.code, rate: g.rate, discount: fromHalala(dg), taxable: fromHalala(taxable), tax: fromHalala(tax)));
  }
  final payable = grossH - d;
  return DocTotals(
    linesNet: fromHalala(linesNet), discount: fromHalala(d), discountNet: fromHalala(allowT),
    subtotal: fromHalala(linesNet - allowT), vat: fromHalala(taxT), total: fromHalala(payable),
    rounding: fromHalala(payable - (linesNet - allowT) - taxT), gross: fromHalala(grossH), breakdown: breakdown,
  );
}

/// الخصم بالنسبة ⇐ مبلغ (مقرّب للهللة)
double percentDiscount(double gross, double percent) {
  final p = percent.clamp(0, 100);
  return fromHalala(rdiv(toHalala(gross) * toHalala(p), 10000));
}
