// المصروفات (إيجار، رواتب، كهرباء…) — القيد المحاسبي يتسجل تلقائياً

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

const _categories = ['إيجار', 'رواتب', 'كهرباء وماء', 'اتصالات وإنترنت', 'صيانة', 'تسويق', 'نقل', 'رسوم حكومية', 'أخرى'];

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});
  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  int _gen = 0;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return Scaffold(
      appBar: const SectionAppBar(title: 'المصروفات'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (!app.connectivity.online) {
            showSnack(context, 'تسجيل المصروفات يحتاج إنترنت', error: true);
            return;
          }
          final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => const _ExpenseSheet());
          if (ok == true) setState(() => _gen++);
        },
        icon: const Icon(Icons.add_rounded),
        label: const Text('مصروف'),
      ),
      body: AsyncView<List<Map<String, dynamic>>>(
        key: ValueKey(_gen),
        load: () => app.api.select('expenses', columns: 'id,title,amount,category,payment_method,created_at,notes', order: 'created_at.desc', limit: 300),
        builder: (context, rows, reload) {
          if (rows.isEmpty) {
            return ListView(children: const [SizedBox(height: 60), EmptyState(icon: Icons.payments_outlined, title: 'لا توجد مصروفات')]);
          }
          final k = DateTime.now().toUtc().add(const Duration(hours: 3));
          final month = rows.where((r) {
            final t = DateTime.tryParse('${r['created_at']}')?.toUtc().add(const Duration(hours: 3));
            return t != null && t.year == k.year && t.month == k.month;
          }).fold<double>(0, (s, r) => s + toD(r['amount']));
          return ListView(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
            children: [
              StatTile(label: 'مصروفات هذا الشهر', value: month, isMoney: true, icon: Icons.calendar_month_rounded),
              const SizedBox(height: 10),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: FCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(toS(r['title']) ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${toS(r['category']) ?? ''} • ${payLabels[r['payment_method']] ?? r['payment_method'] ?? ''} • ${dateKsa(DateTime.tryParse('${r['created_at']}') ?? DateTime.now())}',
                              style: const TextStyle(fontSize: 12)),
                        ]),
                      ),
                      Text('${money(toD(r['amount']))} $riyal', style: const TextStyle(fontWeight: FontWeight.w900)),
                      IconButton(
                        tooltip: 'حذف',
                        onPressed: () async {
                          if (!await confirm(context, 'حذف المصروف', 'يحذف المصروف وقيده المحاسبي', ok: 'حذف', danger: true)) return;
                          try {
                            await app.api.delete('expenses', {'id': 'eq.${r['id']}'});
                            await reload();
                          } catch (e) {
                            if (context.mounted) showSnack(context, friendlyError(e), error: true);
                          }
                        },
                        icon: const Icon(Icons.delete_outline_rounded),
                      ),
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

class _ExpenseSheet extends StatefulWidget {
  const _ExpenseSheet();
  @override
  State<_ExpenseSheet> createState() => _ExpenseSheetState();
}

class _ExpenseSheetState extends State<_ExpenseSheet> {
  final _title = TextEditingController();
  final _amount = TextEditingController();
  String _cat = _categories.first;
  String _pay = 'نقدي'; // نفس قيم صفحة المصروفات في الموقع
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final a = double.tryParse(_amount.text.replaceAll(',', '.')) ?? 0;
    if (_title.text.trim().isEmpty || a <= 0) {
      showSnack(context, 'اكتب الوصف والمبلغ', error: true);
      return;
    }
    final app = Services.read(context);
    setState(() => _busy = true);
    try {
      await app.api.insert('expenses', {'title': _title.text.trim(), 'amount': a, 'category': _cat, 'payment_method': _pay, 'branch_id': app.branchId}, columns: 'id');
      if (mounted) Navigator.pop(context, true);
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
          Text('مصروف جديد', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          LabeledField(label: 'الوصف', controller: _title, autofocus: true),
          const SizedBox(height: 10),
          LabeledField(label: 'المبلغ', controller: _amount, ltr: true, keyboard: const TextInputType.numberWithOptions(decimal: true)),
          const SizedBox(height: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final c in _categories) ChoiceChip(label: Text(c), selected: _cat == c, onSelected: (_) => setState(() => _cat = c)),
          ]),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'نقدي', label: Text('نقداً')),
              ButtonSegment(value: 'بطاقة', label: Text('بطاقة')),
              ButtonSegment(value: 'تحويل', label: Text('تحويل')),
            ],
            selected: {_pay},
            onSelectionChanged: (v) => setState(() => _pay = v.first),
          ),
          const SizedBox(height: 14),
          BusyButton(label: 'حفظ', busy: _busy, onPressed: _save, icon: Icons.save_rounded),
        ]),
      );
}
