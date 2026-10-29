// اختبارات المنطق الصافي — القيم مطابقة للسيرفر (SQL) والموقع (JS)
// flutter test
import 'package:felsy/core/ids.dart';
import 'package:felsy/core/pin_hash.dart';
import 'package:felsy/core/pricing.dart';
import 'package:felsy/core/zatca_qr.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('التسعير والضريبة', () {
    test('سعر شامل/غير شامل الضريبة', () {
      expect(unitPrice(basePrice: 10, taxInclusive: true).gross, 1000);
      expect(unitPrice(basePrice: 20, taxInclusive: false).gross, 2300);
    });

    test('70 ريال + 15% = 80.50 (بدون خطأ الأعداد العشرية)', () {
      final t = docTotals([PriceLine(qty: 1, unit: unitPrice(basePrice: 70, taxInclusive: false))]);
      expect([t.subtotal, t.vat, t.total], [70.0, 10.5, 80.5]);
    });

    test('سلة مختلطة (15% + صفرية) مع خصم على الفاتورة', () {
      final a = unitPrice(basePrice: 10, taxInclusive: true);
      final b = unitPrice(basePrice: 20, taxInclusive: false);
      final z = unitPrice(basePrice: 7, taxInclusive: true, vatCategory: 'Z', exemptionCode: 'VATEX-SA-35');
      final t = docTotals([PriceLine(qty: 3, unit: a), PriceLine(qty: 1, unit: b), PriceLine(qty: 2, unit: z)], discount: 5);
      expect(t.total, 62.0);
      expect(t.subtotal, 55.62);
      expect(t.vat, 6.4);
      expect(t.rounding, -0.02);
      expect(t.discountNet, 4.48);
      expect(t.breakdown.map((g) => [g.category, g.taxable, g.tax]).toList(), [
        ['S', 42.66, 6.4],
        ['Z', 12.96, 0.0],
      ]);
    });

    test('تقريب النصف', () {
      expect(rdiv(5, 2), 3);
      expect(rdiv(-5, 2), -3);
      expect(toHalala(0.1 + 0.2), 30);
    });
  });

  group('رمز الهيئة (المرحلة الأولى)', () {
    test('TLV مطابق للموقع', () {
      final qr = phase1Qr(
        sellerName: 'مؤسسة مقهى الورد للتجارة والمقاولات العامة والتوريدات الغذائية المحدودة فرع الرياض حي العليا',
        vatNumber: '310123456700003',
        issuedAt: DateTime.utc(2026, 10, 29, 17, 5, 9, 123),
        total: 47.5,
        vat: 6.19,
      );
      expect(qr, startsWith('AYGs2YXYpNiz2LPYqSDZhdmC2YfZiSDYp9mE2YjYsdivINmE'));
      expect(qr, endsWith('MzEwMTIzNDU2NzAwMDAzAxgyMDI2LTEwLTI5VDE3OjA1OjA5LjEyM1oEBTQ3LjUwBQQ2LjE5'));
    });

    test('الرقم الضريبي', () {
      expect(isValidVat('310123456700003'), isTrue);
      expect(isValidVat('210123456700003'), isFalse);
      expect(isValidVat('31012345670003'), isFalse);
    });
  });

  group('الأمان', () {
    test('بصمة PIN مطابقة للموقع والسيرفر', () {
      expect(hashPin('1234'), '153517b92668d3baca7463fc198d727f1a786767434c3b4ef8a38818263a359c');
      expect(hashPin('0000'), '4ca669c6f77efbda515ae50064d149f01bdb74f41e9ef01a0da3c0c4654841d3');
    });

    test('البصمة المحلية تختلف من جهاز لجهاز', () {
      final h = hashPin('1234');
      expect(offlinePinKey(h, 'a'), isNot(offlinePinKey(h, 'b')));
    });

    test('معرّفات عشوائية صحيحة', () {
      final ids = {for (var i = 0; i < 200; i++) uuidV4()};
      expect(ids.length, 200);
      expect(ids.every(isUuid), isTrue);
    });
  });
}
