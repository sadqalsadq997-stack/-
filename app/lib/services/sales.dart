// ══════════════════════════════════════════════════════════════════
// المبيعات: البيع يُحفظ في الجهاز أولاً ثم يُرفع
//   1) رقم الفاتورة يُحجز من سلسلة الجهاز (يشتغل بدون إنترنت)
//   2) البيع يُحفظ في "الصادر" قبل الطباعة (لا يضيع حتى لو انطفى الجهاز)
//   3) مع الاتصال: يُرفع (app_submit_sale — آمن للتكرار) ثم يُوقّع ويُرسل
//      للهيئة فوراً (zatca-einvoice) ⇒ QR المرحلة الثانية على الإيصال
//   4) بدون اتصال: الإيصال بـ QR المرحلة الأولى، والرفع تلقائي عند رجوع
//      النت (والسيرفر يعيد الإرسال للهيئة كل 5 دقائق ضمن مهلة 24 ساعة)
// ══════════════════════════════════════════════════════════════════

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/ids.dart';
import '../core/pricing.dart';
import '../core/store.dart';
import '../core/zatca_qr.dart';
import '../data/models.dart';

enum SaleStatus { queued, synced, failed }

class Sale {
  Sale(this.data);
  factory Sale.fromJson(Map<String, dynamic> j) => Sale(Map<String, dynamic>.from(j));
  final Map<String, dynamic> data;

  String get id => '${data['id']}';
  String get invoiceNo => toS(data['server_invoice_no']) ?? toS(data['invoice_no']) ?? '';
  DateTime get issuedAt => DateTime.tryParse('${data['issued_at'] ?? ''}') ?? DateTime.now();
  SaleStatus get status => SaleStatus.values.firstWhere((s) => s.name == data['status'], orElse: () => SaleStatus.queued);
  double get total => toD(data['total']);
  double get subtotal => toD(data['subtotal']);
  double get vat => toD(data['tax_amount']);
  double get rounding => toD(data['rounding_amount']);
  double get discount => toD(data['discount_amount']);
  double get discountNet => toD(data['discount_net']);
  double get linesNet => toD(data['lines_net']);
  String get paymentMethod => toS(data['payment_method']) ?? 'cash';
  List<Map<String, dynamic>> get items => asList(data['items']);
  List<Map<String, dynamic>> get breakdown => asList(data['tax_breakdown']);
  bool get isB2B => data['is_b2b'] == true;
  Map<String, dynamic>? get buyer => data['buyer'] is Map ? asMap(data['buyer']) : null;
  String? get zatcaStatus => toS(data['zatca_status']);
  String? get zatcaQr => toS(data['zatca_qr']);
  String? get phase1 => toS(data['phase1_qr']);
  String? get lastError => toS(data['last_error']);
  String? get customerName => toS(data['customer_name']);
  String? get cashier => toS(data['cashier_name']);
  String get orderType => toS(data['order_type']) ?? 'takeaway';
  double? get amountPaid => data['amount_paid'] == null ? null : toD(data['amount_paid']);
  double? get changeDue => data['change_due'] == null ? null : toD(data['change_due']);
  bool get pendingUpload => status != SaleStatus.synced;
  bool get cleared => (zatcaStatus ?? '').startsWith('cleared');

  /// هل الإيصال يحتاج تنبيه "لا تسلّمها قبل الاعتماد"؟ (فاتورة شركات بالمرحلة الثانية)
  bool b2bAwaitingClearance(bool zatcaActive) => isB2B && zatcaActive && !cleared;

  Map<String, dynamic> toJson() => data;

  Map<String, dynamic> submitPayload() => {
        'id': id,
        'order_number': data['order_number'],
        'branch_id': data['branch_id'],
        'status': 'completed',
        'order_type': orderType,
        'payment_method': paymentMethod,
        'items': [
          for (final it in items)
            {
              if (it['product_id'] != null) 'product_id': it['product_id'],
              'name': it['name'], 'quantity': it['quantity'], 'price': it['price'],
              'vat_category': it['vat_category'],
              if (it['vat_exemption_code'] != null) 'vat_exemption_code': it['vat_exemption_code'],
            }
        ],
        'discount_amount': discount,
        'discount_type': data['discount_type'],
        'customer_id': data['customer_id'],
        'customer_name': data['customer_name'],
        'customer_phone': data['customer_phone'],
        'cashier_name': cashier,
        'is_b2b': isB2B,
        'amount_paid': data['amount_paid'],
        'change_due': data['change_due'],
        'device_id': data['device_id'],
        'device_seq': data['device_seq'],
        'client_issued_at': data['issued_at'],
        'loyalty_stamps': data['loyalty_stamps'] ?? 0,
      };
}

/// سطر في السلة
class CartLine {
  CartLine({required this.productId, required this.name, required this.unit, this.qty = 1});
  final String? productId;
  final String name;
  final UnitPrice unit;
  int qty;
}

class CheckoutInput {
  CheckoutInput({
    required this.lines, required this.paymentMethod, this.discount = 0, this.discountType,
    this.customer, this.b2b = false, this.amountPaid, this.orderType = 'takeaway', this.cashier, this.branchId,
  });
  final List<CartLine> lines;
  final String paymentMethod;
  final double discount;
  final String? discountType;
  final Customer? customer;
  final bool b2b;
  final double? amountPaid;
  final String orderType;
  final String? cashier;
  final String? branchId;
}

class SalesService extends ChangeNotifier {
  SalesService(this.api, this.store);
  final Api api;
  final LocalStore store;

  String? _tenant;
  final List<Sale> _sales = []; // الأحدث أولاً
  bool flushing = false;
  DateTime? lastFlush;
  String? lastFlushError;

  List<Sale> get sales => List.unmodifiable(_sales);
  List<Sale> get pending => _sales.where((s) => s.pendingUpload).toList();
  int get pendingCount => _sales.where((s) => s.pendingUpload).length;
  int get failedCount => _sales.where((s) => s.status == SaleStatus.failed).length;

  /// أقدم فاتورة لم تُرفع (للتنبيه قبل انتهاء مهلة الهيئة 24 ساعة)
  DateTime? get oldestPending {
    DateTime? t;
    for (final s in _sales) {
      if (s.pendingUpload && (t == null || s.issuedAt.isBefore(t))) t = s.issuedAt;
    }
    return t;
  }

  String get _file => 'sales_$_tenant';

  Future<void> load(String tenant) async {
    _tenant = tenant;
    _sales.clear();
    final l = await store.readList(_file);
    if (l != null) _sales.addAll(asList(l).map(Sale.fromJson));
    notifyListeners();
  }

  Future<void> _persist() {
    // نحتفظ بكل غير المرفوع + آخر 500 مرفوعة
    var synced = 0;
    final keep = <Sale>[];
    for (final s in _sales) {
      if (s.pendingUpload) {
        keep.add(s);
      } else if (synced < 500) {
        keep.add(s);
        synced++;
      }
    }
    _sales
      ..clear()
      ..addAll(keep);
    return store.write(_file, _sales.map((s) => s.toJson()).toList());
  }

  /// إنشاء البيع وحفظه في الجهاز (قبل الطباعة). يرمي خطأ لو الجهاز غير مسجل.
  Future<Sale> create({
    required CheckoutInput input,
    required ({int seq, String invoiceNo}) number,
    required String deviceId,
    required Seller seller,
  }) async {
    final priced = [for (final l in input.lines) PriceLine(qty: l.qty, unit: l.unit)];
    final t = docTotals(priced, discount: input.discount);
    final now = DateTime.now().toUtc();
    final items = <Map<String, dynamic>>[];
    for (final l in input.lines) {
      if (l.qty <= 0) continue;
      final rate = l.unit.rate;
      final unitNet = rdiv(l.unit.gross * 100, 100 + rate);
      final lineNet = unitNet * l.qty;
      items.add({
        if (l.productId != null) 'product_id': l.productId,
        'name': l.name,
        'quantity': l.qty,
        'price': fromHalala(l.unit.gross),
        'unit_net': fromHalala(unitNet),
        'line_net': fromHalala(lineNet),
        'line_vat': fromHalala(rdiv(lineNet * rate, 100)),
        'total': fromHalala(l.unit.gross * l.qty),
        'tax_rate': rate,
        'vat_category': l.unit.category,
        if (l.unit.exemptionCode != null) 'vat_exemption_code': l.unit.exemptionCode,
      });
    }
    final paid = input.amountPaid;
    final sale = Sale({
      'id': uuidV4(),
      'invoice_no': number.invoiceNo,
      'device_seq': number.seq,
      'device_id': deviceId,
      'order_number': number.invoiceNo,
      'issued_at': now.toIso8601String(),
      'status': SaleStatus.queued.name,
      'branch_id': input.branchId,
      'order_type': input.orderType,
      'payment_method': input.paymentMethod,
      'items': items,
      'lines_net': t.linesNet,
      'discount_amount': t.discount,
      'discount_net': t.discountNet,
      'discount_type': t.discount > 0 ? input.discountType : null,
      'subtotal': t.subtotal,
      'tax_amount': t.vat,
      'total': t.total,
      'rounding_amount': t.rounding,
      'tax_breakdown': [
        for (final g in t.breakdown)
          {'category': g.category, 'code': g.code, 'rate': g.rate, 'discount': g.discount, 'taxable': g.taxable, 'tax': g.tax}
      ],
      'is_b2b': input.b2b,
      'customer_id': ?input.customer?.id,
      if (input.customer != null) 'customer_name': input.b2b ? input.customer!.displayName : input.customer!.name,
      if (input.customer != null) 'customer_phone': input.customer!.phone,
      if (input.customer != null && !input.b2b) 'loyalty_stamps': 1,
      'cashier_name': input.cashier,
      'amount_paid': ?paid,
      if (paid != null) 'change_due': (paid - t.total) < 0 ? 0 : double.parse((paid - t.total).toStringAsFixed(2)),
      'phase1_qr': phase1Qr(sellerName: seller.name, vatNumber: seller.vatNumber, issuedAt: now, total: t.total, vat: t.vat),
      'zatca_status': 'queued',
      'attempts': 0,
    });
    _sales.insert(0, sale);
    await _persist();
    notifyListeners();
    return sale;
  }

  /// رفع بيع واحد (+ الفوترة الإلكترونية). يرجع true إذا انرفع.
  Future<bool> upload(Sale s, {bool issueEinvoice = true, Duration? einvoiceTimeout}) {
    if (!s.pendingUpload) return Future.value(true);
    // نفس الفاتورة ما ترتفع مرتين بنفس اللحظة (البيع + الرفع الدوري) ⇒ ننتظر الرفع الجاري
    final running = _inFlight[s.id];
    if (running != null) return running;
    final f = _upload(s, issueEinvoice: issueEinvoice, einvoiceTimeout: einvoiceTimeout).whenComplete(() => _inFlight.remove(s.id));
    _inFlight[s.id] = f;
    return f;
  }

  final Map<String, Future<bool>> _inFlight = {};

  Future<bool> _upload(Sale s, {required bool issueEinvoice, Duration? einvoiceTimeout}) async {
    s.data['attempts'] = toI(s.data['attempts']) + 1;
    try {
      final r = asMap(await api.rpc('app_submit_sale', {'p': s.submitPayload()}, const Duration(seconds: 25)));
      final o = asMap(r['order']);
      final localTotal = s.total;
      s.data
        ..['status'] = SaleStatus.synced.name
        ..['server_invoice_no'] = toS(o['invoice_no'])
        ..['synced_at'] = DateTime.now().toUtc().toIso8601String()
        ..['zatca_status'] = toS(o['zatca_status']) ?? 'pending'
        ..['last_error'] = null;
      // القيم الرسمية من السيرفر (مطابقة لحساب الجهاز — نتحقق)
      for (final k in ['subtotal', 'tax_amount', 'total', 'rounding_amount', 'discount_amount', 'discount_net', 'lines_net']) {
        if (o[k] != null) s.data[k] = toD(o[k]);
      }
      if (o['tax_breakdown'] is List) s.data['tax_breakdown'] = o['tax_breakdown'];
      if (o['buyer'] is Map) s.data['buyer'] = o['buyer'];
      if ((localTotal - s.total).abs() > 0.009) s.data['total_mismatch'] = localTotal;
      if (o['zatca_qr'] != null) s.data['zatca_qr'] = o['zatca_qr'];
      await _persist();
      notifyListeners();
      if (issueEinvoice) await issue(s, timeout: einvoiceTimeout ?? (s.isB2B ? const Duration(seconds: 25) : const Duration(seconds: 6)));
      return true;
    } on ApiException catch (e) {
      if (e.isNetwork || e.status == 401 || e.status == 408 || e.status == 429 || e.status >= 500) {
        s.data['last_error'] = friendlyError(e);
        await _persist();
        notifyListeners();
        return false;
      }
      // رفض من السيرفر (جهاز موقوف، رقم مكرر…) ⇒ يحتاج تدخل
      s.data['status'] = SaleStatus.failed.name;
      s.data['last_error'] = friendlyError(e);
      await _persist();
      notifyListeners();
      return false;
    } catch (e) {
      s.data['last_error'] = friendlyError(e);
      await _persist();
      notifyListeners();
      return false;
    }
  }

  /// توقيع وإرسال للهيئة (السيرفر يعيد المحاولة تلقائياً لو فشل هنا)
  Future<void> issue(Sale s, {Duration timeout = const Duration(seconds: 6)}) async {
    if (s.status != SaleStatus.synced) return;
    try {
      final r = asMap(await api.fn('zatca-einvoice', {'action': 'issue', 'kind': 'invoice', 'id': s.id}, timeout: timeout));
      final st = toS(r['status']);
      if (st != null) s.data['zatca_status'] = st == 'not_onboarded' ? 'pending' : st;
      if (st == 'not_onboarded') s.data['zatca_phase1_only'] = true;
      if (r['qr'] != null) s.data['zatca_qr'] = r['qr'];
      await _persist();
      notifyListeners();
    } catch (_) {
      // بطيء أو منقطع ⇒ السيرفر يرسلها خلال دقائق
    }
  }

  /// رفع كل المعلّق بالترتيب (يوقف عند أول انقطاع)
  Future<void> flush() async {
    if (flushing || _tenant == null) return;
    final queue = _sales.where((s) => s.status == SaleStatus.queued).toList().reversed.toList(); // الأقدم أولاً
    if (queue.isEmpty) return;
    flushing = true;
    notifyListeners();
    try {
      for (final s in queue) {
        final ok = await upload(s, einvoiceTimeout: Duration(seconds: s.isB2B ? 25 : 8));
        if (!ok && s.status == SaleStatus.queued) {
          lastFlushError = s.lastError;
          break;
        }
      }
      lastFlush = DateTime.now();
    } finally {
      flushing = false;
      notifyListeners();
    }
  }

  /// إعادة محاولة بيع فشل (بعد ما يتصلح السبب)
  Future<bool> retryFailed(Sale s) async {
    s.data['status'] = SaleStatus.queued.name;
    return upload(s);
  }

  /// تحديث حالة الهيئة لفواتير الجهاز المرفوعة (من السيرفر)
  Future<void> refreshZatcaStatuses() async {
    final ids = _sales
        .where((s) => s.status == SaleStatus.synced && !['reported', 'cleared', 'reported_warnings', 'cleared_warnings'].contains(s.zatcaStatus))
        .take(50)
        .map((s) => s.id)
        .toList();
    if (ids.isEmpty) return;
    try {
      final rows = await api.select('orders', columns: 'id,zatca_status,zatca_qr', filters: {'id': 'in.(${ids.join(',')})'});
      var changed = false;
      for (final r in rows) {
        final i = _sales.indexWhere((s) => s.id == '${r['id']}');
        if (i < 0) continue;
        _sales[i].data['zatca_status'] = toS(r['zatca_status']) ?? _sales[i].zatcaStatus;
        if (r['zatca_qr'] != null) _sales[i].data['zatca_qr'] = r['zatca_qr'];
        changed = true;
      }
      if (changed) {
        await _persist();
        notifyListeners();
      }
    } catch (_) {}
  }

  /// مبيعات اليوم من الجهاز (للوحة بدون إنترنت)
  ({double total, int count, double vat}) todayLocal() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 3));
    var total = 0.0, vat = 0.0, count = 0;
    for (final s in _sales) {
      final k = s.issuedAt.toUtc().add(const Duration(hours: 3));
      if (k.year == now.year && k.month == now.month && k.day == now.day) {
        total += s.total;
        vat += s.vat;
        count++;
      }
    }
    return (total: total, count: count, vat: vat);
  }

  /// كم ساعة مرّت على أقدم فاتورة غير مرفوعة
  Duration? get oldestPendingAge => oldestPending == null ? null : DateTime.now().difference(oldestPending!);
  bool get nearZatcaDeadline => (oldestPendingAge ?? Duration.zero) > AppConfig.zatcaWindow - const Duration(hours: 4);
}
