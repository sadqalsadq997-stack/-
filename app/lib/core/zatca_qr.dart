// ══════════════════════════════════════════════════════════════════
// رمز QR للفاتورة المبسطة — المرحلة الأولى (Tags 1–5)
// يُطبع فقط إذا تعذر توقيع الفاتورة لحظة البيع (بدون إنترنت) أو الفرع غير
// مربوط بالهيئة. بعد الرفع يوقّعها السيرفر ويرسلها للهيئة خلال 24 ساعة،
// وإعادة الطباعة بعدها تطلع بـ QR المرحلة الثانية (فيه التوقيع).
// طول TLV بترميز BER (اسم عربي طويل > 127 بايت ما يفسد الرمز).
// (ملف Dart صافي — يُختبر مقابل مولّد الموقع src/lib/zatca.js)
// ══════════════════════════════════════════════════════════════════

import 'dart:convert';

List<int> _berLength(int n) {
  if (n < 0x80) return [n];
  if (n <= 0xff) return [0x81, n];
  return [0x82, (n >> 8) & 0xff, n & 0xff];
}

List<int> _tlv(int tag, String value) {
  final enc = utf8.encode(value);
  return [tag, ..._berLength(enc.length), ...enc];
}

/// وقت الفاتورة بصيغة ISO 8601 UTC مثل الموقع: 2026-10-29T17:05:09.123Z
String isoUtc(DateTime t) {
  final u = t.toUtc();
  String p(int n, [int w = 2]) => n.toString().padLeft(w, '0');
  return '${u.year}-${p(u.month)}-${p(u.day)}T${p(u.hour)}:${p(u.minute)}:${p(u.second)}.${p(u.millisecond, 3)}Z';
}

/// QR المرحلة الأولى: اسم البائع، الرقم الضريبي، الوقت، الإجمالي، الضريبة
String phase1Qr({required String sellerName, required String vatNumber, required DateTime issuedAt, required double total, required double vat}) {
  final bytes = <int>[
    ..._tlv(1, sellerName),
    ..._tlv(2, vatNumber),
    ..._tlv(3, isoUtc(issuedAt)),
    ..._tlv(4, total.toStringAsFixed(2)),
    ..._tlv(5, vat.toStringAsFixed(2)),
  ];
  return base64.encode(bytes);
}

/// الرقم الضريبي السعودي: 15 رقم يبدأ وينتهي بـ 3
bool isValidVat(String? v) => v != null && RegExp(r'^3\d{13}3$').hasMatch(v);
