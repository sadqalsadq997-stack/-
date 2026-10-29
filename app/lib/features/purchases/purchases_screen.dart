// ══════════════════════════════════════════════════════════════════
// فواتير المشتريات — ضريبة المدخلات (حسب اللائحة التنفيذية)
//  • الخصم يحتاج فاتورة ضريبية من مورد مسجل (رقمه الضريبي) — المادة 49
//  • المبسطة تقبل فقط أقل من 1000 ريال — المادة 53
//  • خلال 5 سنوات، في إقرار فترة الاستلام
//  • غير مدفوعة 12 شهر من الاستحقاق ⇒ تنعكس الضريبة وتسترد عند الدفع
// فواتير المشتريات ما تُرسل للهيئة منك (المورد يرسلها). القيود المحاسبية تلقائية.
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/zatca_qr.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class PurchasesScreen extends StatefulWidget {
  const PurchasesScreen({super.key});
  @override
  State<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends State<PurchasesScreen> {
  int _gen = 0;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return Scaffold(
      appBar: const SectionAppBar(title: 'فواتير المشتريات'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (!app.connectivity.online) {
            showSnack(context, 'تسجيل المشتريات يحتاج إنترنت', error: true);
            return;
          }
          final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const _PurchaseForm()));
          if (ok == true) setState(() => _gen++);
        },
        icon: const Icon(Icons.add_rounded),
        label: const Text('فاتورة شراء'),
      ),
      body: AsyncView<List<Map<String, dynamic>>>(
        key: ValueKey(_gen),
        load: () => app.api.select('purchase_invoices', order: 'invoice_date.desc', limit: 300),
        builder: (context, rows, reload) {
          final vat = rows.where((r) => r['deductible'] != false).fold<double>(0, (s, r) => s + toD(r['vat_amount']));
          if (rows.isEmpty) {
            return ListView(children: const [
              SizedBox(height: 60),
              EmptyState(icon: Icons.shopping_bag_outlined, title: 'ما فيه فواتير مشتريات', body: 'سجّل مشترياتك من موردين مسجلين بالضريبة — ضريبتها تنخصم من إقرارك'),
            ]);
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
            children: [
              FCard(
                child: Row(children: [
                  const Icon(Icons.savings_rounded, color: Brand.success),
                  const SizedBox(width: 10),
                  Expanded(child: Text('ضريبة مدخلات مسجلة: ${money(vat)} $riyal', style: const TextStyle(fontWeight: FontWeight.w900))),
                ]),
              ),
              const SizedBox(height: 10),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: FCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(toS(r['supplier_name']) ?? '', style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text('${toS(r['invoice_number']) ?? ''} • ${toS(r['invoice_date']) ?? ''}', textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 12)),
                          Wrap(spacing: 6, runSpacing: 4, children: [
                            if (r['deductible'] == false) const StatusChip('غير قابلة للخصم', color: Brand.warning),
                            if (r['paid'] == false) StatusChip('غير مدفوعة${toS(r['due_date']) != null ? ' (تستحق ${r['due_date']})' : ''}', color: Brand.info),
                          ]),
                        ]),
                      ),
                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(money(toD(r['net_amount']) + toD(r['vat_amount'])), style: const TextStyle(fontWeight: FontWeight.w900)),
                        Text('ضريبة ${money(toD(r['vat_amount']))}', style: const TextStyle(fontSize: 12, color: Brand.success)),
                        if (r['paid'] == false)
                          TextButton(
                            onPressed: () async {
                              try {
                                await app.api.update('purchase_invoices', {'paid': true, 'paid_at': isoDate(DateTime.now())}, {'id': 'eq.${r['id']}'});
                                if (context.mounted) showSnack(context, 'تم تسجيل الدفع للمورد');
                                await reload();
                              } catch (e) {
                                if (context.mounted) showSnack(context, friendlyError(e), error: true);
                              }
                            },
                            child: const Text('سجّل الدفع'),
                          ),
                      ]),
                    ]),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _PurchaseForm extends StatefulWidget {
  const _PurchaseForm();
  @override
  State<_PurchaseForm> createState() => _PurchaseFormState();
}

class _PurchaseFormState extends State<_PurchaseForm> {
  final _form = GlobalKey<FormState>();
  final _supplier = TextEditingController();
  final _vatNo = TextEditingController();
  final _number = TextEditingController();
  final _total = TextEditingController();
  final _vat = TextEditingController();
  final _reason = TextEditingController();
  DateTime _date = DateTime.now();
  DateTime _claim = DateTime.now();
  DateTime? _due;
  String _kind = 'tax';
  String _account = '5100';
  bool _deductible = true;
  bool _paid = true;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_supplier, _vatNo, _number, _total, _vat, _reason]) {
      c.dispose();
    }
    super.dispose();
  }

  double get _totalV => double.tryParse(_total.text.replaceAll(',', '.')) ?? 0;
  double get _vatV => _vat.text.trim().isEmpty ? double.parse((_totalV - _totalV / 1.15).toStringAsFixed(2)) : double.tryParse(_vat.text.replaceAll(',', '.')) ?? 0;

  Future<void> _pick(DateTime initial, ValueChanged<DateTime> set, {DateTime? first}) async {
    final d = await showDatePicker(context: context, initialDate: initial, firstDate: first ?? DateTime(2018), lastDate: DateTime(2100));
    if (d != null) setState(() => set(d));
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final app = Services.read(context);
    setState(() => _busy = true);
    try {
      await app.api.insert('purchase_invoices', {
        'supplier_name': _supplier.text.trim(),
        'supplier_vat': _vatNo.text.trim().isEmpty ? null : _vatNo.text.trim(),
        'invoice_number': _number.text.trim(),
        'invoice_date': isoDate(_date),
        'claim_date': isoDate(_claim),
        'net_amount': double.parse((_totalV - _vatV).toStringAsFixed(2)),
        'vat_amount': _vatV,
        'invoice_kind': _kind,
        'deductible': _deductible,
        'non_deductible_reason': _deductible ? null : (_reason.text.trim().isEmpty ? 'غير قابلة للخصم' : _reason.text.trim()),
        'paid': _paid,
        'due_date': _paid || _due == null ? null : isoDate(_due!),
        'expense_account': _account,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
      showSnack(context, 'تمت إضافة فاتورة الشراء — ضريبتها تنخصم في إقرارك');
    } catch (e) {
      final m = friendlyError(e);
      if (mounted) showSnack(context, m.contains('مسجلة') ? 'هذي الفاتورة مسجلة من قبل' : m, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('فاتورة شراء')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          LabeledField(label: 'اسم المورد *', controller: _supplier, validator: (v) => (v ?? '').trim().isEmpty ? 'مطلوب' : null),
          const SizedBox(height: 12),
          LabeledField(label: 'الرقم الضريبي للمورد', controller: _vatNo, ltr: true, keyboard: TextInputType.number, maxLength: 15,
              validator: (v) {
                final s = (v ?? '').trim();
                if (s.isEmpty) return _deductible ? 'لخصم الضريبة لازم الرقم الضريبي للمورد' : null;
                return isValidVat(s) ? null : '15 رقم يبدأ وينتهي بـ 3';
              }),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: LabeledField(label: 'رقم الفاتورة *', controller: _number, ltr: true, validator: (v) => (v ?? '').trim().isEmpty ? 'مطلوب' : null)),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(onPressed: () => _pick(_date, (d) => _date = d), icon: const Icon(Icons.event_rounded), label: Text('التاريخ ${isoDate(_date)}')),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: LabeledField(label: 'الإجمالي شامل الضريبة *', controller: _total, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) => (double.tryParse((v ?? '').replaceAll(',', '.')) ?? 0) <= 0 ? 'اكتب الإجمالي' : null)),
            const SizedBox(width: 10),
            Expanded(
              child: TextFormField(
                controller: _vat, textDirection: TextDirection.ltr,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: 'الضريبة', hintText: _totalV > 0 ? (_totalV - _totalV / 1.15).toStringAsFixed(2) : '0.00'),
              ),
            ),
          ]),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('قبل الضريبة: ${money(_totalV - _vatV)} • الضريبة: ${money(_vatV)} $riyal', style: const TextStyle(fontSize: 12)),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _kind,
            decoration: const InputDecoration(labelText: 'نوع المستند'),
            items: const [
              DropdownMenuItem(value: 'tax', child: Text('فاتورة ضريبية (باسم منشأتك)')),
              DropdownMenuItem(value: 'simplified', child: Text('فاتورة مبسطة (أقل من 1000)')),
              DropdownMenuItem(value: 'customs', child: Text('بيان جمركي (استيراد)')),
            ],
            onChanged: (v) => setState(() => _kind = v ?? 'tax'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _account,
            decoration: const InputDecoration(labelText: 'تُسجَّل في حساب'),
            items: const [
              DropdownMenuItem(value: '5100', child: Text('تكلفة المواد / البضاعة')),
              DropdownMenuItem(value: '1300', child: Text('مخزون بضاعة للبيع')),
              DropdownMenuItem(value: '5200', child: Text('مصروفات تشغيلية')),
              DropdownMenuItem(value: '5220', child: Text('إيجار')),
            ],
            onChanged: (v) => setState(() => _account = v ?? '5100'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: () => _pick(_claim, (d) => _claim = d, first: _date), icon: const Icon(Icons.inbox_rounded),
              label: Text('تاريخ استلام الفاتورة ${isoDate(_claim)}')),
          SwitchListTile(contentPadding: EdgeInsets.zero, value: _deductible, onChanged: (v) => setState(() => _deductible = v),
              title: const Text('ضريبتها قابلة للخصم'), subtitle: const Text('مرتبطة بنشاط المنشأة')),
          if (!_deductible) LabeledField(label: 'السبب: ضيافة، استخدام شخصي، سيارة ركاب…', controller: _reason),
          SwitchListTile(contentPadding: EdgeInsets.zero, value: _paid, onChanged: (v) => setState(() => _paid = v), title: const Text('مدفوعة للمورد')),
          if (!_paid)
            OutlinedButton.icon(
              onPressed: () => _pick(_due ?? _date.add(const Duration(days: 30)), (d) => _due = d, first: _date),
              icon: const Icon(Icons.schedule_rounded),
              label: Text(_due == null ? 'تاريخ الاستحقاق (آجل)' : 'تستحق ${isoDate(_due!)}'),
            ),
          const SizedBox(height: 12),
          const ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text('شروط خصم ضريبة المشتريات', style: TextStyle(fontWeight: FontWeight.w700)),
            children: [
              Text('• فاتورة ضريبية من مورد مسجل بالضريبة (المادة 49).\n'
                  '• المبسطة تقبل فقط لتوريد أقل من 1000 ريال (المادة 53).\n'
                  '• تُخصم في إقرار فترة الاستلام وخلال 5 سنوات من التوريد.\n'
                  '• غير مدفوعة 12 شهر من الاستحقاق ⇒ تنعكس الضريبة تلقائياً وتسترد عند الدفع.\n'
                  '• احتفظ بالفاتورة 6 سنوات. الضيافة والاستخدام الشخصي غير قابلة للخصم.\n'
                  '• فواتير المشتريات ما تُرسل للهيئة منك — المورد هو اللي يرسلها.',
                  style: TextStyle(fontSize: 13, height: 1.6)),
            ],
          ),
          const SizedBox(height: 16),
          BusyButton(label: 'إضافة', icon: Icons.add_rounded, busy: _busy, onPressed: _save),
        ]),
      ),
    );
  }
}
