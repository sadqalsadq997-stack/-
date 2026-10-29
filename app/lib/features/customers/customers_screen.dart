// العملاء: أفراد (ولاء بالجوال) ومنشآت (فاتورة ضريبية B2B بالرقم الضريبي والعنوان الوطني)

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../core/zatca_qr.dart';
import '../../data/models.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});
  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  String _q = '';
  String _type = 'all';

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: app.catalog,
      builder: (context, _) {
        final list = app.catalog.customers.where((c) {
          if (_type == 'company' && !c.isCompany) return false;
          if (_type == 'person' && c.isCompany) return false;
          if (_q.isEmpty) return true;
          return [c.name, c.legalName, c.phone, c.vatNumber].any((x) => (x ?? '').contains(_q));
        }).toList();
        return Scaffold(
          appBar: const SectionAppBar(title: 'العملاء'),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _open(context),
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('عميل جديد'),
          ),
          body: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    onChanged: (v) => setState(() => _q = v.trim()),
                    decoration: const InputDecoration(hintText: 'الاسم أو الجوال أو الرقم الضريبي', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                  ),
                ),
                const SizedBox(width: 8),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [ButtonSegment(value: 'all', label: Text('الكل')), ButtonSegment(value: 'person', label: Text('أفراد')), ButtonSegment(value: 'company', label: Text('منشآت'))],
                  selected: {_type},
                  onSelectionChanged: (v) => setState(() => _type = v.first),
                ),
              ]),
            ),
            Expanded(
              child: list.isEmpty
                  ? const EmptyState(icon: Icons.people_outline_rounded, title: 'لا يوجد عملاء')
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 6),
                      itemBuilder: (_, i) {
                        final c = list[i];
                        final miss = c.isCompany ? c.b2bMissing : const <String>[];
                        return FCard(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          onTap: () => _open(context, c),
                          child: Row(children: [
                            CircleAvatar(child: Icon(c.isCompany ? Icons.domain_rounded : Icons.person_rounded)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text([c.phone, c.vatNumber].whereType<String>().join(' • '), textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 12)),
                                if (miss.isNotEmpty) Text('للفاتورة الضريبية ناقص: ${miss.join('، ')}', style: const TextStyle(fontSize: 11, color: Brand.warning, fontWeight: FontWeight.w700)),
                              ]),
                            ),
                            if (!c.isCompany) StatusChip('أختام ${c.stamps}', color: Brand.warning),
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

  Future<void> _open(BuildContext context, [Customer? c]) async {
    final app = Services.read(context);
    if (!app.connectivity.online) {
      showSnack(context, 'إضافة وتعديل العملاء تحتاج إنترنت', error: true);
      return;
    }
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => _CustomerForm(customer: c)));
  }
}

class _CustomerForm extends StatefulWidget {
  const _CustomerForm({this.customer});
  final Customer? customer;
  @override
  State<_CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<_CustomerForm> {
  final _form = GlobalKey<FormState>();
  late final Map<String, dynamic> r = widget.customer?.raw ?? const {};
  late String _type = toS(r['customer_type']) ?? (widget.customer?.isCompany == true ? 'corporate' : 'individual');
  late final Map<String, TextEditingController> _c = {
    for (final k in ['name', 'phone', 'legal_name', 'vat_number', 'cr_number', 'addr_street', 'addr_building', 'addr_district', 'addr_city', 'addr_postal', 'addr_additional'])
      k: TextEditingController(text: toS(r[k]) ?? ''),
  };
  bool _busy = false;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  String? _digits(String? v, int n, String label) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    return RegExp('^\\d{$n}\$').hasMatch(s) ? null : '$label $n أرقام';
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final app = Services.read(context);
    setState(() => _busy = true);
    String? v(String k) => _c[k]!.text.trim().isEmpty ? null : _c[k]!.text.trim();
    final payload = <String, dynamic>{
      'name': v('name'),
      'phone': v('phone'),
      'customer_type': _type,
      if (_type == 'corporate') ...{
        'legal_name': v('legal_name'), 'vat_number': v('vat_number'), 'cr_number': v('cr_number'),
        'addr_street': v('addr_street'), 'addr_building': v('addr_building'), 'addr_district': v('addr_district'),
        'addr_city': v('addr_city'), 'addr_postal': v('addr_postal'), 'addr_additional': v('addr_additional'),
      },
    };
    try {
      final row = widget.customer == null
          ? await app.api.insert('customers', payload)
          : await app.api.update('customers', payload, {'id': 'eq.${widget.customer!.id}'});
      if (row != null && row.isNotEmpty) await app.catalog.upsertCustomer(row);
      if (!mounted) return;
      Navigator.pop(context);
      showSnack(context, 'تم حفظ العميل');
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final corp = _type == 'corporate';
    return Scaffold(
      appBar: AppBar(title: Text(widget.customer == null ? 'عميل جديد' : 'تعديل العميل')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'individual', label: Text('فرد'), icon: Icon(Icons.person_rounded)),
                ButtonSegment(value: 'corporate', label: Text('منشأة'), icon: Icon(Icons.domain_rounded)),
              ],
              selected: {_type},
              onSelectionChanged: (v) => setState(() => _type = v.first),
            ),
            const SizedBox(height: 14),
            LabeledField(label: 'الاسم *', controller: _c['name']!, validator: (v) => (v ?? '').trim().isEmpty ? 'الاسم مطلوب' : null),
            const SizedBox(height: 12),
            LabeledField(label: 'الجوال', controller: _c['phone']!, ltr: true, keyboard: TextInputType.phone),
            if (corp) ...[
              const SizedBox(height: 18),
              const SectionTitle('بيانات الفاتورة الضريبية (B2B)', icon: Icons.receipt_long_rounded),
              const Text('من شهادة ضريبة القيمة المضافة والعنوان الوطني (سبل) — تطبع في الفاتورة وتُرسل للهيئة.', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 10),
              LabeledField(label: 'الاسم القانوني للمنشأة', controller: _c['legal_name']!),
              const SizedBox(height: 12),
              LabeledField(label: 'الرقم الضريبي (15 رقم)', controller: _c['vat_number']!, ltr: true, keyboard: TextInputType.number, maxLength: 15,
                  validator: (v) => (v ?? '').trim().isEmpty || isValidVat(v!.trim()) ? null : 'الرقم الضريبي 15 رقم يبدأ وينتهي بـ 3'),
              const SizedBox(height: 12),
              LabeledField(label: 'السجل التجاري (10 أرقام)', controller: _c['cr_number']!, ltr: true, keyboard: TextInputType.number, maxLength: 10,
                  validator: (v) => _digits(v, 10, 'السجل التجاري')),
              const SizedBox(height: 12),
              LabeledField(label: 'الشارع', controller: _c['addr_street']!),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: LabeledField(label: 'رقم المبنى', controller: _c['addr_building']!, ltr: true, keyboard: TextInputType.number, maxLength: 4,
                    validator: (v) => _digits(v, 4, 'رقم المبنى'))),
                const SizedBox(width: 10),
                Expanded(child: LabeledField(label: 'الرمز البريدي', controller: _c['addr_postal']!, ltr: true, keyboard: TextInputType.number, maxLength: 5,
                    validator: (v) => _digits(v, 5, 'الرمز البريدي'))),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: LabeledField(label: 'الحي', controller: _c['addr_district']!)),
                const SizedBox(width: 10),
                Expanded(child: LabeledField(label: 'المدينة', controller: _c['addr_city']!)),
              ]),
              const SizedBox(height: 12),
              LabeledField(label: 'الرقم الإضافي (اختياري)', controller: _c['addr_additional']!, ltr: true),
            ],
            const SizedBox(height: 20),
            BusyButton(label: 'حفظ', icon: Icons.save_rounded, busy: _busy, onPressed: _save),
          ],
        ),
      ),
    );
  }
}
