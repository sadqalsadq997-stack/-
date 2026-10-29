// تحقق من المنطق الصافي مقابل السيرفر والموقع (يُشغَّل بـ dart run tool/verify_core.dart)
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:felsy/core/pin_hash.dart';
import 'package:felsy/core/pricing.dart';
import 'package:felsy/core/zatca_qr.dart';

void main(List<String> args) {
  final mode = args.isEmpty ? 'all' : args.first;
  if (mode == 'carts') {
    // يولّد سلال عشوائية + مجاميع Dart ⇒ ملف JSON يقارنه سكربت SQL
    final r = Random(11);
    const cats = [['S', null], ['S', null], ['S', null], ['Z', 'VATEX-SA-35'], ['E', 'VATEX-SA-29'], ['O', 'VATEX-SA-OOS'], ['Z', 'VATEX-SA-32']];
    final out = <Map<String, Object?>>[];
    for (var i = 0; i < 3000; i++) {
      final n = 1 + r.nextInt(6);
      final lines = <PriceLine>[];
      final items = <Map<String, Object?>>[];
      for (var j = 0; j < n; j++) {
        final c = cats[r.nextInt(cats.length)];
        final u = unitPrice(basePrice: (r.nextInt(20000) + 1) / 100, taxInclusive: r.nextDouble() < 0.6, vatCategory: c[0], exemptionCode: c[1]);
        final q = 1 + r.nextInt(25);
        lines.add(PriceLine(qty: q, unit: u));
        items.add({'name': 'x', 'price': u.gross / 100, 'quantity': q, 'vat_category': u.category, if (u.exemptionCode != null) 'vat_exemption_code': u.exemptionCode});
      }
      final gross = lines.fold<int>(0, (s, l) => s + l.unit.gross * l.qty) / 100;
      final disc = r.nextBool() ? 0.0 : min((r.nextDouble() * gross * 60).roundToDouble() / 100, max(0, gross - 0.01)).toDouble();
      final t = docTotals(lines, discount: disc);
      out.add({'items': items, 'disc': disc, 'dart': [t.subtotal, t.vat, t.total, t.rounding, t.discountNet]});
    }
    File(args[1]).writeAsStringSync(jsonEncode(out));
    print('wrote ${out.length} carts');
    return;
  }
  print('pin1234=${hashPin('1234')}');
  print('pin0000=${hashPin('0000')}');
  print('qr=${phase1Qr(sellerName: 'مؤسسة مقهى الورد للتجارة والمقاولات العامة والتوريدات الغذائية المحدودة فرع الرياض حي العليا', vatNumber: '310123456700003', issuedAt: DateTime.utc(2026, 10, 29, 17, 5, 9, 123), total: 47.5, vat: 6.19)}');
}
