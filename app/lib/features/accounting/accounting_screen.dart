// ══════════════════════════════════════════════════════════════════
// المحاسبة
//  • الإقرار الضريبي بخانات نموذج الهيئة (15%، صفرية، صادرات، معفاة،
//    مشتريات، استيراد، تعديلات 12 شهر) — للرفع اليدوي في بوابة الهيئة
//  • قائمة الدخل وميزان المراجعة من القيود التلقائية (مبيعات، مرتجعات،
//    مشتريات، مصروفات، تكلفة) + السندات اليدوية
// آخر نتيجة تنحفظ بالجهاز للاطلاع بدون إنترنت.
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class Period {
  const Period(this.id, this.label, this.from, this.to);
  final String id;
  final String label;
  final DateTime from;
  final DateTime to;
}

List<Period> quarters() {
  final now = DateTime.now();
  const names = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
  final out = <Period>[];
  for (var i = 0; i < 6; i++) {
    final q = (now.month - 1) ~/ 3 - i;
    final y = now.year + (q < 0 ? ((q - 3) ~/ 4) : 0);
    final qq = ((q % 4) + 4) % 4;
    final from = DateTime(y, qq * 3 + 1, 1);
    final to = DateTime(y, qq * 3 + 4, 0);
    out.add(Period('$y-Q${qq + 1}', 'الربع ${names[qq]} $y', from, to));
  }
  return out;
}

class AccountingScreen extends StatefulWidget {
  const AccountingScreen({super.key});
  @override
  State<AccountingScreen> createState() => _AccountingScreenState();
}

class _AccountingScreenState extends State<AccountingScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  final _periods = quarters();
  late Period _p = _periods[1]; // الربع السابق (المستحق تقديمه)

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _custom() async {
    final r = await showDateRangePicker(context: context, firstDate: DateTime(2018), lastDate: DateTime.now(),
        initialDateRange: DateTimeRange(start: _p.from, end: _p.to.isAfter(DateTime.now()) ? DateTime.now() : _p.to));
    if (r != null) setState(() => _p = Period('custom', '${isoDate(r.start)} ← ${isoDate(r.end)}', r.start, r.end));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: SectionAppBar(
        title: 'المحاسبة',
        bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'الإقرار الضريبي'), Tab(text: 'قائمة الدخل'), Tab(text: 'ميزان المراجعة')]),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _periods.any((x) => x.id == _p.id) ? _p.id : null,
                isDense: true,
                decoration: const InputDecoration(labelText: 'الفترة', isDense: true),
                hint: Text(_p.label),
                items: [for (final x in _periods) DropdownMenuItem(value: x.id, child: Text(x.label))],
                onChanged: (v) => setState(() => _p = _periods.firstWhere((x) => x.id == v)),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(onPressed: _custom, icon: const Icon(Icons.date_range_rounded), label: const Text('فترة مخصصة')),
          ]),
        ),
        Expanded(
          child: TabBarView(controller: _tabs, children: [
            _VatReturn(key: ValueKey('vat${_p.id}${_p.from}'), period: _p),
            _Income(key: ValueKey('inc${_p.id}${_p.from}'), period: _p),
            _Trial(key: ValueKey('tb${_p.id}${_p.from}'), period: _p),
          ]),
        ),
      ]),
    );
  }
}

/// تحميل مع حفظ آخر نتيجة للاطلاع بدون إنترنت
Future<Map<String, dynamic>> _cached(BuildContext context, String key, Future<Object?> Function() load) async {
  final app = Services.read(context);
  try {
    final r = asMap(await load());
    await app.store.write('acc_$key', r);
    return r;
  } on ApiException catch (e) {
    if (!e.isNetwork) rethrow;
    final c = await app.store.readMap('acc_$key');
    if (c != null) return {...c, '_offline': true};
    rethrow;
  }
}

class _VatReturn extends StatelessWidget {
  const _VatReturn({super.key, required this.period});
  final Period period;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final key = 'vat_${isoDate(period.from)}_${isoDate(period.to)}';
    return AsyncView<Map<String, dynamic>>(
      load: () => _cached(context, key, () => app.api.rpc('vat_return', {'p_from': isoDate(period.from), 'p_to': isoDate(period.to)})),
      builder: (context, r, _) {
        final lines = vatLines(r);
        final due = toD(r['net_due']);
        return ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
          if (r['_offline'] == true) const Text('بدون إنترنت — آخر نسخة محفوظة', style: TextStyle(color: Brand.warning, fontWeight: FontWeight.w700)),
          Row(children: [
            Expanded(child: StatTile(label: 'ضريبة المبيعات', value: toD(r['output_vat']), isMoney: true, icon: Icons.north_east_rounded)),
            const SizedBox(width: 8),
            Expanded(child: StatTile(label: 'ضريبة المشتريات', value: toD(r['input_vat']), isMoney: true, icon: Icons.south_west_rounded, color: Brand.teal)),
          ]),
          const SizedBox(height: 8),
          StatTile(label: due >= 0 ? 'صافي المستحق للسداد' : 'لك استرداد', value: due.abs(), isMoney: true, icon: Icons.account_balance_rounded,
              color: due >= 0 ? Brand.warning : Brand.success),
          const SizedBox(height: 12),
          FCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 10, 12, 8),
                child: Row(children: [
                  SizedBox(width: 26, child: Text('#', style: TextStyle(fontWeight: FontWeight.w700))),
                  Expanded(child: Text('البند', style: TextStyle(fontWeight: FontWeight.w700))),
                  SizedBox(width: 90, child: Text('المبلغ', textAlign: TextAlign.left, style: TextStyle(fontWeight: FontWeight.w700))),
                  SizedBox(width: 78, child: Text('التعديلات', textAlign: TextAlign.left, style: TextStyle(fontWeight: FontWeight.w700))),
                  SizedBox(width: 80, child: Text('الضريبة', textAlign: TextAlign.left, style: TextStyle(fontWeight: FontWeight.w700))),
                ]),
              ),
              const Divider(),
              for (final l in lines)
                Container(
                  color: l.total ? Theme.of(context).colorScheme.surfaceContainer : null,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  child: Row(children: [
                    SizedBox(width: 26, child: Text('${l.no}')),
                    Expanded(child: Text(l.label, style: TextStyle(fontWeight: l.total ? FontWeight.w900 : FontWeight.w400, fontSize: 13))),
                    SizedBox(width: 90, child: Text(money(l.amount), textAlign: TextAlign.left, style: const TextStyle(fontSize: 13))),
                    SizedBox(width: 78, child: Text(money(l.adj), textAlign: TextAlign.left, style: const TextStyle(fontSize: 13))),
                    SizedBox(width: 80, child: Text(money(l.vat), textAlign: TextAlign.left, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
                  ]),
                ),
            ]),
          ),
          if (toI(r['input_reversal_count']) > 0 || toI(r['input_recovery_count']) > 0)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('تعديلات قاعدة 12 شهر: عكس ${money(toD(r['input_reversal_vat']))} لـ ${toI(r['input_reversal_count'])} فاتورة غير مدفوعة، '
                  'واسترداد ${money(toD(r['input_recovery_vat']))} لـ ${toI(r['input_recovery_count'])} فاتورة دُفعت.', style: const TextStyle(fontSize: 12)),
            ),
          if (toD(r['sales_out_of_scope']) > 0)
            Text('مبيعات خارج نطاق الضريبة (${money(toD(r['sales_out_of_scope']))}) لا تُدرج في الإقرار.', style: const TextStyle(fontSize: 12)),
          const SizedBox(height: 10),
          const Text('انسخ الأرقام لخانات الإقرار في بوابة الهيئة (zatca.gov.sa) — الموعد آخر يوم من الشهر التالي لنهاية الفترة. '
              'الإقرار يُرفع يدوياً (ما فيه ربط آلي عند الهيئة).', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => ShellNav.go(context, 'purchases'),
                icon: const Icon(Icons.shopping_bag_rounded),
                label: const Text('فواتير المشتريات'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: () => _sharePdf(context, period, lines, due, r),
                icon: const Icon(Icons.picture_as_pdf_rounded),
                label: const Text('PDF / طباعة'),
              ),
            ),
          ]),
        ]);
      },
    );
  }
}

class VatLine {
  const VatLine(this.no, this.label, this.amount, this.adj, this.vat, {this.total = false});
  final int no;
  final String label;
  final double amount;
  final double adj;
  final double vat;
  final bool total;
}

List<VatLine> vatLines(Map<String, dynamic> r) {
  double v(String k) => toD(r[k]);
  return [
    VatLine(1, 'المبيعات الخاضعة للنسبة الأساسية 15%', v('sales_standard'), -v('returns_standard'), v('sales_vat') - v('returns_vat')),
    const VatLine(2, 'المبيعات للمواطنين (الصحة والتعليم الخاص)', 0, 0, 0),
    VatLine(3, 'المبيعات المحلية الخاضعة للنسبة الصفرية', v('sales_zero_rated'), -v('returns_zero_rated'), 0),
    VatLine(4, 'الصادرات', v('sales_exports'), -v('returns_exports'), 0),
    VatLine(5, 'المبيعات المعفاة', v('sales_exempt'), -v('returns_exempt'), 0),
    VatLine(6, 'إجمالي المبيعات', v('sales_standard') + v('sales_zero_rated') + v('sales_exports') + v('sales_exempt'),
        -(v('returns_standard') + v('returns_zero_rated') + v('returns_exports') + v('returns_exempt')), v('output_vat'), total: true),
    VatLine(7, 'المشتريات الخاضعة للنسبة الأساسية 15%', v('purchases_net') - v('imports_net'), v('input_recovery_net') - v('input_reversal_net'),
        v('purchases_vat') - v('imports_vat') - v('input_reversal_vat') + v('input_recovery_vat')),
    VatLine(8, 'الاستيرادات الخاضعة للضريبة (المسددة في الجمارك)', v('imports_net'), 0, v('imports_vat')),
    const VatLine(9, 'الاستيرادات الخاضعة للاحتساب العكسي', 0, 0, 0),
    const VatLine(10, 'المشتريات الخاضعة للنسبة الصفرية', 0, 0, 0),
    const VatLine(11, 'المشتريات المعفاة', 0, 0, 0),
    VatLine(12, 'إجمالي المشتريات', v('purchases_net'), v('input_recovery_net') - v('input_reversal_net'), v('input_vat'), total: true),
  ];
}

Future<void> _sharePdf(BuildContext context, Period p, List<VatLine> lines, double due, Map<String, dynamic> r) async {
  final app = Services.read(context);
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/Cairo-Regular.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
  final riyalFont = pw.Font.ttf(await rootBundle.load('assets/fonts/SaudiRiyal-Regular.ttf'));
  final seller = app.catalog.seller;
  final doc = pw.Document();
  final th = pw.TextStyle(font: bold, fontSize: 10);
  final td = pw.TextStyle(font: regular, fontSize: 10);
  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(32),
    theme: pw.ThemeData.withFont(base: regular, bold: bold, fontFallback: [riyalFont]),
    textDirection: pw.TextDirection.rtl,
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Text('إقرار ضريبة القيمة المضافة', style: pw.TextStyle(font: bold, fontSize: 18)),
      pw.Text('${seller.name} — الرقم الضريبي ${seller.vatNumber}', style: td),
      pw.Text('الفترة: ${isoDate(p.from)} إلى ${isoDate(p.to)}', style: td),
      pw.SizedBox(height: 12),
      pw.TableHelper.fromTextArray(
        headers: ['#', 'البند', 'المبلغ', 'التعديلات', 'الضريبة'],
        headerStyle: th,
        cellStyle: td,
        headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
        columnWidths: {0: const pw.FixedColumnWidth(20), 1: const pw.FlexColumnWidth(4), 2: const pw.FlexColumnWidth(1.4), 3: const pw.FlexColumnWidth(1.4), 4: const pw.FlexColumnWidth(1.4)},
        cellAlignments: {2: pw.Alignment.centerLeft, 3: pw.Alignment.centerLeft, 4: pw.Alignment.centerLeft},
        data: [for (final l in lines) ['${l.no}', l.label, money(l.amount), money(l.adj), money(l.vat)]],
      ),
      pw.SizedBox(height: 14),
      pw.Container(
        padding: const pw.EdgeInsets.all(10),
        decoration: pw.BoxDecoration(border: pw.Border.all(width: 2)),
        child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Text(due >= 0 ? 'صافي الضريبة المستحقة للسداد' : 'صافي الضريبة القابلة للاسترداد', style: pw.TextStyle(font: bold, fontSize: 13)),
          pw.Text('${money(due.abs())} $riyal', style: pw.TextStyle(font: bold, fontSize: 13)),
        ]),
      ),
      pw.SizedBox(height: 10),
      pw.Text('مُعد من نظام فلسي كمساعدة لتعبئة الإقرار في بوابة هيئة الزكاة والضريبة والجمارك. راجع الأرقام قبل التقديم. '
          'المبيعات: ${toI(r['sales_count'])} فاتورة • المرتجعات: ${toI(r['returns_count'])} • المشتريات: ${toI(r['purchases_count'])}.',
          style: pw.TextStyle(font: regular, fontSize: 8, color: PdfColors.grey700)),
    ]),
  ));
  await Printing.layoutPdf(onLayout: (_) async => doc.save(), name: 'VAT-${isoDate(p.from)}');
}

class _Income extends StatelessWidget {
  const _Income({super.key, required this.period});
  final Period period;
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return AsyncView<Map<String, dynamic>>(
      load: () => _cached(context, 'inc_${isoDate(period.from)}_${isoDate(period.to)}',
          () => app.api.rpc('income_statement', {'p_from': isoDate(period.from), 'p_to': isoDate(period.to)})),
      builder: (context, r, _) {
        final net = toD(r['net_profit']);
        Widget row(String l, double v, {bool bold = false, Color? color}) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              child: Row(children: [
                Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w400, fontSize: bold ? 16 : 14))),
                Text('${money(v)} $riyal', style: TextStyle(fontWeight: FontWeight.w900, color: color, fontSize: bold ? 17 : 14)),
              ]),
            );
        return ListView(padding: const EdgeInsets.all(12), children: [
          if (r['_offline'] == true) const Text('بدون إنترنت — آخر نسخة محفوظة', style: TextStyle(color: Brand.warning, fontWeight: FontWeight.w700)),
          FCard(
            child: Column(children: [
              row('إجمالي الإيرادات (صافي بدون الضريبة)', toD(r['revenue']), bold: true, color: Brand.success),
              row('تكلفة البضاعة المباعة', -toD(r['cogs']), color: Brand.danger),
              const Divider(),
              row('مجمل الربح', toD(r['gross_profit']), bold: true),
              row('المصروفات التشغيلية', -toD(r['expenses']), color: Brand.warning),
              const Divider(),
              row(net >= 0 ? 'صافي الربح' : 'صافي الخسارة', net, bold: true, color: net >= 0 ? Brand.success : Brand.danger),
            ]),
          ),
          const SizedBox(height: 10),
          const Text('من القيود التلقائية: المبيعات والمرتجعات وتكلفة الأصناف المتتبعة والمشتريات والمصروفات، بالإضافة للسندات اليدوية من الموقع.',
              style: TextStyle(fontSize: 12)),
        ]);
      },
    );
  }
}

class _Trial extends StatelessWidget {
  const _Trial({super.key, required this.period});
  final Period period;
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return AsyncView<Map<String, dynamic>>(
      load: () => _cached(context, 'tb_${isoDate(period.from)}_${isoDate(period.to)}',
          () => app.api.rpc('trial_balance', {'p_from': isoDate(period.from), 'p_to': isoDate(period.to)})),
      builder: (context, r, _) {
        final rows = asList(r['accounts']);
        final d = toD(r['total_debit']), c = toD(r['total_credit']);
        final balanced = (d - c).abs() < 0.01;
        return ListView(padding: const EdgeInsets.all(12), children: [
          if (rows.isEmpty) const EmptyState(icon: Icons.scale_outlined, title: 'لا توجد قيود في هذي الفترة'),
          for (final a in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: FCard(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(children: [
                  SizedBox(width: 44, child: Text(toS(a['code']) ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                  Expanded(child: Text(toS(a['name']) ?? '')),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text('مدين ${money(toD(a['debit']))}', style: const TextStyle(fontSize: 12)),
                    Text('دائن ${money(toD(a['credit']))}', style: const TextStyle(fontSize: 12)),
                  ]),
                ]),
              ),
            ),
          if (rows.isNotEmpty)
            FCard(
              color: (balanced ? Brand.success : Brand.danger).withValues(alpha: 0.07),
              child: Row(children: [
                Icon(balanced ? Icons.check_circle_rounded : Icons.error_rounded, color: balanced ? Brand.success : Brand.danger),
                const SizedBox(width: 8),
                Expanded(child: Text(balanced ? 'الميزان متوازن' : 'الميزان غير متوازن', style: const TextStyle(fontWeight: FontWeight.w900))),
                Text('${money(d)} / ${money(c)}'),
              ]),
            ),
        ]);
      },
    );
  }
}
