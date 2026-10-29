// ══════════════════════════════════════════════════════════════════
// رسم الإيصال (فاتورة ضريبية مبسطة / فاتورة ضريبية / إشعار دائن)
// يُرسم كصورة بعرض الطابعة الحرارية (80مم = 576 نقطة، 58مم = 384) بخط
// Cairo ⇒ العربي يطلع صحيح على أي طابعة (حتى اللي ما تدعم العربي)،
// ونفس الصورة تُستخدم للمعاينة والطباعة عبر الشبكة أو النظام وملف PDF.
// نفس محتوى إيصال الموقع (src/lib/receipt.js).
// ══════════════════════════════════════════════════════════════════

import 'dart:ui' as ui;

import 'package:barcode/barcode.dart';
import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../services/sales.dart';

class ReceiptItem {
  const ReceiptItem({required this.name, required this.qty, required this.unitPrice, required this.total, this.category = 'S'});
  final String name;
  final num qty;
  final double unitPrice;
  final double total;
  final String category;
}

enum ReceiptKind { simplified, tax, creditNote, proforma }

class ReceiptDoc {
  ReceiptDoc({
    required this.kind, required this.number, required this.issuedAt, required this.items,
    required this.subtotal, required this.vat, required this.total,
    this.rounding = 0, this.discount = 0, this.discountNet = 0, this.linesNet,
    this.breakdown = const [], this.orderType, this.cashier, this.customer, this.buyer,
    this.paymentMethod, this.amountPaid, this.change, this.qr, this.phase2 = false,
    this.originalNumber, this.reason, this.offlineNote = false, this.b2bPending = false,
  });

  final ReceiptKind kind;
  final String number;
  final DateTime issuedAt;
  final List<ReceiptItem> items;
  final double subtotal;
  final double vat;
  final double total;
  final double rounding;
  final double discount;
  final double discountNet;
  final double? linesNet;
  final List<Map<String, dynamic>> breakdown;
  final String? orderType;
  final String? cashier;
  final String? customer;
  final Map<String, dynamic>? buyer;
  final String? paymentMethod;
  final double? amountPaid;
  final double? change;
  final String? qr;
  final bool phase2;
  final String? originalNumber;
  final String? reason;
  final bool offlineNote;
  final bool b2bPending;

  /// من بيع الجهاز
  factory ReceiptDoc.fromSale(Sale s) {
    final qr = s.zatcaQr ?? (s.isB2B ? null : s.phase1);
    return ReceiptDoc(
      kind: s.isB2B ? ReceiptKind.tax : ReceiptKind.simplified,
      number: s.invoiceNo, issuedAt: s.issuedAt,
      items: [
        for (final it in s.items)
          ReceiptItem(name: toS(it['name']) ?? 'صنف', qty: toD(it['quantity']), unitPrice: toD(it['price']), total: toD(it['total']),
              category: toS(it['vat_category']) ?? 'S'),
      ],
      subtotal: s.subtotal, vat: s.vat, total: s.total, rounding: s.rounding, discount: s.discount, discountNet: s.discountNet,
      linesNet: s.linesNet, breakdown: s.breakdown, orderType: s.orderType, cashier: s.cashier,
      customer: s.isB2B ? null : s.customerName, buyer: s.buyer, paymentMethod: s.paymentMethod,
      amountPaid: s.amountPaid, change: s.changeDue, qr: qr, phase2: s.zatcaQr != null,
      offlineNote: s.zatcaQr == null && !s.isB2B,
    );
  }

  /// من طلب السيرفر (إعادة طباعة)
  factory ReceiptDoc.fromOrder(Map<String, dynamic> o, {String? phase1}) {
    final isB2B = o['is_b2b'] == true;
    final qr = toS(o['zatca_qr']) ?? (isB2B ? null : phase1);
    return ReceiptDoc(
      kind: isB2B ? ReceiptKind.tax : ReceiptKind.simplified,
      number: toS(o['invoice_no']) ?? toS(o['order_number']) ?? '',
      issuedAt: DateTime.tryParse('${o['invoiced_at'] ?? o['created_at'] ?? ''}') ?? DateTime.now(),
      items: [
        for (final it in asList(o['items']))
          ReceiptItem(name: toS(it['name']) ?? 'صنف', qty: toD(it['quantity'] ?? it['qty']), unitPrice: toD(it['price']),
              total: it['total'] != null ? toD(it['total']) : toD(it['price']) * toD(it['quantity'] ?? 1), category: toS(it['vat_category']) ?? 'S'),
      ],
      subtotal: toD(o['subtotal']), vat: toD(o['tax_amount']), total: toD(o['total']), rounding: toD(o['rounding_amount']),
      discount: toD(o['discount_amount']), discountNet: toD(o['discount_net']), linesNet: o['lines_net'] == null ? null : toD(o['lines_net']),
      breakdown: asList(o['tax_breakdown']), orderType: toS(o['order_type']), cashier: toS(o['cashier_name']),
      customer: isB2B ? null : toS(o['customer_name']), buyer: o['buyer'] is Map ? asMap(o['buyer']) : null,
      paymentMethod: toS(o['payment_method']), amountPaid: o['amount_paid'] == null ? null : toD(o['amount_paid']),
      change: o['change_due'] == null ? null : toD(o['change_due']), qr: qr, phase2: o['zatca_qr'] != null,
    );
  }
}

/// يرسم الإيصال كصورة. width بالنقاط (576 = 80مم، 384 = 58مم)
Future<ui.Image> renderReceipt(ReceiptDoc d, Seller seller, {int width = 576}) async {
  final narrow = width < 500;
  final k = width / 576; // مقياس الخطوط
  final margin = 14.0 * k;
  final inner = width - margin * 2;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), 30000), Paint()..color = Colors.white);
  var y = margin;
  const black = Color(0xFF000000);
  const grey = Color(0xFF333333);

  TextStyle st(double size, {FontWeight w = FontWeight.w400, Color color = black}) =>
      TextStyle(fontFamily: 'Cairo', fontFamilyFallback: const ['SaudiRiyal'], fontSize: size * k, fontWeight: w, color: color, height: 1.35);

  TextPainter tp(String s, TextStyle style, {double? maxW, TextAlign align = TextAlign.right, TextDirection dir = TextDirection.rtl}) {
    final p = TextPainter(text: TextSpan(text: s, style: style), textDirection: dir, textAlign: align)
      ..layout(maxWidth: maxW ?? inner);
    return p;
  }

  void center(String s, TextStyle style, {double gap = 2}) {
    final p = tp(s, style, align: TextAlign.center);
    p.paint(c, Offset(margin + (inner - p.width) / 2, y));
    y += p.height + gap * k;
  }

  void row(String label, String value, {TextStyle? ls, TextStyle? vs, double gap = 1}) {
    final l = tp(label, ls ?? st(21), maxW: inner * 0.62);
    final v = tp(value, vs ?? st(21, w: FontWeight.w700), maxW: inner * 0.45, align: TextAlign.left, dir: TextDirection.ltr);
    l.paint(c, Offset(margin + inner - l.width, y));
    v.paint(c, Offset(margin, y + (l.height - v.height) / 2));
    y += (l.height > v.height ? l.height : v.height) + gap * k;
  }

  void dashed({double gap = 8}) {
    y += gap * k / 2;
    final p = Paint()
      ..color = black
      ..strokeWidth = 1.4 * k;
    for (var x = margin; x < margin + inner; x += 10 * k) {
      c.drawLine(Offset(x, y), Offset(x + 5 * k, y), p);
    }
    y += gap * k / 2;
  }

  void solid({double w = 2.4, double gap = 6}) {
    y += gap * k / 2;
    c.drawLine(Offset(margin, y), Offset(margin + inner, y), Paint()
      ..color = black
      ..strokeWidth = w * k);
    y += gap * k / 2;
  }

  // ── الرأس ──
  center(seller.name.isEmpty ? 'فلسي' : seller.name, st(narrow ? 30 : 32, w: FontWeight.w900));
  if ((seller.address ?? '').isNotEmpty) center(seller.address!, st(18, color: grey));
  if ((seller.phone ?? '').isNotEmpty) center(seller.phone!, st(18, color: grey));
  if (seller.vatNumber.isNotEmpty) center('الرقم الضريبي ${seller.vatNumber}', st(20, w: FontWeight.w700));
  if ((seller.crNumber ?? '').isNotEmpty && d.kind == ReceiptKind.tax) center('السجل التجاري ${seller.crNumber}', st(18, color: grey));

  final title = switch (d.kind) {
    ReceiptKind.creditNote => ['إشعار دائن', d.buyer != null ? 'Credit Note — Tax Invoice' : 'Credit Note'],
    ReceiptKind.proforma => ['فاتورة مبدئية', 'Pro-forma — ليست فاتورة ضريبية'],
    ReceiptKind.tax => ['فاتورة ضريبية', 'Tax Invoice'],
    ReceiptKind.simplified => ['فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'],
  };
  solid();
  center(title[0], st(27, w: FontWeight.w900), gap: 0);
  center(title[1], st(17, color: grey), gap: 0);
  solid();

  // ── بيانات الفاتورة ──
  row(d.kind == ReceiptKind.creditNote ? 'رقم الإشعار' : 'رقم الفاتورة', d.number);
  row('التاريخ', dateTimeKsa(d.issuedAt), vs: st(21));
  if (d.orderType != null && d.kind != ReceiptKind.creditNote) row('النوع', orderTypeLabels[d.orderType] ?? d.orderType!, vs: st(21));
  if ((d.cashier ?? '').isNotEmpty) row('الكاشير', d.cashier!, vs: st(21));
  if ((d.customer ?? '').isNotEmpty) row('العميل', d.customer!, vs: st(21));

  // المشتري (فاتورة الشركات)
  final b = d.buyer;
  if (b != null && (d.kind == ReceiptKind.tax || d.kind == ReceiptKind.creditNote)) {
    dashed();
    final lines = <String>[
      'المشتري: ${toS(b['name']) ?? ''}',
      if (toS(b['vat_number']) != null) 'الرقم الضريبي: ${b['vat_number']}' else if (toS(b['cr_number']) != null) 'السجل التجاري: ${b['cr_number']}',
      [b['building'], b['street'], b['district'], b['city'], b['postal']].where((e) => e != null && '$e'.isNotEmpty).join('، '),
    ];
    for (final l in lines) {
      final p = tp(l, st(20));
      p.paint(c, Offset(margin + inner - p.width, y));
      y += p.height;
    }
  }
  if (d.kind == ReceiptKind.creditNote && d.originalNumber != null) {
    dashed();
    final p = tp('مرتجع من الفاتورة: ${d.originalNumber}\nالسبب: ${d.reason ?? ''}', st(20));
    p.paint(c, Offset(margin + inner - p.width, y));
    y += p.height;
  }

  // ── الأصناف ──
  dashed();
  final colQty = inner * 0.12, colTotal = inner * 0.24, colName = inner - colQty - colTotal - 8 * k;
  void cell(String s, TextStyle style, double x, double w, TextAlign a, {TextDirection dir = TextDirection.rtl}) {
    final p = tp(s, style, maxW: w, align: a, dir: dir);
    final dx = a == TextAlign.center ? x + (w - p.width) / 2 : a == TextAlign.left ? x : x + w - p.width;
    p.paint(c, Offset(dx, y));
  }

  final hs = st(19, w: FontWeight.w700);
  cell('الصنف', hs, margin + colTotal + colQty + 8 * k, colName, TextAlign.right);
  cell('كمية', hs, margin + colTotal + 4 * k, colQty, TextAlign.center);
  cell('المبلغ', hs, margin, colTotal, TextAlign.left);
  y += tp('الصنف', hs).height;
  solid(w: 1.2, gap: 4);
  var count = 0.0;
  for (final it in d.items) {
    count += it.qty;
    final tag = it.category != 'S' ? ' (${vatCategoryShort[it.category] ?? ''})' : '';
    final nameP = tp('${it.name}$tag', st(21, w: FontWeight.w700), maxW: colName);
    final startY = y;
    nameP.paint(c, Offset(margin + inner - nameP.width, y));
    cell(qty(it.qty), st(21), margin + colTotal + 4 * k, colQty, TextAlign.center, dir: TextDirection.ltr);
    cell(money(it.total), st(21, w: FontWeight.w700), margin, colTotal, TextAlign.left, dir: TextDirection.ltr);
    y = startY + nameP.height;
    if (!narrow) {
      final u = tp('${money(it.unitPrice)} × ${qty(it.qty)}', st(17, color: grey), maxW: colName);
      u.paint(c, Offset(margin + inner - u.width, y));
      y += u.height;
    }
    y += 3 * k;
  }
  dashed(gap: 4);
  row('عدد الأصناف', qty(count), ls: st(18, color: grey), vs: st(18, color: grey));

  // ── المجاميع ──
  final boxTop = y + 4 * k;
  y += 10 * k;
  if (d.discount > 0) {
    row('المجموع قبل الخصم (غير شامل)', money(d.linesNet ?? (d.subtotal + d.discountNet)));
    row('الخصم (غير شامل الضريبة)', '-${money(d.discountNet > 0 ? d.discountNet : d.discount)}');
  }
  row('الإجمالي غير شامل الضريبة', money(d.subtotal));
  for (final g in d.breakdown) {
    final cat = toS(g['category']);
    if (cat == null || cat == 'S' || toD(g['taxable']) <= 0) continue;
    row(cat == 'Z' ? 'مبيعات بنسبة صفرية' : cat == 'E' ? 'مبيعات معفاة' : 'خارج نطاق الضريبة', money(toD(g['taxable'])), ls: st(19), vs: st(19));
  }
  final allStd = d.breakdown.isEmpty ? d.items.every((i) => i.category == 'S') : d.breakdown.every((g) => g['category'] == 'S');
  row('ضريبة القيمة المضافة${allStd ? ' 15%' : ''}', money(d.vat));
  if (d.rounding.abs() >= 0.005) row('تقريب', money(d.rounding), ls: st(18), vs: st(18));
  solid(w: 2, gap: 4);
  row(d.kind == ReceiptKind.creditNote ? 'المبلغ المسترد' : 'الإجمالي شامل الضريبة', '${money(d.total)} $riyal',
      ls: st(25, w: FontWeight.w900), vs: st(27, w: FontWeight.w900));
  y += 6 * k;
  c.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTRB(margin - 4 * k, boxTop, margin + inner + 4 * k, y), Radius.circular(6 * k)),
      Paint()
        ..color = black
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2 * k);
  y += 8 * k;

  if (d.paymentMethod != null && d.kind != ReceiptKind.creditNote) row('طريقة الدفع', payLabels[d.paymentMethod] ?? d.paymentMethod!);
  if ((d.amountPaid ?? 0) > 0) {
    row('المدفوع', money(d.amountPaid!), vs: st(21));
    row('الباقي', money(d.change ?? 0), vs: st(21));
  }

  // ── QR ──
  final qrData = d.kind == ReceiptKind.proforma ? null : d.qr;
  if (qrData != null && qrData.isNotEmpty) {
    y += 10 * k;
    final size = (narrow ? 250.0 : 290.0) * k;
    final left = margin + (inner - size) / 2;
    final paint = Paint()..color = black;
    for (final e in Barcode.qrCode(errorCorrectLevel: BarcodeQRCorrectionLevel.medium).make(qrData, width: size, height: size)) {
      if (e is BarcodeBar && e.black) c.drawRect(Rect.fromLTWH(left + e.left, y + e.top, e.width + 0.3, e.height + 0.3), paint);
    }
    y += size + 8 * k;
  }

  center(d.kind == ReceiptKind.creditNote ? 'تم الإرجاع' : 'شكراً لزيارتكم', st(22, w: FontWeight.w700));
  if (d.phase2) center('فاتورة إلكترونية مرسلة لهيئة الزكاة والضريبة والجمارك', st(16, color: grey));
  if (d.offlineNote) center('فاتورة صادرة بدون إنترنت — تُرسل للهيئة تلقائياً', st(16, color: grey));
  if (d.b2bPending) center('بانتظار اعتماد الهيئة — لا تُسلَّم قبل الاعتماد', st(18, w: FontWeight.w900));
  center('Felsy.org', st(16, color: grey));
  y += margin * 2;

  final picture = rec.endRecording();
  return picture.toImage(width, y.ceil());
}
