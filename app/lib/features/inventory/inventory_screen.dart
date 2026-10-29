// المخزون: الكميات من الجهاز + توريد/تعديل (ذري في السيرفر مع سجل حركة)
// المخزون ينقص تلقائياً مع البيع ويرجع مع المرتجع (السيرفر).

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});
  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  String _filter = 'all';
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.catalog,
      builder: (context, _) {
        final tracked = app.catalog.products.where((p) => p.trackInventory).toList();
        final low = tracked.where((p) => p.lowStock && !p.outOfStock).length;
        final out = tracked.where((p) => p.outOfStock).length;
        final list = tracked.where((p) {
          if (_filter == 'low' && !(p.lowStock && !p.outOfStock)) return false;
          if (_filter == 'out' && !p.outOfStock) return false;
          return _q.isEmpty || p.name.contains(_q) || (p.barcode ?? '').contains(_q);
        }).toList()
          ..sort((a, b) => a.stock.compareTo(b.stock));
        return Scaffold(
          appBar: SectionAppBar(title: 'المخزون', actions: [
            IconButton(tooltip: 'سجل الحركة', onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const _LogsPage())),
                icon: const Icon(Icons.history_rounded)),
          ]),
          body: tracked.isEmpty
              ? EmptyState(
                  icon: Icons.warehouse_outlined,
                  title: 'ما فيه منتجات متتبعة المخزون',
                  body: 'فعّل "تتبع المخزون" في المنتج، والكمية تنقص تلقائياً مع البيع',
                  action: OutlinedButton(onPressed: () => ShellNav.go(context, 'products'), child: const Text('المنتجات')),
                )
              : Column(children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                    child: Row(children: [
                      Expanded(child: StatTile(label: 'متتبعة', value: tracked.length, icon: Icons.inventory_2_rounded)),
                      const SizedBox(width: 8),
                      Expanded(child: StatTile(label: 'قاربت النفاد', value: low, icon: Icons.warning_amber_rounded, color: Brand.warning)),
                      const SizedBox(width: 8),
                      Expanded(child: StatTile(label: 'نفدت', value: out, icon: Icons.remove_shopping_cart_rounded, color: Brand.danger)),
                    ]),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(children: [
                      Expanded(
                        child: TextField(
                          onChanged: (v) => setState(() => _q = v.trim()),
                          decoration: const InputDecoration(hintText: 'بحث', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SegmentedButton<String>(
                        showSelectedIcon: false,
                        segments: const [
                          ButtonSegment(value: 'all', label: Text('الكل')),
                          ButtonSegment(value: 'low', label: Text('ناقص')),
                          ButtonSegment(value: 'out', label: Text('نافد')),
                        ],
                        selected: {_filter},
                        onSelectionChanged: (v) => setState(() => _filter = v.first),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 6),
                      itemBuilder: (_, i) {
                        final p = list[i];
                        final c = p.outOfStock ? Brand.danger : p.lowStock ? Brand.warning : Brand.success;
                        return FCard(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          onTap: () => _adjust(context, p),
                          child: Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text('تنبيه عند ${qty(p.minStock)}${p.cost > 0 ? ' • تكلفة ${money(p.cost)}' : ''}', style: const TextStyle(fontSize: 12)),
                              ]),
                            ),
                            Text(qty(p.stock), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: c)),
                            const SizedBox(width: 8),
                            const Icon(Icons.edit_rounded, size: 18),
                          ]),
                        );
                      },
                    ),
                  ),
                ]),
        );
      },
    );
  }

  Future<void> _adjust(BuildContext context, Product p) async {
    final app = Services.read(context);
    if (!app.connectivity.online) {
      showSnack(context, 'تعديل المخزون يحتاج إنترنت', error: true);
      return;
    }
    final r = await showModalBottomSheet<double>(context: context, isScrollControlled: true, builder: (_) => _AdjustSheet(product: p));
    if (r != null && context.mounted) showSnack(context, 'المخزون الآن ${qty(r)}');
  }
}

class _AdjustSheet extends StatefulWidget {
  const _AdjustSheet({required this.product});
  final Product product;
  @override
  State<_AdjustSheet> createState() => _AdjustSheetState();
}

class _AdjustSheetState extends State<_AdjustSheet> {
  String _type = 'add';
  final _qty = TextEditingController();
  final _cost = TextEditingController();
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final n = double.tryParse(_qty.text.replaceAll(',', '.')) ?? 0;
    if (n <= 0) {
      showSnack(context, 'اكتب الكمية', error: true);
      return;
    }
    final app = Services.read(context);
    setState(() => _busy = true);
    try {
      final r = asMap(await app.api.rpc('adjust_stock', {
        'p_product': widget.product.id,
        'p_delta': _type == 'add' ? n : -n,
        'p_reason': _reason.text.trim().isEmpty ? (_type == 'add' ? 'توريد' : 'تالف/جرد') : _reason.text.trim(),
        'p_unit_cost': double.tryParse(_cost.text.replaceAll(',', '.')),
      }));
      final stock = toD(r['stock']);
      await app.catalog.upsertProduct({
        'id': widget.product.id, 'stock_quantity': stock, 'track_inventory': true,
        if (double.tryParse(_cost.text) != null && _type == 'add') 'cost_price': double.parse(_cost.text),
      });
      if (mounted) Navigator.pop(context, stock);
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(widget.product.name, style: Theme.of(context).textTheme.titleLarge),
          Text('الكمية الحالية: ${qty(widget.product.stock)}'),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'add', label: Text('توريد / إضافة'), icon: Icon(Icons.add_rounded)),
              ButtonSegment(value: 'sub', label: Text('تالف / نقص'), icon: Icon(Icons.remove_rounded)),
            ],
            selected: {_type},
            onSelectionChanged: (v) => setState(() => _type = v.first),
          ),
          const SizedBox(height: 12),
          LabeledField(label: 'الكمية', controller: _qty, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true), autofocus: true),
          if (_type == 'add') ...[
            const SizedBox(height: 10),
            LabeledField(label: 'تكلفة الوحدة (اختياري)', controller: _cost, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true)),
          ],
          const SizedBox(height: 10),
          LabeledField(label: 'السبب / الملاحظة', controller: _reason),
          const SizedBox(height: 14),
          BusyButton(label: 'حفظ', busy: _busy, onPressed: _save, icon: Icons.save_rounded),
        ]),
      );
}

class _LogsPage extends StatelessWidget {
  const _LogsPage();
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    const types = {'sale': 'بيع', 'return': 'مرتجع', 'restock': 'توريد', 'adjustment': 'تعديل'};
    return Scaffold(
      appBar: AppBar(title: const Text('سجل حركة المخزون')),
      body: AsyncView<List<Map<String, dynamic>>>(
        load: () => app.api.select('inventory_logs', columns: 'product_name,type,quantity_change,previous_stock,new_stock,reason,created_at',
            order: 'created_at.desc', limit: 200),
        builder: (context, rows, _) => rows.isEmpty
            ? ListView(children: const [SizedBox(height: 80), EmptyState(icon: Icons.history_rounded, title: 'لا توجد حركات بعد')])
            : ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: rows.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final r = rows[i];
                  final ch = toD(r['quantity_change']);
                  return ListTile(
                    title: Text(toS(r['product_name']) ?? ''),
                    subtitle: Text('${types[r['type']] ?? r['type'] ?? ''} • ${toS(r['reason']) ?? ''} • ${dateTimeKsa(DateTime.tryParse('${r['created_at']}') ?? DateTime.now())}'),
                    trailing: Text('${ch > 0 ? '+' : ''}${qty(ch)} ⇐ ${qty(toD(r['new_stock']))}',
                        textDirection: TextDirection.ltr, style: TextStyle(fontWeight: FontWeight.w900, color: ch < 0 ? Brand.danger : Brand.success)),
                  );
                },
              ),
      ),
    );
  }
}
