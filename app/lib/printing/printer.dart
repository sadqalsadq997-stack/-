// ══════════════════════════════════════════════════════════════════
// الطباعة
//  • طابعة حرارية عبر الشبكة (IP:9100) بأوامر ESC/POS — الأسرع والأشهر
//    في الكاشيرات. الإيصال يُرسل كصورة ⇒ العربي صحيح على أي طابعة.
//  • طابعة النظام: ويندوز (طابعة USB المعرّفة بالنظام — مباشرة بدون نافذة)،
//    آيفون/آيباد (AirPrint)، أندرويد (خدمة الطباعة).
//  • مشاركة PDF (واتساب/إيميل) لفاتورة الشركات.
// ══════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../data/models.dart';
import 'receipt.dart';

class PrinterSettings {
  PrinterSettings({
    this.mode = 'system', this.host = '', this.port = 9100, this.paper = 80, this.copies = 1,
    this.autoPrint = true, this.openDrawer = false, this.systemPrinter,
  });
  factory PrinterSettings.from(Map<String, dynamic> m) => PrinterSettings(
        mode: toS(m['mode']) ?? 'system', host: toS(m['host']) ?? '', port: m['port'] == null ? 9100 : toI(m['port']),
        paper: toI(m['paper']) == 58 ? 58 : 80, copies: toI(m['copies']).clamp(1, 3), autoPrint: m['auto'] != false,
        openDrawer: m['drawer'] == true, systemPrinter: toS(m['system_printer']),
      );

  /// 'system' | 'network' | 'off'
  String mode;
  String host;
  int port;
  int paper;
  int copies;
  bool autoPrint;
  bool openDrawer;
  String? systemPrinter; // رابط الطابعة في ويندوز/ماك للطباعة المباشرة

  int get dots => paper == 58 ? 384 : 576;
  Map<String, dynamic> toJson() => {
        'mode': mode, 'host': host, 'port': port, 'paper': paper, 'copies': copies, 'auto': autoPrint, 'drawer': openDrawer,
        'system_printer': systemPrinter,
      };
}

class PrinterService extends ChangeNotifier {
  PrinterService(this.store);
  final LocalStore store;
  PrinterSettings settings = PrinterSettings();

  Future<void> load() async {
    final m = await store.readMap('printer');
    if (m != null) settings = PrinterSettings.from(m);
    notifyListeners();
  }

  Future<void> save(PrinterSettings s) async {
    settings = s;
    await store.write('printer', s.toJson());
    notifyListeners();
  }

  bool get isDesktop => Platform.isWindows || Platform.isMacOS || Platform.isLinux;

  Future<Uint8List> receiptPng(ReceiptDoc d, Seller seller) async {
    final img = await renderReceipt(d, seller, width: settings.dots);
    final bd = await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    return bd!.buffer.asUint8List();
  }

  /// طباعة إيصال. يرجع رسالة خطأ أو null.
  Future<String?> printReceipt(ReceiptDoc d, Seller seller) async {
    if (settings.mode == 'off') return null;
    try {
      final img = await renderReceipt(d, seller, width: settings.dots);
      if (settings.mode == 'network') {
        final bytes = await escposFromImage(img, cut: true, drawer: settings.openDrawer && d.kind != ReceiptKind.proforma);
        img.dispose();
        for (var i = 0; i < settings.copies; i++) {
          await _sendNetwork(bytes);
        }
        return null;
      }
      final bd = await img.toByteData(format: ui.ImageByteFormat.png);
      final png = bd!.buffer.asUint8List();
      final ratio = img.height / img.width;
      img.dispose();
      final pdf = await _pdf(png, ratio);
      if (isDesktop && settings.systemPrinter != null) {
        for (var i = 0; i < settings.copies; i++) {
          final ok = await Printing.directPrintPdf(printer: Printer(url: settings.systemPrinter!), onLayout: (_) async => pdf, name: d.number);
          if (!ok) return 'تعذرت الطباعة على الطابعة المختارة';
        }
        return null;
      }
      await Printing.layoutPdf(onLayout: (_) async => pdf, name: d.number);
      return null;
    } on SocketException {
      return 'تعذر الوصول للطابعة ${settings.host} — تأكد إنها شغالة وعلى نفس الشبكة';
    } on TimeoutException {
      return 'الطابعة ما استجابت — تأكد من عنوانها';
    } catch (e) {
      return 'تعذرت الطباعة: $e';
    }
  }

  Future<Uint8List> _pdf(Uint8List png, double ratio) async {
    final wMm = settings.paper.toDouble();
    final doc = pw.Document();
    final w = wMm * PdfPageFormat.mm;
    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat(w, w * ratio, marginAll: 0),
      build: (_) => pw.Image(pw.MemoryImage(png), fit: pw.BoxFit.fitWidth),
    ));
    return doc.save();
  }

  /// PDF للمشاركة (فاتورة شركة للعميل مثلاً)
  Future<void> share(ReceiptDoc d, Seller seller) async {
    final img = await renderReceipt(d, seller, width: 576);
    final bd = await img.toByteData(format: ui.ImageByteFormat.png);
    final ratio = img.height / img.width;
    img.dispose();
    final pdf = await _pdf(bd!.buffer.asUint8List(), ratio);
    await Printing.sharePdf(bytes: pdf, filename: '${d.number}.pdf');
  }

  Future<void> _sendNetwork(List<int> bytes) async {
    final s = await Socket.connect(settings.host.trim(), settings.port, timeout: const Duration(seconds: 5));
    try {
      s.add(bytes);
      await s.flush().timeout(const Duration(seconds: 10));
    } finally {
      await s.close();
    }
  }

  /// طابعات النظام (ويندوز/ماك)
  Future<List<Printer>> systemPrinters() async {
    try {
      return await Printing.listPrinters();
    } catch (_) {
      return const [];
    }
  }

  Future<String?> testPrint(Seller seller) => printReceipt(
        ReceiptDoc(
          kind: ReceiptKind.proforma, number: 'TEST', issuedAt: DateTime.now(),
          items: const [ReceiptItem(name: 'تجربة طباعة — فلسي', qty: 1, unitPrice: 1.15, total: 1.15)],
          subtotal: 1, vat: 0.15, total: 1.15,
        ),
        seller,
      );
}

/// صورة الإيصال ⇐ أوامر ESC/POS (نقطية أبيض/أسود) + قص الورق
Future<List<int>> escposFromImage(ui.Image img, {bool cut = true, bool drawer = false}) async {
  final w = img.width, h = img.height;
  final raw = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
  final px = raw!.buffer.asUint8List();
  final bytesPerRow = (w + 7) ~/ 8;
  final out = BytesBuilder();
  out.add(const [0x1B, 0x40]); // تهيئة
  if (drawer) out.add(const [0x1B, 0x70, 0x00, 0x19, 0xFA]); // فتح درج النقود
  const band = 256; // بعض الطابعات تحدد ارتفاع الصورة في الأمر الواحد
  for (var y0 = 0; y0 < h; y0 += band) {
    final bh = (h - y0) < band ? (h - y0) : band;
    out.add([0x1D, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, bh & 0xff, (bh >> 8) & 0xff]);
    final data = Uint8List(bytesPerRow * bh);
    for (var y = 0; y < bh; y++) {
      final rowOff = (y0 + y) * w * 4;
      for (var x = 0; x < w; x++) {
        final i = rowOff + x * 4;
        final lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) ~/ 1000;
        if (px[i + 3] > 128 && lum < 150) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    out.add(data);
  }
  out.add(const [0x1B, 0x64, 0x04]); // تغذية 4 أسطر
  if (cut) out.add(const [0x1D, 0x56, 0x42, 0x00]); // قص
  return out.takeBytes();
}
