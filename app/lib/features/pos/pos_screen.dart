// ══════════════════════════════════════════════════════════════════
// نقطة البيع
//  • يشتغل بدون إنترنت (المنتجات من الجهاز + رقم فاتورة من سلسلة الجهاز)
//  • قارئ الباركود (USB/بلوتوث): المسح يضيف المنتج فوراً
//  • خصم على الفاتورة، عميل ولاء بالجوال، فاتورة شركة (B2B)
//  • الدفع ⇒ حفظ بالجهاز ⇒ رفع + فوترة إلكترونية ⇒ طباعة
// ══════════════════════════════════════════════════════════════════

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/pricing.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../printing/receipt.dart';
import '../../services/catalog.dart';
import '../../services/sales.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';
import 'receipt_preview.dart';

const _payMethods = [
  ('cash', 'نقداً', Icons.payments_rounded),
  ('mada', 'مدى', Icons.credit_card_rounded),
  ('card', 'بطاقة', Icons.credit_card_rounded),
  ('stcpay', 'STC Pay', Icons.qr_code_2_rounded),
];

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});
  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final List<CartLine> _cart = [];
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  String _category = 'all';
  String _pay = 'cash';
  ({String type, double value}) _discount = (type: 'amount', value: 0);
  Customer? _loyalty;
  Customer? _b2b;
  bool _busy = false;
  String? _flash;

  // قارئ الباركود: أحرف متتالية بسرعة + Enter
  final StringBuffer _scanBuf = StringBuffer();
  DateTime _scanLast = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onHardwareKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onHardwareKey);
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  bool get _visible => mounted && ShellNav.currentOf(context) == 'pos';

  bool _onHardwareKey(KeyEvent e) {
    if (!_visible || e is! KeyDownEvent) return false;
    // لو المستخدم يكتب في حقل نصي (غير البحث) نخليه
    final focused = FocusManager.instance.primaryFocus;
    if (focused != null && focused != _searchFocus && focused.context?.widget is EditableText) return false;
    final now = DateTime.now();
    if (now.difference(_scanLast) > const Duration(milliseconds: 120)) _scanBuf.clear();
    _scanLast = now;
    if (e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) {
      final code = _scanBuf.toString();
      _scanBuf.clear();
      if (code.length >= 4 && focused != _searchFocus) {
        _scan(code);
        return true;
      }
      return false;
    }
    final ch = e.character;
    if (ch != null && ch.length == 1 && RegExp(r'[0-9A-Za-z\-]').hasMatch(ch)) _scanBuf.write(ch);
    return false;
  }

  void _scan(String raw) {
    final app = Services.read(context);
    final p = app.catalog.byBarcode(raw);
    if (p == null) {
      SystemSound.play(SystemSoundType.alert);
      showSnack(context, 'باركود غير مسجّل: $raw', error: true);
      return;
    }
    _add(p);
  }

  void _add(Product p, [int n = 1]) {
    HapticFeedback.selectionClick();
    setState(() {
      final i = _cart.indexWhere((l) => l.productId == p.id);
      if (i >= 0) {
        _cart[i].qty += n;
      } else {
        _cart.add(CartLine(productId: p.id, name: p.name, unit: p.unit, qty: n));
      }
      _flash = p.id;
    });
    Future.delayed(const Duration(milliseconds: 380), () {
      if (mounted && _flash == p.id) setState(() => _flash = null);
    });
  }

  void _setQty(CartLine l, int q) => setState(() {
        if (q <= 0) {
          _cart.remove(l);
        } else {
          l.qty = q;
        }
      });

  double get _gross => _cart.fold<int>(0, (s, l) => s + l.unit.gross * l.qty) / 100;

  double get _discountAmount {
    if (_discount.value <= 0) return 0;
    final d = _discount.type == 'percent' ? percentDiscount(_gross, _discount.value) : (_discount.value * 100).round() / 100;
    return d < _gross ? d : 0;
  }

  DocTotals get _totals => docTotals([for (final l in _cart) PriceLine(qty: l.qty, unit: l.unit)], discount: _discountAmount);

  void _onSearchSubmit(String v) {
    final app = Services.read(context);
    final code = v.trim();
    if (code.isEmpty) return;
    final exact = app.catalog.byBarcode(code);
    if (exact != null) {
      _add(exact);
      _search.clear();
      setState(() {});
      return;
    }
    final list = _filtered(app.catalog);
    if (list.length == 1) {
      _add(list.first);
      _search.clear();
      setState(() {});
    }
  }

  List<Product> _filtered(CatalogService c) {
    final q = _search.text.trim().toLowerCase();
    return c.products.where((p) {
      if (_category != 'all' && p.categoryId != _category) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) || (p.nameEn ?? '').toLowerCase().contains(q) || (p.barcode ?? '').contains(q) || (p.sku ?? '').toLowerCase().contains(q);
    }).toList();
  }

  // ── الدفع ──────────────────────────────────────────────────────────
  Future<void> _checkout() async {
    final app = Services.read(context);
    if (_cart.isEmpty || _busy) return;
    if (_discount.value > 0 && _discountAmount == 0) {
      showSnack(context, 'الخصم لازم يكون أقل من إجمالي الفاتورة', error: true);
      return;
    }
    if (_b2b != null && !app.connectivity.online) {
      showSnack(context, 'فاتورة الشركة تحتاج إنترنت (تُعتمد من الهيئة لحظياً)', error: true);
      return;
    }
    if (!app.device.registered) {
      showSnack(context, 'أول تشغيل للجهاز يحتاج إنترنت لتسجيله — اتصل ثم اضغط مزامنة', error: true);
      unawaited(app.syncNow(register: true));
      return;
    }
    final totals = _totals;
    double? paid;
    if (_pay == 'cash') {
      paid = await showModalBottomSheet<double>(context: context, isScrollControlled: true, builder: (_) => _CashSheet(total: totals.total));
      if (paid == null || !mounted) return;
    }
    setState(() => _busy = true);
    Sale? sale;
    try {
      final number = await app.device.takeSeq();
      sale = await app.sales.create(
        input: CheckoutInput(
          lines: List.of(_cart), paymentMethod: _pay, discount: _discountAmount, discountType: _discount.type,
          customer: _b2b ?? _loyalty, b2b: _b2b != null, amountPaid: paid, cashier: app.session.operator?.displayName, branchId: app.branchId,
        ),
        number: number,
        deviceId: app.device.id!,
        seller: app.catalog.seller,
      );
      app.catalog.applyLocalSale([for (final l in _cart) if (l.productId != null) (productId: l.productId!, qty: l.qty)]);
      setState(() {
        _cart.clear();
        _discount = (type: 'amount', value: 0);
        _loyalty = null;
        _b2b = null;
      });
      if (app.connectivity.online) {
        await app.sales.upload(sale, einvoiceTimeout: sale.isB2B ? const Duration(seconds: 25) : const Duration(seconds: 6));
      }
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (sale == null || !mounted) return;

    // الطباعة
    final b2bPending = sale.b2bAwaitingClearance(app.catalog.zatcaActive);
    if (app.printer.settings.autoPrint && !b2bPending) {
      final err = await app.printer.printReceipt(ReceiptDoc.fromSale(sale), app.catalog.seller);
      if (err != null && mounted) showSnack(context, err, error: true);
    }
    if (!mounted) return;
    await showDialog<void>(context: context, builder: (_) => SaleDoneDialog(sale: sale!));
    if (mounted && isWide(context)) _searchFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.catalog,
      builder: (context, _) {
        final wide = MediaQuery.sizeOf(context).width >= 900;
        final products = _ProductsArea(
          products: _filtered(app.catalog),
          categories: app.catalog.categories,
          category: _category,
          onCategory: (c) => setState(() => _category = c),
          search: _search,
          searchFocus: _searchFocus,
          onSearch: () => setState(() {}),
          onSubmit: _onSearchSubmit,
          onAdd: _add,
          inCart: {for (final l in _cart) if (l.productId != null) l.productId!: l.qty},
          flash: _flash,
          empty: app.catalog.products.isEmpty,
          syncing: app.catalog.syncing,
        );
        final cart = _CartPanel(
          lines: _cart, totals: _totals, onQty: _setQty, onClear: () => setState(_cart.clear),
          pay: _pay, onPay: (p) => setState(() => _pay = p),
          discount: _discount, onDiscount: (d) => setState(() => _discount = d), gross: _gross,
          loyalty: _loyalty, onLoyalty: (c) => setState(() => _loyalty = c),
          b2b: _b2b, onB2b: (c) => setState(() {
            _b2b = c;
            if (c != null) _loyalty = null;
          }),
          busy: _busy, onCheckout: _checkout,
        );
        if (wide) {
          return Scaffold(
            appBar: const SectionAppBar(title: 'نقطة البيع'),
            body: Row(children: [
              Expanded(child: products),
              SizedBox(width: 380, child: Padding(padding: const EdgeInsetsDirectional.only(end: 12, bottom: 12, start: 4), child: cart)),
            ]),
          );
        }
        final count = _cart.fold<int>(0, (s, l) => s + l.qty);
        return Scaffold(
          appBar: const SectionAppBar(title: 'نقطة البيع'),
          body: products,
          bottomNavigationBar: _cart.isEmpty
              ? null
              : SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
                    child: FilledButton(
                      onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (c) => StatefulBuilder(
                          builder: (c, setSheet) => SizedBox(
                            height: MediaQuery.sizeOf(c).height * 0.88,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                              child: _CartPanel(
                                lines: _cart, totals: _totals, gross: _gross,
                                onQty: (l, q) { _setQty(l, q); setSheet(() {}); },
                                onClear: () { setState(_cart.clear); Navigator.pop(c); },
                                pay: _pay, onPay: (p) { setState(() => _pay = p); setSheet(() {}); },
                                discount: _discount, onDiscount: (d) { setState(() => _discount = d); setSheet(() {}); },
                                loyalty: _loyalty, onLoyalty: (x) { setState(() => _loyalty = x); setSheet(() {}); },
                                b2b: _b2b, onB2b: (x) { setState(() { _b2b = x; if (x != null) _loyalty = null; }); setSheet(() {}); },
                                busy: _busy,
                                onCheckout: () async {
                                  Navigator.pop(c);
                                  await _checkout();
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                      child: Row(children: [
                        Badge(label: Text('$count'), child: const Icon(Icons.shopping_cart_rounded)),
                        const SizedBox(width: 14),
                        const Text('السلة والدفع'),
                        const Spacer(),
                        Text('${money(_totals.total)} $riyal', style: const TextStyle(fontWeight: FontWeight.w900)),
                      ]),
                    ),
                  ),
                ),
        );
      },
    );
  }
}

// ── المنتجات ────────────────────────────────────────────────────────
class _ProductsArea extends StatelessWidget {
  const _ProductsArea({
    required this.products, required this.categories, required this.category, required this.onCategory,
    required this.search, required this.searchFocus, required this.onSearch, required this.onSubmit,
    required this.onAdd, required this.inCart, required this.flash, required this.empty, required this.syncing,
  });
  final List<Product> products;
  final List<ProductCategory> categories;
  final String category;
  final ValueChanged<String> onCategory;
  final TextEditingController search;
  final FocusNode searchFocus;
  final VoidCallback onSearch;
  final ValueChanged<String> onSubmit;
  final void Function(Product, [int]) onAdd;
  final Map<String, int> inCart;
  final String? flash;
  final bool empty;
  final bool syncing;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
        child: TextField(
          controller: search,
          focusNode: searchFocus,
          onChanged: (_) => onSearch(),
          onSubmitted: (v) {
            onSubmit(v);
            searchFocus.requestFocus();
          },
          decoration: InputDecoration(
            hintText: 'ابحث باسم المنتج أو امسح الباركود…',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: search.text.isEmpty
                ? Icon(Icons.qr_code_scanner_rounded, color: s.onSurfaceVariant)
                : IconButton(icon: const Icon(Icons.close_rounded), onPressed: () {
                    search.clear();
                    onSearch();
                  }),
          ),
        ),
      ),
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          children: [
            _CatChip(label: 'الكل', selected: category == 'all', onTap: () => onCategory('all')),
            for (final c in categories) _CatChip(label: c.name, selected: category == c.id, onTap: () => onCategory(c.id)),
          ],
        ),
      ),
      const SizedBox(height: 6),
      Expanded(
        child: empty
            ? EmptyState(
                icon: Icons.inventory_2_outlined,
                title: syncing ? 'جاري تحميل المنتجات…' : 'لا توجد منتجات',
                body: syncing ? null : 'أضف منتجاتك من قسم المنتجات أو من الموقع، ثم اضغط مزامنة',
              )
            : products.isEmpty
                ? const EmptyState(icon: Icons.search_off_rounded, title: 'ما فيه نتائج')
                : LayoutBuilder(
                    builder: (context, c) {
                      final cols = (c.maxWidth / 150).floor().clamp(2, 8);
                      return GridView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: cols, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.82),
                        itemCount: products.length,
                        itemBuilder: (_, i) => _ProductTile(product: products[i], qty: inCart[products[i].id] ?? 0, flash: flash == products[i].id, onAdd: onAdd),
                      );
                    },
                  ),
      ),
    ]);
  }
}

class _CatChip extends StatelessWidget {
  const _CatChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ChoiceChip(
          label: Text(label, style: TextStyle(color: selected ? Colors.white : null, fontWeight: FontWeight.w700)),
          selected: selected,
          onSelected: (_) => onTap(),
        ),
      );
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product, required this.qty, required this.flash, required this.onAdd});
  final Product product;
  final int qty;
  final bool flash;
  final void Function(Product, [int]) onAdd;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final p = product;
    final img = (p.imageUrl ?? '').startsWith('http') || (p.imageUrl ?? '').startsWith('/api/db');
    return AnimatedScale(
      scale: flash ? 0.95 : 1,
      duration: const Duration(milliseconds: 160),
      child: Material(
        color: qty > 0 ? s.primaryContainer.withValues(alpha: 0.6) : s.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: qty > 0 ? s.primary : s.outline, width: qty > 0 ? 1.5 : 1)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => onAdd(p),
          onLongPress: () async {
            final n = await _askQty(context, p.name);
            if (n != null && n > 0) onAdd(p, n);
          },
          child: Stack(children: [
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: img
                        ? Image.network(_imageUrl(p.imageUrl!), fit: BoxFit.cover, errorBuilder: (_, _, _) => _Initial(p.name),
                            cacheWidth: 300)
                        : _Initial(p.name),
                  ),
                ),
                const SizedBox(height: 8),
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, height: 1.25)),
                const SizedBox(height: 2),
                Row(children: [
                  Expanded(
                    child: Text('${money(p.unit.gross / 100)} $riyal', style: TextStyle(color: s.primary, fontWeight: FontWeight.w900)),
                  ),
                  if (p.trackInventory)
                    Text(qtyText(p.stock), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: p.outOfStock ? Brand.danger : p.lowStock ? Brand.warning : s.onSurfaceVariant)),
                ]),
              ]),
            ),
            if (qty > 0)
              PositionedDirectional(
                top: 6, start: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: s.primary, borderRadius: BorderRadius.circular(999)),
                  child: Text('$qty', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                ),
              ),
          ]),
        ),
      ),
    );
  }

  static String qtyText(double v) => v == v.roundToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1);
}

String _imageUrl(String u) => u.startsWith('/api/db') ? 'https://felsy.org$u' : u;

class _Initial extends StatelessWidget {
  const _Initial(this.name);
  final String name;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final ch = name.trim().isEmpty ? '؟' : name.trim().characters.first;
    return Container(
      color: s.surfaceContainer,
      alignment: Alignment.center,
      child: Text(ch, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: s.primary.withValues(alpha: 0.7))),
    );
  }
}

Future<int?> _askQty(BuildContext context, String name) async {
  final c = TextEditingController(text: '1');
  final r = await showDialog<int>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis),
      content: TextField(
        controller: c, autofocus: true, keyboardType: TextInputType.number, textDirection: TextDirection.ltr,
        decoration: const InputDecoration(labelText: 'الكمية'),
        onSubmitted: (v) => Navigator.pop(d, int.tryParse(v)),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.pop(d, int.tryParse(c.text)), child: const Text('إضافة')),
      ],
    ),
  );
  c.dispose();
  return r;
}

// ── السلة ───────────────────────────────────────────────────────────
class _CartPanel extends StatelessWidget {
  const _CartPanel({
    required this.lines, required this.totals, required this.onQty, required this.onClear, required this.pay, required this.onPay,
    required this.discount, required this.onDiscount, required this.gross, required this.loyalty, required this.onLoyalty,
    required this.b2b, required this.onB2b, required this.busy, required this.onCheckout,
  });
  final List<CartLine> lines;
  final DocTotals totals;
  final void Function(CartLine, int) onQty;
  final VoidCallback onClear;
  final String pay;
  final ValueChanged<String> onPay;
  final ({String type, double value}) discount;
  final ValueChanged<({String type, double value})> onDiscount;
  final double gross;
  final Customer? loyalty;
  final ValueChanged<Customer?> onLoyalty;
  final Customer? b2b;
  final ValueChanged<Customer?> onB2b;
  final bool busy;
  final Future<void> Function() onCheckout;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return FCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 6),
          child: Row(children: [
            Icon(Icons.shopping_cart_rounded, color: s.primary, size: 20),
            const SizedBox(width: 8),
            const Expanded(child: Text('الطلب الحالي', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
            if (lines.isNotEmpty) IconButton(tooltip: 'تفريغ', onPressed: onClear, icon: const Icon(Icons.delete_sweep_rounded)),
          ]),
        ),
        const Divider(),
        Expanded(
          child: lines.isEmpty
              ? const EmptyState(icon: Icons.qr_code_scanner_rounded, title: 'السلة فاضية', body: 'امسح باركود أو اضغط على منتج')
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  itemCount: lines.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) => _CartRow(line: lines[i], onQty: onQty),
                ),
        ),
        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
          child: Column(children: [
            if (totals.discount > 0) _sum('الخصم', '− ${money(totals.discount)}', color: Brand.success),
            _sum('قبل الضريبة', money(totals.subtotal)),
            _sum('ضريبة القيمة المضافة', money(totals.vat)),
            const SizedBox(height: 4),
            Row(children: [
              const Expanded(child: Text('الإجمالي', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18))),
              Text('${money(totals.total)} $riyal', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22, color: s.primary)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _ExtraButton(
                icon: Icons.percent_rounded,
                label: totals.discount > 0 ? 'خصم ${money(totals.discount)}' : 'خصم',
                active: totals.discount > 0,
                onTap: () async {
                  final d = await showDialog<({String type, double value})>(context: context, builder: (_) => _DiscountDialog(current: discount, gross: gross));
                  if (d != null) onDiscount(d);
                },
              )),
              const SizedBox(width: 8),
              Expanded(child: _ExtraButton(
                icon: Icons.domain_rounded,
                label: b2b != null ? b2b!.displayName : 'فاتورة شركة',
                active: b2b != null,
                onTap: () async {
                  if (b2b != null) {
                    onB2b(null);
                    return;
                  }
                  final c = await showDialog<Customer>(context: context, builder: (_) => const _B2BPicker());
                  if (c != null) onB2b(c);
                },
              )),
            ]),
            if (b2b == null) ...[
              const SizedBox(height: 8),
              _LoyaltyBox(customer: loyalty, onChange: onLoyalty),
            ],
            const SizedBox(height: 10),
            Row(children: [
              for (final m in _payMethods)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: _PayChip(id: m.$1, label: m.$2, icon: m.$3, selected: pay == m.$1, onTap: () => onPay(m.$1)),
                  ),
                ),
            ]),
            const SizedBox(height: 12),
            SizedBox(
              height: 56,
              child: BusyButton(
                busy: busy,
                icon: Icons.check_circle_rounded,
                label: lines.isEmpty ? 'إتمام الدفع' : 'إتمام الدفع • ${money(totals.total)} $riyal',
                onPressed: lines.isEmpty ? null : onCheckout,
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _sum(String l, String v, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(l, style: TextStyle(color: color))),
          Text(v, style: TextStyle(fontWeight: FontWeight.w700, color: color)),
        ]),
      );
}

class _CartRow extends StatelessWidget {
  const _CartRow({required this.line, required this.onQty});
  final CartLine line;
  final void Function(CartLine, int) onQty;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
      decoration: BoxDecoration(color: s.surfaceContainerLow, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(line.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('${money(line.unit.gross * line.qty / 100)} $riyal${line.unit.category != 'S' ? ' • ${vatCategoryShort[line.unit.category]}' : ''}',
                style: TextStyle(color: s.primary, fontWeight: FontWeight.w700, fontSize: 13)),
          ]),
        ),
        _QtyBtn(icon: Icons.remove_rounded, onTap: () => onQty(line, line.qty - 1)),
        InkWell(
          onTap: () async {
            final n = await _askQty(context, line.name);
            if (n != null) onQty(line, n);
          },
          child: SizedBox(width: 36, child: Text('${line.qty}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
        ),
        _QtyBtn(icon: Icons.add_rounded, onTap: () => onQty(line, line.qty + 1)),
      ]),
    );
  }
}

class _QtyBtn extends StatelessWidget {
  const _QtyBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 36, height: 36,
        child: IconButton.filledTonal(padding: EdgeInsets.zero, iconSize: 18, onPressed: onTap, icon: Icon(icon)),
      );
}

class _ExtraButton extends StatelessWidget {
  const _ExtraButton({required this.icon, required this.label, required this.active, required this.onTap});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Material(
      color: active ? Brand.success.withValues(alpha: 0.14) : s.surfaceContainer,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: 17, color: active ? Brand.success : s.onSurfaceVariant),
            const SizedBox(width: 6),
            Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: active ? Brand.success : null))),
            if (active) ...[const SizedBox(width: 4), Icon(Icons.close_rounded, size: 14, color: s.onSurfaceVariant)],
          ]),
        ),
      ),
    );
  }
}

class _PayChip extends StatelessWidget {
  const _PayChip({required this.id, required this.label, required this.icon, required this.selected, required this.onTap});
  final String id;
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Material(
      color: selected ? s.primary : s.surfaceContainer,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child: Column(children: [
            Icon(icon, size: 18, color: selected ? Colors.white : s.onSurfaceVariant),
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: selected ? Colors.white : null)),
          ]),
        ),
      ),
    );
  }
}

// ── عميل الولاء ─────────────────────────────────────────────────────
class _LoyaltyBox extends StatefulWidget {
  const _LoyaltyBox({required this.customer, required this.onChange});
  final Customer? customer;
  final ValueChanged<Customer?> onChange;
  @override
  State<_LoyaltyBox> createState() => _LoyaltyBoxState();
}

class _LoyaltyBoxState extends State<_LoyaltyBox> {
  final _phone = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final app = Services.read(context);
    final p = normPhone(_phone.text);
    if (p.length < 9) {
      showSnack(context, 'اكتب رقم جوال صحيح', error: true);
      return;
    }
    final local = app.catalog.byPhone(p);
    if (local != null) {
      widget.onChange(local);
      _phone.clear();
      return;
    }
    if (!app.connectivity.online) {
      showSnack(context, 'العميل غير محفوظ بالجهاز — يحتاج إنترنت لإضافته', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final rows = await app.api.select('customers', columns: 'id,name,legal_name,phone,customer_type,vat_number,cr_number,stamps', filters: {'phone': 'eq.$p'}, limit: 1);
      if (!mounted) return;
      if (rows.isNotEmpty) {
        await app.catalog.upsertCustomer(rows.first);
        widget.onChange(Customer(rows.first));
        _phone.clear();
      } else {
        final name = await _askName(context);
        if (name == null || name.isEmpty || !mounted) return;
        final row = await app.api.insert('customers', {'name': name, 'phone': p, 'customer_type': 'individual'},
            columns: 'id,name,phone,customer_type,stamps');
        await app.catalog.upsertCustomer(row);
        widget.onChange(Customer(row));
        _phone.clear();
      }
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.customer;
    final app = Services.of(context);
    if (c != null) {
      final req = app.catalog.loyaltyRequired;
      return Container(
        padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
        decoration: BoxDecoration(color: const Color(0xFFFFF6E5), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          const Icon(Icons.card_giftcard_rounded, color: Brand.warning, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('${c.name} • أختام ${c.stamps}/$req (+1 مع هذا البيع)', maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF7A5200)))),
          IconButton(onPressed: () => widget.onChange(null), icon: const Icon(Icons.close_rounded, size: 18)),
        ]),
      );
    }
    return Row(children: [
      Expanded(
        child: TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          textDirection: TextDirection.ltr,
          onSubmitted: (_) => _lookup(),
          decoration: const InputDecoration(hintText: 'جوال عميل الولاء (اختياري)', isDense: true, prefixIcon: Icon(Icons.card_giftcard_rounded, size: 20)),
        ),
      ),
      const SizedBox(width: 6),
      SizedBox(
        height: 46,
        child: OutlinedButton(onPressed: _busy ? null : _lookup, child: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('بحث')),
      ),
    ]);
  }
}

Future<String?> _askName(BuildContext context) async {
  final c = TextEditingController();
  final r = await showDialog<String>(
    context: context,
    builder: (d) => AlertDialog(
      title: const Text('عميل جديد'),
      content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(labelText: 'اسم العميل'), onSubmitted: (v) => Navigator.pop(d, v.trim())),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: const Text('إضافة')),
      ],
    ),
  );
  c.dispose();
  return r;
}

// ── الخصم ───────────────────────────────────────────────────────────
class _DiscountDialog extends StatefulWidget {
  const _DiscountDialog({required this.current, required this.gross});
  final ({String type, double value}) current;
  final double gross;
  @override
  State<_DiscountDialog> createState() => _DiscountDialogState();
}

class _DiscountDialogState extends State<_DiscountDialog> {
  late String _type = widget.current.type;
  late final _c = TextEditingController(text: widget.current.value > 0 ? '${widget.current.value}' : '');

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double get _amount {
    final v = double.tryParse(_c.text.replaceAll(',', '.')) ?? 0;
    if (v <= 0) return 0;
    return _type == 'percent' ? percentDiscount(widget.gross, v) : (v * 100).round() / 100;
  }

  @override
  Widget build(BuildContext context) {
    final invalid = _amount >= widget.gross && _amount > 0;
    return AlertDialog(
      title: const Text('خصم على الفاتورة', style: TextStyle(fontWeight: FontWeight.w900)),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'amount', label: Text('مبلغ $riyal')), ButtonSegment(value: 'percent', label: Text('نسبة %'))],
          selected: {_type},
          onSelectionChanged: (v) => setState(() => _type = v.first),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _c, autofocus: true, textDirection: TextDirection.ltr,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: _type == 'percent' ? 'النسبة' : 'المبلغ (شامل الضريبة)'),
        ),
        const SizedBox(height: 8),
        Text(invalid ? 'الخصم لازم يكون أقل من الإجمالي (${money(widget.gross)})' : 'قيمة الخصم: ${money(_amount)} $riyal — يظهر في الفاتورة الإلكترونية كخصم رسمي',
            style: TextStyle(fontSize: 12, color: invalid ? Brand.danger : null, fontWeight: invalid ? FontWeight.w700 : null)),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, (type: _type, value: 0.0)), child: const Text('بدون خصم')),
        FilledButton(
          onPressed: invalid ? null : () => Navigator.pop(context, (type: _type, value: double.tryParse(_c.text.replaceAll(',', '.')) ?? 0)),
          child: const Text('تطبيق'),
        ),
      ],
    );
  }
}

// ── فاتورة شركة ─────────────────────────────────────────────────────
class _B2BPicker extends StatefulWidget {
  const _B2BPicker();
  @override
  State<_B2BPicker> createState() => _B2BPickerState();
}

class _B2BPickerState extends State<_B2BPicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final list = app.catalog.customers.where((c) => c.isCompany).where((c) {
      if (_q.isEmpty) return true;
      return [c.name, c.legalName, c.vatNumber, c.crNumber, c.phone].any((x) => (x ?? '').contains(_q));
    }).toList();
    return AlertDialog(
      title: const Text('فاتورة ضريبية لمنشأة (B2B)', style: TextStyle(fontWeight: FontWeight.w900)),
      content: SizedBox(
        width: 460,
        height: 460,
        child: Column(children: [
          if (!app.catalog.supportsB2B)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Brand.warning.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
              child: const Text('الفرع مربوط بالهيئة للفواتير المبسطة فقط — فعّل "فواتير الشركات" من الموقع وأعد الربط.',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          const Text('تصدر باسم المنشأة المشترية وعنوانها الوطني، وتُعتمد من الهيئة قبل تسليمها (تحتاج إنترنت).', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 10),
          TextField(
            onChanged: (v) => setState(() => _q = v.trim()),
            decoration: const InputDecoration(hintText: 'اسم المنشأة أو الرقم الضريبي', prefixIcon: Icon(Icons.search_rounded), isDense: true),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: list.isEmpty
                ? const EmptyState(icon: Icons.domain_disabled_rounded, title: 'لا يوجد عملاء منشآت', body: 'أضف العميل برقمه الضريبي وعنوانه من قسم العملاء')
                : ListView.separated(
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final c = list[i];
                      final miss = c.b2bMissing;
                      return FCard(
                        padding: const EdgeInsets.all(12),
                        onTap: miss.isEmpty && app.catalog.supportsB2B ? () => Navigator.pop(context, c) : null,
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w900)),
                              Text(c.vatNumber ?? 'CR ${c.crNumber ?? ''}', textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 12)),
                              if (miss.isNotEmpty)
                                Text('ناقص: ${miss.join('، ')}', style: const TextStyle(fontSize: 11, color: Brand.warning, fontWeight: FontWeight.w700)),
                            ]),
                          ),
                          if (miss.isEmpty) const Icon(Icons.check_circle_rounded, color: Brand.success),
                        ]),
                      );
                    },
                  ),
          ),
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('إغلاق'))],
    );
  }
}

// ── النقدي: المبلغ المستلم والباقي ───────────────────────────────────
class _CashSheet extends StatefulWidget {
  const _CashSheet({required this.total});
  final double total;
  @override
  State<_CashSheet> createState() => _CashSheetState();
}

class _CashSheetState extends State<_CashSheet> {
  late final _c = TextEditingController();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double get _paid => double.tryParse(_c.text.replaceAll(',', '.')) ?? 0;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final t = widget.total;
    final quick = <double>{t.ceilToDouble(), ((t / 10).ceil() * 10).toDouble(), ((t / 50).ceil() * 50).toDouble(), ((t / 100).ceil() * 100).toDouble(), 500}
        .where((v) => v >= t)
        .toList()
      ..sort();
    final change = _paid - t;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('الدفع نقداً', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text('المطلوب: ${money(t)} $riyal', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: s.primary)),
        const SizedBox(height: 14),
        TextField(
          controller: _c, autofocus: true, textDirection: TextDirection.ltr,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => Navigator.pop(context, _paid >= t ? _paid : t),
          decoration: const InputDecoration(labelText: 'المبلغ المستلم (اختياري)'),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final q in quick)
            ActionChip(label: Text(money(q)), onPressed: () => setState(() => _c.text = q.toStringAsFixed(q == q.roundToDouble() ? 0 : 2))),
        ]),
        const SizedBox(height: 12),
        if (_paid > 0)
          Text(change >= 0 ? 'الباقي للعميل: ${money(change)} $riyal' : 'المبلغ أقل من المطلوب',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: change >= 0 ? Brand.success : Brand.danger)),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: _paid > 0 && _paid < t ? null : () => Navigator.pop(context, _paid >= t ? _paid : t),
          icon: const Icon(Icons.check_rounded),
          label: const Text('تأكيد البيع'),
        ),
      ]),
    );
  }
}

/// نافذة نجاح البيع: الرقم والحالة + طباعة/معاينة/مشاركة
class SaleDoneDialog extends StatelessWidget {
  const SaleDoneDialog({super.key, required this.sale});
  final Sale sale;
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.sales,
      builder: (context, _) {
        final b2bPending = sale.b2bAwaitingClearance(app.catalog.zatcaActive);
        return AlertDialog(
          icon: Icon(b2bPending ? Icons.hourglass_top_rounded : Icons.check_circle_rounded, size: 48, color: b2bPending ? Brand.warning : Brand.success),
          title: Text(b2bPending ? 'بانتظار اعتماد الهيئة' : 'تم البيع', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(sale.invoiceNo, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
            const SizedBox(height: 4),
            Text('${money(sale.total)} $riyal', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
            if ((sale.changeDue ?? 0) > 0) Text('الباقي: ${money(sale.changeDue!)} $riyal', style: const TextStyle(fontWeight: FontWeight.w700, color: Brand.success)),
            const SizedBox(height: 10),
            ZatcaChip(sale.status == SaleStatus.synced ? sale.zatcaStatus : (sale.status == SaleStatus.failed ? 'failed' : 'queued')),
            if (b2bPending) ...[
              const SizedBox(height: 10),
              const Text('لا تسلّم فاتورة الشركة قبل الاعتماد. افتحها من الفواتير واضغط "إعادة الإرسال" ثم اطبعها.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 13)),
            ],
            if (sale.lastError != null && sale.status == SaleStatus.failed) ...[
              const SizedBox(height: 8),
              Text(sale.lastError!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.danger, fontSize: 12)),
            ],
          ]),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            if (!b2bPending)
              OutlinedButton.icon(
                onPressed: () => showReceiptPreview(context, ReceiptDoc.fromSale(sale)),
                icon: const Icon(Icons.receipt_long_rounded),
                label: const Text('الإيصال'),
              ),
            FilledButton.icon(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.add_shopping_cart_rounded), label: const Text('بيع جديد')),
          ],
        );
      },
    );
  }
}
