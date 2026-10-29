// المنتجات: عرض من الجهاز (بدون إنترنت) + إضافة وتعديل (مع الإنترنت)
// الفئة الضريبية ورمز الإعفاء نفس الموقع (الأدوية صفرية، الخدمات المالية معفاة…)

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});
  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  String _q = '';
  String _cat = 'all';

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.catalog,
      builder: (context, _) {
        final list = app.catalog.products.where((p) {
          if (_cat != 'all' && p.categoryId != _cat) return false;
          if (_q.isEmpty) return true;
          return p.name.contains(_q) || (p.nameEn ?? '').toLowerCase().contains(_q.toLowerCase()) || (p.barcode ?? '').contains(_q);
        }).toList();
        return Scaffold(
          appBar: const SectionAppBar(title: 'المنتجات'),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => openProductForm(context),
            icon: const Icon(Icons.add_rounded),
            label: const Text('منتج جديد'),
          ),
          body: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
              child: TextField(
                onChanged: (v) => setState(() => _q = v.trim()),
                decoration: const InputDecoration(hintText: 'ابحث بالاسم أو الباركود', prefixIcon: Icon(Icons.search_rounded), isDense: true),
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: ChoiceChip(label: const Text('الكل'), selected: _cat == 'all', onSelected: (_) => setState(() => _cat = 'all')),
                ),
                for (final c in app.catalog.categories)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(label: Text(c.name), selected: _cat == c.id, onSelected: (_) => setState(() => _cat = c.id)),
                  ),
              ]),
            ),
            Expanded(
              child: list.isEmpty
                  ? const EmptyState(icon: Icons.inventory_2_outlined, title: 'لا توجد منتجات')
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 6, 12, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 6),
                      itemBuilder: (_, i) {
                        final p = list[i];
                        return FCard(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          onTap: () => openProductForm(context, product: p),
                          child: Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Wrap(spacing: 6, children: [
                                  if ((p.barcode ?? '').isNotEmpty) Text(p.barcode!, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 12)),
                                  if (p.vatCategory != 'S') StatusChip(vatCategoryShort[p.vatCategory] ?? '', color: Brand.info),
                                  if (p.trackInventory) StatusChip('مخزون ${qty(p.stock)}', color: p.lowStock ? Brand.danger : Brand.success),
                                ]),
                              ]),
                            ),
                            Text('${money(p.unit.gross / 100)} $riyal', style: const TextStyle(fontWeight: FontWeight.w900)),
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
}

Future<void> openProductForm(BuildContext context, {Product? product}) async {
  final app = Services.read(context);
  if (!app.connectivity.online) {
    showSnack(context, 'إضافة وتعديل المنتجات تحتاج إنترنت', error: true);
    return;
  }
  await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => _ProductForm(product: product)));
}

class _ProductForm extends StatefulWidget {
  const _ProductForm({this.product});
  final Product? product;
  @override
  State<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<_ProductForm> {
  final _form = GlobalKey<FormState>();
  late final Map<String, dynamic> r = widget.product?.raw ?? const {};
  late final _nameAr = TextEditingController(text: toS(r['name_ar']) ?? '');
  late final _nameEn = TextEditingController(text: toS(r['name']) ?? '');
  late final _price = TextEditingController(text: r['base_price'] == null ? '' : '${r['base_price']}');
  late final _cost = TextEditingController(text: r['cost_price'] == null ? '' : '${r['cost_price']}');
  late final _barcode = TextEditingController(text: toS(r['barcode']) ?? '');
  late final _sku = TextEditingController(text: toS(r['sku']) ?? '');
  late final _minStock = TextEditingController(text: '${r['min_stock_alert'] ?? 5}');
  late bool _inclusive = r['tax_inclusive'] == true || widget.product == null;
  late bool _track = r['track_inventory'] == true;
  late bool _active = r['is_active'] != false;
  late String? _category = toS(r['category_id']);
  late String _vat = widget.product?.vatCategory ?? 'S';
  late String? _code = widget.product?.exemptionCode;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_nameAr, _nameEn, _price, _cost, _barcode, _sku, _minStock]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    if (_vat != 'S' && _code == null) {
      showSnack(context, 'اختر سبب الإعفاء أو النسبة الصفرية', error: true);
      return;
    }
    final app = Services.read(context);
    setState(() => _busy = true);
    final payload = <String, dynamic>{
      'name_ar': _nameAr.text.trim(),
      'name': _nameEn.text.trim().isEmpty ? _nameAr.text.trim() : _nameEn.text.trim(),
      'base_price': double.tryParse(_price.text.replaceAll(',', '.')) ?? 0,
      'cost_price': double.tryParse(_cost.text.replaceAll(',', '.')),
      'barcode': _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
      'sku': _sku.text.trim().isEmpty ? null : _sku.text.trim(),
      'category_id': _category,
      'tax_inclusive': _inclusive,
      'track_inventory': _track,
      'min_stock_alert': double.tryParse(_minStock.text) ?? 5,
      'is_active': _active,
      'vat_category': _vat,
      'vat_exemption_code': _vat == 'S' ? null : _code,
      'tax_rate': _vat == 'S' ? 15 : 0,
    };
    try {
      Map<String, dynamic>? row;
      if (widget.product == null) {
        row = await app.api.insert('products', payload);
      } else {
        row = await app.api.update('products', payload, {'id': 'eq.${widget.product!.id}'});
      }
      if (row != null && row.isNotEmpty) await app.catalog.upsertProduct(row);
      if (!mounted) return;
      Navigator.pop(context);
      showSnack(context, widget.product == null ? 'تمت إضافة المنتج' : 'تم حفظ المنتج');
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final codes = vatExemptions[_vat] ?? const [];
    return Scaffold(
      appBar: AppBar(title: Text(widget.product == null ? 'منتج جديد' : 'تعديل المنتج')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            LabeledField(label: 'الاسم بالعربي *', controller: _nameAr, validator: (v) => (v ?? '').trim().isEmpty ? 'الاسم مطلوب' : null),
            const SizedBox(height: 12),
            LabeledField(label: 'الاسم بالإنجليزي', controller: _nameEn),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: LabeledField(label: 'سعر البيع *', controller: _price, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true),
                  validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? -1) < 0 ? 'سعر غير صحيح' : null)),
              const SizedBox(width: 10),
              Expanded(child: LabeledField(label: 'سعر التكلفة', controller: _cost, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true))),
            ]),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _inclusive,
              onChanged: (v) => setState(() => _inclusive = v),
              title: const Text('السعر شامل الضريبة'),
            ),
            Row(children: [
              Expanded(child: LabeledField(label: 'الباركود', controller: _barcode, ltr: true)),
              const SizedBox(width: 10),
              Expanded(child: LabeledField(label: 'رمز المنتج SKU', controller: _sku, ltr: true)),
            ]),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: app.catalog.categories.any((c) => c.id == _category) ? _category : null,
              decoration: const InputDecoration(labelText: 'التصنيف'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('— بدون تصنيف —')),
                for (final c in app.catalog.categories) DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
              ],
              onChanged: (v) => setState(() => _category = v),
            ),
            const SizedBox(height: 16),
            FCard(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('ضريبة القيمة المضافة', style: TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _vat,
                  items: [for (final e in vatCategoryLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                  onChanged: (v) => setState(() {
                    _vat = v ?? 'S';
                    _code = _vat == 'S' ? null : vatExemptions[_vat]!.first[0];
                  }),
                ),
                if (_vat != 'S') ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: codes.any((c) => c[0] == _code) ? _code : null,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'السبب (رمز الهيئة) *'),
                    items: [for (final c in codes) DropdownMenuItem(value: c[0], child: Text(c[1], overflow: TextOverflow.ellipsis))],
                    onChanged: (v) => setState(() => _code = v),
                  ),
                  const SizedBox(height: 8),
                  const Text('تأكد إن الصنف فعلاً يستحق هذا الإعفاء — الاختيار الخاطئ يعرّض المنشأة لغرامات. المطاعم والمحلات العادية: كل أصنافها 15%.',
                      style: TextStyle(fontSize: 12, color: Brand.warning, fontWeight: FontWeight.w700)),
                ],
              ]),
            ),
            const SizedBox(height: 10),
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _track, onChanged: (v) => setState(() => _track = v), title: const Text('تتبع المخزون'),
                subtitle: const Text('الكمية تنقص مع كل بيع وتنبهك قبل النفاد')),
            if (_track) LabeledField(label: 'تنبيه عند وصول الكمية إلى', controller: _minStock, ltr: true, keyboard: TextInputType.number),
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _active, onChanged: (v) => setState(() => _active = v), title: const Text('المنتج مفعّل')),
            const SizedBox(height: 16),
            BusyButton(label: 'حفظ', icon: Icons.save_rounded, busy: _busy, onPressed: _save),
            if (widget.product != null) ...[
              const SizedBox(height: 10),
              TextButton(onPressed: () => ShellNav.go(context, 'inventory'), child: const Text('تعديل الكمية من قسم المخزون')),
            ],
          ],
        ),
      ),
    );
  }
}
