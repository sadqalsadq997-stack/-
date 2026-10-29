// ══════════════════════════════════════════════════════════════════
// الفواتير
//  • فواتير الجهاز: تشتغل بدون إنترنت (المعلّقة بالأعلى + حالة الرفع والهيئة)
//  • كل الفواتير: من السيرفر (كل الأجهزة والموقع) مع البحث
//  • التفاصيل: إعادة طباعة، إعادة إرسال للهيئة، مرتجع (إشعار دائن)
// ══════════════════════════════════════════════════════════════════

import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../printing/receipt.dart';
import '../../services/sales.dart';
import '../../ui/widgets.dart';
import '../pos/receipt_preview.dart';
import '../shell/home_shell.dart';

const _orderColumns =
    'id,invoice_no,order_number,created_at,invoiced_at,total,subtotal,tax_amount,rounding_amount,discount_amount,discount_net,lines_net,'
    'tax_breakdown,payment_method,status,zatca_status,zatca_qr,is_b2b,buyer,customer_name,cashier_name,order_type,items,amount_paid,change_due,source';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: SectionAppBar(
        title: 'الفواتير',
        bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'فواتير هذا الجهاز'), Tab(text: 'كل الفواتير')]),
      ),
      body: TabBarView(controller: _tabs, children: const [_DeviceSales(), _ServerOrders()]),
    );
  }
}

class _DeviceSales extends StatelessWidget {
  const _DeviceSales();
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.sales, app.connectivity]),
      builder: (context, _) {
        final list = app.sales.sales;
        if (list.isEmpty) return const EmptyState(icon: Icons.receipt_long_outlined, title: 'ما فيه فواتير من هذا الجهاز بعد');
        final pending = app.sales.pendingCount;
        return RefreshIndicator(
          onRefresh: () async {
            await app.sales.flush();
            await app.sales.refreshZatcaStatuses();
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
            children: [
              if (pending > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: FCard(
                    color: Brand.warning.withValues(alpha: 0.07),
                    borderColor: Brand.warning.withValues(alpha: 0.4),
                    child: Row(children: [
                      const Icon(Icons.cloud_upload_rounded, color: Brand.warning),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '$pending فاتورة بانتظار الرفع${app.sales.oldestPendingAge != null ? ' — أقدمها ${ago(app.sales.oldestPending!)}' : ''}\nمهلة الهيئة 24 ساعة من وقت البيع.',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      FilledButton(
                        onPressed: app.sales.flushing || !app.connectivity.online ? null : () => app.sales.flush(),
                        child: Text(app.sales.flushing ? 'جاري…' : 'ارفع الآن'),
                      ),
                    ]),
                  ),
                ),
              for (final s in list) _SaleTile(sale: s),
            ],
          ),
        );
      },
    );
  }
}

class _SaleTile extends StatelessWidget {
  const _SaleTile({required this.sale});
  final Sale sale;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final status = sale.status == SaleStatus.synced ? sale.zatcaStatus : (sale.status == SaleStatus.failed ? 'failed' : 'queued');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: FCard(
        padding: const EdgeInsets.all(12),
        onTap: () => showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => _SaleDetail(sale: sale)),
        child: Row(children: [
          CircleAvatar(
            backgroundColor: zatcaColor(status).withValues(alpha: 0.12),
            child: Icon(sale.isB2B ? Icons.domain_rounded : Icons.receipt_rounded, color: zatcaColor(status)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(sale.invoiceNo, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w900)),
              Text('${dateTimeKsa(sale.issuedAt)} • ${payLabels[sale.paymentMethod] ?? sale.paymentMethod}', style: TextStyle(color: s.onSurfaceVariant, fontSize: 12)),
              const SizedBox(height: 4),
              ZatcaChip(status),
            ]),
          ),
          Text('${money(sale.total)} $riyal', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        ]),
      ),
    );
  }
}

class _SaleDetail extends StatelessWidget {
  const _SaleDetail({required this.sale});
  final Sale sale;
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.sales,
      builder: (context, _) {
        final status = sale.status == SaleStatus.synced ? sale.zatcaStatus : (sale.status == SaleStatus.failed ? 'failed' : 'queued');
        final b2bPending = sale.b2bAwaitingClearance(app.catalog.zatcaActive);
        return _DetailScaffold(
          number: sale.invoiceNo,
          when: sale.issuedAt,
          status: status,
          items: sale.items,
          totals: (subtotal: sale.subtotal, vat: sale.vat, total: sale.total, discount: sale.discount),
          payment: sale.paymentMethod,
          extra: [
            if (sale.lastError != null && sale.pendingUpload)
              Text(sale.lastError!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700)),
            if (sale.data['total_mismatch'] != null)
              Text('تنبيه: الإجمالي بالسيرفر ${money(sale.total)} يختلف عن المطبوع ${money(toD(sale.data['total_mismatch']))} — أعد طباعة الفاتورة',
                  style: const TextStyle(color: Brand.warning, fontWeight: FontWeight.w700)),
          ],
          actions: [
            if (sale.status == SaleStatus.failed)
              FilledButton.icon(
                onPressed: () async {
                  final ok = await app.sales.retryFailed(sale);
                  if (context.mounted) showSnack(context, ok ? 'تم الرفع' : (sale.lastError ?? 'تعذر'), error: !ok);
                },
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('إعادة المحاولة'),
              ),
            if (sale.status == SaleStatus.synced && !['reported', 'cleared', 'reported_warnings', 'cleared_warnings'].contains(sale.zatcaStatus))
              OutlinedButton.icon(
                onPressed: () async {
                  await app.sales.issue(sale, timeout: const Duration(seconds: 25));
                  if (context.mounted) showSnack(context, zatcaStatusLabels[sale.zatcaStatus] ?? 'تم');
                },
                icon: const Icon(Icons.send_rounded),
                label: const Text('إعادة الإرسال للهيئة'),
              ),
            if (!b2bPending)
              FilledButton.icon(
                onPressed: () => showReceiptPreview(context, ReceiptDoc.fromSale(sale)),
                icon: const Icon(Icons.print_rounded),
                label: const Text('طباعة / مشاركة'),
              ),
            if (sale.status == SaleStatus.synced)
              OutlinedButton.icon(
                onPressed: () => _openReturn(context, sale.id),
                icon: const Icon(Icons.undo_rounded),
                label: const Text('مرتجع'),
              ),
          ],
        );
      },
    );
  }
}

typedef _Totals = ({double subtotal, double vat, double total, double discount});

class _DetailScaffold extends StatelessWidget {
  const _DetailScaffold({required this.number, required this.when, required this.status, required this.items, required this.totals,
      required this.payment, required this.actions, this.extra = const [], this.buyer});
  final String number;
  final DateTime when;
  final String? status;
  final List<Map<String, dynamic>> items;
  final _Totals totals;
  final String? payment;
  final List<Widget> actions;
  final List<Widget> extra;
  final Map<String, dynamic>? buyer;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, sc) => ListView(
        controller: sc,
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        children: [
          Row(children: [
            Expanded(child: Text(number, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
            ZatcaChip(status),
          ]),
          Text('${dateTimeKsa(when)}${payment != null ? ' • ${payLabels[payment] ?? payment}' : ''}', style: TextStyle(color: s.onSurfaceVariant)),
          if (buyer != null) ...[
            const SizedBox(height: 6),
            Text('المشتري: ${toS(buyer!['name']) ?? ''} — ${toS(buyer!['vat_number']) ?? toS(buyer!['cr_number']) ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: 12),
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(child: Text('${toS(it['name']) ?? ''} × ${qty(toD(it['quantity'] ?? it['qty']))}')),
                Text(money(it['total'] != null ? toD(it['total']) : toD(it['price']) * toD(it['quantity'] ?? 1))),
              ]),
            ),
          const Divider(height: 24),
          if (totals.discount > 0) _row('الخصم', '− ${money(totals.discount)}'),
          _row('قبل الضريبة', money(totals.subtotal)),
          _row('الضريبة', money(totals.vat)),
          _row('الإجمالي', '${money(totals.total)} $riyal', bold: true),
          ...extra.map((w) => Padding(padding: const EdgeInsets.only(top: 8), child: w)),
          const SizedBox(height: 16),
          Wrap(spacing: 8, runSpacing: 8, children: actions),
        ],
      ),
    );
  }

  Widget _row(String l, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w400, fontSize: bold ? 17 : 14))),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w700, fontSize: bold ? 17 : 14)),
        ]),
      );
}

// ── كل الفواتير (السيرفر) ───────────────────────────────────────────
class _ServerOrders extends StatefulWidget {
  const _ServerOrders();
  @override
  State<_ServerOrders> createState() => _ServerOrdersState();
}

class _ServerOrdersState extends State<_ServerOrders> {
  final _q = TextEditingController();
  Timer? _deb;
  int _gen = 0;

  @override
  void dispose() {
    _q.dispose();
    _deb?.cancel();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _load() {
    final app = Services.read(context);
    // رموز PostgREST الخاصة تُحذف من البحث
    final q = _q.text.trim().replaceAll(RegExp(r'[,()*:%\\]'), ' ').trim();
    return app.api.select('orders', columns: _orderColumns, order: 'created_at.desc', limit: 100, filters: {
      'invoice_seq': 'not.is.null',
      if (q.isNotEmpty) 'or': '(invoice_no.ilike.*$q*,customer_name.ilike.*$q*,order_number.ilike.*$q*)',
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        child: TextField(
          controller: _q,
          onChanged: (_) {
            _deb?.cancel();
            _deb = Timer(const Duration(milliseconds: 450), () => setState(() => _gen++));
          },
          decoration: const InputDecoration(hintText: 'ابحث برقم الفاتورة أو اسم العميل', prefixIcon: Icon(Icons.search_rounded), isDense: true),
        ),
      ),
      Expanded(
        child: AsyncView<List<Map<String, dynamic>>>(
          key: ValueKey(_gen),
          load: _load,
          builder: (context, rows, reload) => rows.isEmpty
              ? ListView(children: const [SizedBox(height: 80), EmptyState(icon: Icons.receipt_long_outlined, title: 'لا توجد فواتير')])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 24),
                  itemCount: rows.length,
                  itemBuilder: (_, i) => _OrderTile(order: rows[i], onChanged: reload),
                ),
        ),
      ),
    ]);
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order, required this.onChanged});
  final Map<String, dynamic> order;
  final Future<void> Function() onChanged;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final when = DateTime.tryParse('${order['invoiced_at'] ?? order['created_at']}') ?? DateTime.now();
    final status = toS(order['zatca_status']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: FCard(
        padding: const EdgeInsets.all(12),
        onTap: () => showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => _OrderDetail(order: order, onChanged: onChanged)),
        child: Row(children: [
          CircleAvatar(
            backgroundColor: zatcaColor(status).withValues(alpha: 0.12),
            child: Icon(order['is_b2b'] == true ? Icons.domain_rounded : Icons.receipt_rounded, color: zatcaColor(status)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(toS(order['invoice_no']) ?? toS(order['order_number']) ?? '', textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w900)),
              Text('${dateTimeKsa(when)}${toS(order['customer_name']) != null ? ' • ${order['customer_name']}' : ''}',
                  style: TextStyle(color: s.onSurfaceVariant, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              ZatcaChip(status),
            ]),
          ),
          Text('${money(toD(order['total']))} $riyal', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        ]),
      ),
    );
  }
}

class _OrderDetail extends StatefulWidget {
  const _OrderDetail({required this.order, required this.onChanged});
  final Map<String, dynamic> order;
  final Future<void> Function() onChanged;
  @override
  State<_OrderDetail> createState() => _OrderDetailState();
}

class _OrderDetailState extends State<_OrderDetail> {
  late Map<String, dynamic> _o = widget.order;
  bool _busy = false;

  Future<void> _resend() async {
    final app = Services.read(context);
    setState(() => _busy = true);
    try {
      final r = asMap(await app.api.fn('zatca-einvoice', {'action': 'issue', 'kind': 'invoice', 'id': _o['id']}));
      final rows = await app.api.select('orders', columns: _orderColumns, filters: {'id': 'eq.${_o['id']}'});
      if (rows.isNotEmpty) _o = rows.first;
      if (mounted) showSnack(context, zatcaStatusLabels[toS(r['status'])] ?? toS(r['status']) ?? 'تم');
      unawaited(widget.onChanged());
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final status = toS(_o['zatca_status']);
    final isB2B = _o['is_b2b'] == true;
    final b2bPending = isB2B && app.catalog.zatcaActive && !(status ?? '').startsWith('cleared');
    final canReturn = app.session.operator?.can('/orders') ?? false;
    return _DetailScaffold(
      number: toS(_o['invoice_no']) ?? '',
      when: DateTime.tryParse('${_o['invoiced_at'] ?? _o['created_at']}') ?? DateTime.now(),
      status: status,
      items: asList(_o['items']),
      totals: (subtotal: toD(_o['subtotal']), vat: toD(_o['tax_amount']), total: toD(_o['total']), discount: toD(_o['discount_amount'])),
      payment: toS(_o['payment_method']),
      buyer: _o['buyer'] is Map ? asMap(_o['buyer']) : null,
      actions: [
        if (!['reported', 'cleared', 'reported_warnings', 'cleared_warnings'].contains(status))
          OutlinedButton.icon(onPressed: _busy ? null : _resend, icon: const Icon(Icons.send_rounded), label: Text(_busy ? 'جاري…' : 'إعادة الإرسال للهيئة')),
        if (!b2bPending)
          FilledButton.icon(
            onPressed: () => showReceiptPreview(context, ReceiptDoc.fromOrder(_o)),
            icon: const Icon(Icons.print_rounded),
            label: const Text('طباعة / مشاركة'),
          ),
        if (canReturn)
          OutlinedButton.icon(
            onPressed: () async {
              final done = await _openReturn(context, '${_o['id']}', order: _o);
              if (done) unawaited(widget.onChanged());
            },
            icon: const Icon(Icons.undo_rounded),
            label: const Text('مرتجع'),
          ),
      ],
      extra: [
        if (b2bPending) const Text('فاتورة شركة بانتظار اعتماد الهيئة — لا تُسلَّم قبل الاعتماد', style: TextStyle(color: Brand.warning, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

// ── المرتجع (إشعار دائن) ────────────────────────────────────────────
Future<bool> _openReturn(BuildContext context, String orderId, {Map<String, dynamic>? order}) async {
  final app = Services.read(context);
  if (!app.connectivity.online) {
    showSnack(context, 'المرتجع يحتاج إنترنت (يُصدر إشعار دائن ويُرسل للهيئة)', error: true);
    return false;
  }
  var o = order;
  if (o == null) {
    try {
      final rows = await app.api.select('orders', columns: _orderColumns, filters: {'id': 'eq.$orderId'});
      if (rows.isEmpty) throw ApiException(404, 'الفاتورة غير موجودة بالسيرفر بعد — ارفعها أولاً');
      o = rows.first;
    } catch (e) {
      if (context.mounted) showSnack(context, friendlyError(e), error: true);
      return false;
    }
  }
  if (!context.mounted) return false;
  final r = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => _ReturnSheet(order: o!));
  return r ?? false;
}

class _ReturnSheet extends StatefulWidget {
  const _ReturnSheet({required this.order});
  final Map<String, dynamic> order;
  @override
  State<_ReturnSheet> createState() => _ReturnSheetState();
}

class _ReturnSheetState extends State<_ReturnSheet> {
  final Map<String, int> _qty = {};
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final app = Services.read(context);
    final items = _qty.entries.where((e) => e.value > 0).map((e) => {'product_id': e.key, 'quantity': e.value}).toList();
    if (items.isEmpty) {
      showSnack(context, 'اختر الأصناف المرتجعة', error: true);
      return;
    }
    if (_reason.text.trim().isEmpty) {
      showSnack(context, 'سبب الإرجاع مطلوب (تشترطه الهيئة)', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final r = asMap(await app.api.rpc('create_return', {'p_order': widget.order['id'], 'p_items': items, 'p_reason': _reason.text.trim()}));
      final isB2B = r['is_b2b'] == true;
      Map<String, dynamic> ez = const {};
      try {
        ez = asMap(await app.api.fn('zatca-einvoice', {'action': 'issue', 'kind': 'credit', 'id': r['credit_note_id']},
            timeout: Duration(seconds: isB2B ? 25 : 8)));
      } catch (_) {}
      final st = toS(ez['status']);
      final doc = ReceiptDoc(
        kind: ReceiptKind.creditNote,
        number: toS(r['number']) ?? '',
        issuedAt: DateTime.now(),
        items: [
          for (final it in asList(r['items']))
            ReceiptItem(name: toS(it['name']) ?? '', qty: toD(it['quantity']), unitPrice: toD(it['price']), total: toD(it['total']), category: toS(it['vat_category']) ?? 'S'),
        ],
        subtotal: toD(r['subtotal']), vat: toD(r['vat']), total: toD(r['total']), rounding: toD(r['rounding']),
        discount: toD(r['discount']), discountNet: toD(r['discount_net']), linesNet: r['lines_net'] == null ? null : toD(r['lines_net']),
        breakdown: asList(r['breakdown']), buyer: r['buyer'] is Map ? asMap(r['buyer']) : null,
        originalNumber: toS(r['original']), reason: _reason.text.trim(), qr: toS(ez['qr']), phase2: ez['qr'] != null,
      );
      if (!mounted) return;
      Navigator.pop(context, true);
      final pending = isB2B && app.catalog.zatcaActive && !(st ?? '').startsWith('cleared');
      showSnack(context, pending ? 'تم المرتجع ${doc.number} — بانتظار اعتماد الهيئة قبل الطباعة' : 'تم المرتجع ${doc.number} • ${money(doc.total)} $riyal');
      if (!pending && app.printer.settings.autoPrint) {
        final err = await app.printer.printReceipt(doc, app.catalog.seller);
        if (err != null && mounted) showSnack(context, err, error: true);
      }
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = asList(widget.order['items']).where((i) => i['product_id'] != null).toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('مرتجع من ${widget.order['invoice_no']}', style: Theme.of(context).textTheme.titleLarge),
        const Text('يصدر إشعار دائن مرتبط بالفاتورة ويُرسل للهيئة، والمخزون يرجع تلقائياً.', style: TextStyle(fontSize: 13)),
        const SizedBox(height: 12),
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.4),
          child: ListView(shrinkWrap: true, children: [
            for (final it in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  Expanded(child: Text('${it['name']} (مباع ${qty(toD(it['quantity']))})')),
                  IconButton(
                    onPressed: () => setState(() => _qty['${it['product_id']}'] = ((_qty['${it['product_id']}'] ?? 0) - 1).clamp(0, toD(it['quantity']).toInt())),
                    icon: const Icon(Icons.remove_circle_outline_rounded),
                  ),
                  Text('${_qty['${it['product_id']}'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                  IconButton(
                    onPressed: () => setState(() => _qty['${it['product_id']}'] = ((_qty['${it['product_id']}'] ?? 0) + 1).clamp(0, toD(it['quantity']).toInt())),
                    icon: const Icon(Icons.add_circle_outline_rounded),
                  ),
                ]),
              ),
            if (items.isEmpty) const Text('أصناف هذي الفاتورة بدون رمز منتج — المرتجع من الموقع'),
          ]),
        ),
        const SizedBox(height: 8),
        TextField(controller: _reason, decoration: const InputDecoration(labelText: 'سبب الإرجاع (مطلوب)')),
        const SizedBox(height: 14),
        BusyButton(label: 'إصدار الإشعار الدائن', icon: Icons.undo_rounded, busy: _busy, onPressed: _submit),
      ]),
    );
  }
}

/// زر سريع للانتقال لنقطة البيع
class GoToPos extends StatelessWidget {
  const GoToPos({super.key});
  @override
  Widget build(BuildContext context) => FilledButton.icon(
        onPressed: () => ShellNav.go(context, 'pos'),
        icon: const Icon(Icons.point_of_sale_rounded),
        label: const Text('نقطة البيع'),
      );
}
