// لوحة التحكم: مبيعات الفترة، طرق الدفع، الأكثر مبيعاً، المبيعات بالساعة،
// والتنبيهات المهمة. بدون إنترنت: أرقام اليوم من فواتير الجهاز.

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../services/alerts.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _range = 'today';
  Map<String, dynamic>? _data;
  bool _loading = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_data == null && !_loading) _load();
  }

  (DateTime, DateTime) _bounds() {
    // حدود الأيام بتوقيت السعودية
    final k = DateTime.now().toUtc().add(const Duration(hours: 3));
    final startToday = DateTime.utc(k.year, k.month, k.day).subtract(const Duration(hours: 3));
    return switch (_range) {
      'yesterday' => (startToday.subtract(const Duration(days: 1)), startToday),
      'week' => (startToday.subtract(const Duration(days: 6)), DateTime.now().toUtc().add(const Duration(minutes: 1))),
      'month' => (DateTime.utc(k.year, k.month, 1).subtract(const Duration(hours: 3)), DateTime.now().toUtc().add(const Duration(minutes: 1))),
      _ => (startToday, DateTime.now().toUtc().add(const Duration(minutes: 1))),
    };
  }

  Future<void> _load() async {
    final app = Services.read(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    final (from, to) = _bounds();
    try {
      final r = asMap(await app.api.rpc('app_dashboard', {'p_from': from.toIso8601String(), 'p_to': to.toIso8601String(), 'p_branch': null}));
      await app.store.write('dash_$_range', r);
      if (mounted) setState(() => _data = r);
    } catch (e) {
      final cached = await app.store.readMap('dash_$_range');
      if (mounted) {
        setState(() {
          _data = cached;
          _error = friendlyError(e);
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.sales, app.alerts, app.catalog, app.connectivity]),
      builder: (context, _) => _body(context, app),
    );
  }

  Widget _body(BuildContext context, AppServices app) {
    final s = Theme.of(context).colorScheme;
    final d = _data ?? const {};
    final local = app.sales.todayLocal();
    final offline = !app.connectivity.online;
    final sales = d.isEmpty && _range == 'today' ? local.total : toD(d['sales']);
    final count = d.isEmpty && _range == 'today' ? local.count : toI(d['count']);
    final vat = d.isEmpty && _range == 'today' ? local.vat : toD(d['vat']);
    final avg = count == 0 ? 0.0 : sales / count;
    final op = app.session.operator;
    final hello = DateTime.now().toUtc().add(const Duration(hours: 3)).hour < 12 ? 'صباح الخير' : 'مساء الخير';

    return Scaffold(
      appBar: SectionAppBar(title: 'لوحة التحكم', actions: [
        IconButton(tooltip: 'تحديث', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
      ]),
      body: RefreshIndicator(
        onRefresh: () async {
          await app.syncNow();
          await _load();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            Text('$hello، ${op?.name ?? ''}'.trim().replaceAll(RegExp(r'،$'), ''), style: Theme.of(context).textTheme.titleLarge),
            Text(app.session.account?.name ?? '', style: TextStyle(color: s.onSurfaceVariant)),
            const SizedBox(height: 14),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'today', label: Text('اليوم')),
                  ButtonSegment(value: 'yesterday', label: Text('أمس')),
                  ButtonSegment(value: 'week', label: Text('7 أيام')),
                  ButtonSegment(value: 'month', label: Text('هذا الشهر')),
                ],
                selected: {_range},
                onSelectionChanged: (v) {
                  setState(() {
                    _range = v.first;
                    _data = null;
                  });
                  _load();
                },
              ),
            ),
            if (_error != null && offline)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_range == 'today' ? 'بدون إنترنت — الأرقام من فواتير هذا الجهاز' : 'بدون إنترنت — آخر أرقام محفوظة',
                    style: const TextStyle(color: Brand.warning, fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            const SizedBox(height: 14),
            LayoutBuilder(builder: (context, c) {
              final cols = c.maxWidth >= 900 ? 4 : 2;
              final tiles = [
                StatTile(label: 'المبيعات', value: sales, isMoney: true, icon: Icons.trending_up_rounded, color: Brand.success),
                StatTile(label: 'عدد الفواتير', value: count, icon: Icons.receipt_long_rounded, color: Brand.info),
                StatTile(label: 'متوسط الفاتورة', value: avg, isMoney: true, icon: Icons.shopping_basket_rounded, color: Brand.teal),
                StatTile(label: 'ضريبة القيمة المضافة', value: vat, isMoney: true, icon: Icons.account_balance_rounded, color: Brand.peach),
              ];
              return GridView.count(
                crossAxisCount: cols, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: cols == 4 ? 1.9 : 1.5,
                children: tiles,
              );
            }),
            const SizedBox(height: 14),
            _StatusRow(),
            const SizedBox(height: 14),
            if (app.alerts.alerts.isNotEmpty) ...[
              SectionTitle('تنبيهات مهمة', icon: Icons.notifications_active_rounded,
                  trailing: TextButton(onPressed: () => ShellNav.go(context, 'alerts'), child: const Text('الكل'))),
              for (final a in app.alerts.alerts.take(3)) Padding(padding: const EdgeInsets.only(bottom: 8), child: AlertCard(alert: a)),
              const SizedBox(height: 6),
            ],
            LayoutBuilder(builder: (context, c) {
              final wide = c.maxWidth >= 820;
              final pay = _PaymentsCard(rows: asList(d['by_payment']));
              final top = _TopCard(rows: asList(d['top']));
              final hours = _HoursCard(rows: asList(d['by_hour']));
              if (wide) {
                return Column(children: [
                  if (_range == 'today' || _range == 'yesterday') ...[hours, const SizedBox(height: 12)],
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: pay), const SizedBox(width: 12), Expanded(child: top)]),
                ]);
              }
              return Column(children: [
                if (_range == 'today' || _range == 'yesterday') ...[hours, const SizedBox(height: 12)],
                pay, const SizedBox(height: 12), top,
              ]);
            }),
            if (toD(d['returns']) > 0 || toD(d['discounts']) > 0) ...[
              const SizedBox(height: 12),
              FCard(
                child: Row(children: [
                  Expanded(child: Text('المرتجعات: ${money(toD(d['returns']))} $riyal (${toI(d['returns_count'])})')),
                  Text('الخصومات: ${money(toD(d['discounts']))} $riyal'),
                ]),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final z = app.catalog.zatca;
    final active = z['status'] == 'active';
    final pending = app.sales.pendingCount;
    final low = app.catalog.products.where((p) => p.lowStock).length;
    Widget pill(IconData i, String t, Color c, VoidCallback? onTap) => Expanded(
          child: FCard(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            onTap: onTap,
            child: Row(children: [
              Icon(i, color: c, size: 22),
              const SizedBox(width: 8),
              Expanded(child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13), maxLines: 2)),
            ]),
          ),
        );
    return Row(children: [
      pill(active ? Icons.verified_user_rounded : Icons.gpp_maybe_rounded,
          active ? 'مربوط بالهيئة${toI(z['pending']) > 0 ? ' • ${toI(z['pending'])} معلّقة' : ''}' : 'الفوترة: المرحلة الأولى',
          active ? Brand.success : Brand.warning, () => ShellNav.go(context, 'zatca')),
      const SizedBox(width: 10),
      pill(pending > 0 ? Icons.cloud_upload_rounded : Icons.cloud_done_rounded, pending > 0 ? '$pending بانتظار الرفع' : 'كل الفواتير مرفوعة',
          pending > 0 ? Brand.warning : Brand.success, () => ShellNav.go(context, 'orders')),
      const SizedBox(width: 10),
      pill(Icons.inventory_rounded, low > 0 ? '$low صنف ناقص' : 'المخزون سليم', low > 0 ? Brand.danger : Brand.success, () => ShellNav.go(context, 'inventory')),
    ]);
  }
}

class AlertCard extends StatelessWidget {
  const AlertCard({super.key, required this.alert});
  final AppAlert alert;
  @override
  Widget build(BuildContext context) {
    final c = alert.critical ? Brand.danger : alert.severity == 'warning' ? Brand.warning : Brand.info;
    return FCard(
      padding: const EdgeInsets.all(12),
      borderColor: c.withValues(alpha: 0.35),
      color: c.withValues(alpha: 0.05),
      onTap: alert.route == null ? null : () {
        final id = routeToSection[alert.route];
        if (id != null) ShellNav.go(context, id);
      },
      child: Row(children: [
        Icon(alert.critical ? Icons.error_rounded : alert.severity == 'warning' ? Icons.warning_amber_rounded : Icons.info_rounded, color: c),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(alert.title, style: const TextStyle(fontWeight: FontWeight.w900)),
            if (alert.body.isNotEmpty) Text(alert.body, style: const TextStyle(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
          ]),
        ),
        if (alert.route != null) const Icon(Icons.chevron_left_rounded),
      ]),
    );
  }
}

class _PaymentsCard extends StatelessWidget {
  const _PaymentsCard({required this.rows});
  final List<Map<String, dynamic>> rows;
  @override
  Widget build(BuildContext context) {
    final total = rows.fold<double>(0, (s, r) => s + toD(r['total']));
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionTitle('طرق الدفع', icon: Icons.credit_card_rounded),
        if (rows.isEmpty) const Text('لا توجد مبيعات بعد'),
        for (final r in rows) ...[
          Row(children: [
            Expanded(child: Text('${payLabels[r['method']] ?? r['method']} (${toI(r['count'])})', style: const TextStyle(fontWeight: FontWeight.w700))),
            Text('${money(toD(r['total']))} $riyal'),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(value: total == 0 ? 0 : toD(r['total']) / total, minHeight: 8),
          ),
          const SizedBox(height: 10),
        ],
      ]),
    );
  }
}

class _TopCard extends StatelessWidget {
  const _TopCard({required this.rows});
  final List<Map<String, dynamic>> rows;
  @override
  Widget build(BuildContext context) => FCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SectionTitle('الأكثر مبيعاً', icon: Icons.local_fire_department_rounded),
          if (rows.isEmpty) const Text('لا توجد مبيعات بعد'),
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(children: [
                CircleAvatar(radius: 13, child: Text('${i + 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900))),
                const SizedBox(width: 10),
                Expanded(child: Text(toS(rows[i]['name']) ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                Text('${qty(toD(rows[i]['qty']))} × • ${money(toD(rows[i]['total']))}'),
              ]),
            ),
        ]),
      );
}

class _HoursCard extends StatelessWidget {
  const _HoursCard({required this.rows});
  final List<Map<String, dynamic>> rows;
  @override
  Widget build(BuildContext context) {
    final values = List<double>.filled(24, 0);
    for (final r in rows) {
      final h = toI(r['h']);
      if (h >= 0 && h < 24) values[h] = toD(r['total']);
    }
    final max = values.fold<double>(0, (a, b) => a > b ? a : b);
    final s = Theme.of(context).colorScheme;
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionTitle('المبيعات حسب الساعة', icon: Icons.schedule_rounded),
        SizedBox(
          height: 120,
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (var h = 0; h < 24; h++)
                Expanded(
                  child: Tooltip(
                    message: '$h:00 — ${money(values[h])}',
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                      Container(
                        height: max == 0 ? 2 : 2 + 98 * values[h] / max,
                        margin: const EdgeInsets.symmetric(horizontal: 1.5),
                        decoration: BoxDecoration(color: values[h] == max && max > 0 ? Brand.teal : s.primary.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(4)),
                      ),
                      const SizedBox(height: 4),
                      Text(h % 3 == 0 ? '$h' : '', style: TextStyle(fontSize: 10, color: s.onSurfaceVariant)),
                    ]),
                  ),
                ),
            ]),
          ),
        ),
      ]),
    );
  }
}
