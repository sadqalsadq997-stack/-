// التنبيهات: كل ما يحتاج انتباهك الآن (مخزون، الهيئة، الإقرار، الفواتير المعلّقة)
// الإشعارات نفسها محدودة وبدون إزعاج — هنا القائمة الكاملة.

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../services/alerts.dart';
import '../../ui/widgets.dart';
import '../dashboard/dashboard_screen.dart';
import '../shell/home_shell.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});
  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  bool _busy = false;

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      await Services.read(context).refreshAlerts();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return Scaffold(
      appBar: SectionAppBar(title: 'التنبيهات', actions: [
        IconButton(
          tooltip: 'إعدادات الإشعارات',
          onPressed: () => ShellNav.go(context, 'settings'),
          icon: const Icon(Icons.tune_rounded),
        ),
        IconButton(
          tooltip: 'تحديث',
          onPressed: _busy ? null : _refresh,
          icon: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh_rounded),
        ),
      ]),
      body: ListenableBuilder(
        listenable: app.alerts,
        builder: (context, _) {
          final list = app.alerts.alerts;
          if (list.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(children: const [
                SizedBox(height: 80),
                EmptyState(icon: Icons.notifications_none_rounded, title: 'كل شيء تمام', body: 'ما فيه شيء يحتاج انتباهك الآن'),
              ]),
            );
          }
          final groups = <String, List<AppAlert>>{};
          for (final a in list) {
            groups.putIfAbsent(a.critical ? 'عاجل' : a.severity == 'warning' ? 'يحتاج متابعة' : 'للعلم', () => []).add(a);
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
              children: [
                if (!app.connectivity.online)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text('بدون إنترنت — تنبيهات السيرفر من آخر تحديث', style: TextStyle(fontSize: 12)),
                  ),
                for (final g in groups.entries) ...[
                  SectionTitle('${g.key} (${g.value.length})'),
                  for (final a in g.value) Padding(padding: const EdgeInsets.only(bottom: 6), child: AlertCard(alert: a)),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
