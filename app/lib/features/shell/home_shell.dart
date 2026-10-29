// ══════════════════════════════════════════════════════════════════
// الهيكل الرئيسي: قائمة جانبية (كمبيوتر/تابلت) أو شريط سفلي (جوال)
// الأقسام حسب صلاحية المستخدم (نفس الموقع)
// ══════════════════════════════════════════════════════════════════

import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../core/permissions.dart';
import '../../core/theme.dart';
import '../../ui/widgets.dart';
import '../accounting/accounting_screen.dart';
import '../alerts/alerts_screen.dart';
import '../auth/auth_screens.dart';
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../expenses/expenses_screen.dart';
import '../inventory/inventory_screen.dart';
import '../orders/orders_screen.dart';
import '../pos/pos_screen.dart';
import '../products/products_screen.dart';
import '../purchases/purchases_screen.dart';
import '../settings/settings_screen.dart';
import '../zatca/zatca_screen.dart';

class Section {
  const Section(this.id, this.label, this.icon, this.path, this.builder);
  final String id;
  final String label;
  final IconData icon;
  final String? path; // null = متاح للكل
  final WidgetBuilder builder;
}

final allSections = <Section>[
  Section('dashboard', 'لوحة التحكم', Icons.space_dashboard_rounded, '/', (_) => const DashboardScreen()),
  Section('pos', 'نقطة البيع', Icons.point_of_sale_rounded, '/pos', (_) => const PosScreen()),
  Section('orders', 'الفواتير', Icons.receipt_long_rounded, '/orders', (_) => const OrdersScreen()),
  Section('products', 'المنتجات', Icons.inventory_2_rounded, '/products', (_) => const ProductsScreen()),
  Section('inventory', 'المخزون', Icons.warehouse_rounded, '/inventory', (_) => const InventoryScreen()),
  Section('customers', 'العملاء', Icons.people_alt_rounded, '/customers', (_) => const CustomersScreen()),
  Section('purchases', 'المشتريات', Icons.shopping_bag_rounded, '/suppliers', (_) => const PurchasesScreen()),
  Section('expenses', 'المصروفات', Icons.payments_rounded, '/expenses', (_) => const ExpensesScreen()),
  Section('accounting', 'المحاسبة', Icons.account_balance_rounded, '/accounting', (_) => const AccountingScreen()),
  Section('zatca', 'الفوترة الإلكترونية', Icons.verified_user_rounded, '/zatca-admin', (_) => const ZatcaScreen()),
  Section('alerts', 'التنبيهات', Icons.notifications_rounded, null, (_) => const AlertsScreen()),
  Section('settings', 'الإعدادات', Icons.settings_rounded, null, (_) => const SettingsScreen()),
];

/// يفتح قسم من أي مكان (تنبيه، زر…)
class ShellNav extends InheritedWidget {
  const ShellNav({super.key, required this.open, required this.current, required super.child});
  final void Function(String id) open;
  final String current;
  static void go(BuildContext context, String id) => context.getInheritedWidgetOfExactType<ShellNav>()?.open(id);
  /// القسم الظاهر الآن (الأقسام الثانية تبقى بالذاكرة لكن مخفية)
  static String? currentOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ShellNav>()?.current;
  @override
  bool updateShouldNotify(ShellNav oldWidget) => current != oldWidget.current;
}

const routeToSection = {
  '/inventory': 'inventory', '/zatca': 'zatca', '/purchases': 'purchases', '/vat': 'accounting', '/settings': 'settings',
  '/orders': 'orders', '/pos': 'pos', '/products': 'products', '/customers': 'customers', '/expenses': 'expenses',
};

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  String _current = '';
  final Map<String, Widget> _built = {};
  bool _askedBranch = false;
  bool _askedNotify = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final app = Services.of(context);
    app.alerts.onTap = (route) {
      final id = routeToSection[route];
      if (id != null) _open(id);
    };
    if (_current.isEmpty) {
      final op = app.session.operator;
      final r = normalizeRole(op?.role);
      _current = (r == 'cashier' || r == 'waiter' || r == 'employee') && (op?.can('/pos') ?? false) ? 'pos' : 'dashboard';
      if (!_visible(app).any((s) => s.id == _current)) _current = _visible(app).first.id;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _firstRunPrompts());
  }

  List<Section> _visible(AppServices app) {
    final op = app.session.operator;
    return allSections.where((s) => s.path == null || (op?.can(s.path!) ?? false)).toList();
  }

  void _open(String id) {
    if (!mounted) return;
    setState(() => _current = id);
  }

  Future<void> _firstRunPrompts() async {
    if (!mounted) return;
    final app = Services.read(context);
    if (!app.tenantReady) return;
    if (!_askedBranch && app.needsBranchChoice) {
      _askedBranch = true;
      await chooseBranchDialog(context);
    }
    if (!mounted) return;
    if (!_askedNotify && !app.alerts.permissionAsked) {
      _askedNotify = true;
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          icon: const Icon(Icons.notifications_active_rounded, color: Brand.sage, size: 36),
          title: const Text('تفعيل التنبيهات المهمة', style: TextStyle(fontWeight: FontWeight.w900)),
          content: const Text('نخبرك فقط بالأشياء المهمة: صنف قارب على النفاد، فاتورة ما وصلت للهيئة، موعد الإقرار، أو انتهاء الاشتراك.\n'
              'بدون إزعاج: حد أقصى يومي وساعات هدوء بالليل، وتقدر تتحكم فيها من الإعدادات.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('لاحقاً')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('تفعيل')),
          ],
        ),
      );
      if (ok == true) {
        await app.alerts.requestPermission();
      } else {
        app.alerts.permissionAsked = true;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app, app.connectivity, app.sales, app.alerts, app.catalog]),
      builder: (context, _) {
        final sections = _visible(app);
        if (!sections.any((s) => s.id == _current)) _current = sections.first.id;
        final current = sections.firstWhere((s) => s.id == _current);
        _built.putIfAbsent(current.id, () => current.builder(context));
        final width = MediaQuery.sizeOf(context).width;
        final wide = width >= 720;
        final stack = IndexedStack(
          index: _built.keys.toList().indexOf(current.id),
          children: _built.values.toList(),
        );
        final body = Column(children: [
          OfflineBanner(online: app.connectivity.online, pending: app.sales.pendingCount),
          if (!app.tenantReady) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: stack),
        ]);

        return ShellNav(
          open: _open,
          current: current.id,
          child: wide
              ? Scaffold(
                  body: Row(children: [
                    _SideRail(sections: sections, current: current.id, onTap: _open, extended: width >= 1180),
                    Expanded(child: body),
                  ]),
                )
              : _PhoneShell(sections: sections, current: current, onTap: _open, body: body),
        );
      },
    );
  }
}

class _SideRail extends StatelessWidget {
  const _SideRail({required this.sections, required this.current, required this.onTap, required this.extended});
  final List<Section> sections;
  final String current;
  final ValueChanged<String> onTap;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final op = app.session.operator;
    final alertCount = app.alerts.alerts.where((a) => a.severity != 'info').length;
    final bg = Theme.of(context).brightness == Brightness.dark ? const Color(0xFF101916) : Brand.ink;
    return Container(
      width: extended ? 236 : 86,
      color: bg,
      child: SafeArea(
        child: Column(children: [
          const SizedBox(height: 14),
          extended ? const FelsyLogo(size: 34, light: true) : const FelsyLogo(size: 38, withText: false),
          const SizedBox(height: 10),
          if (extended)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Text(app.session.account?.name ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontWeight: FontWeight.w700, fontSize: 13)),
            ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              children: [
                for (final s in sections)
                  _RailItem(section: s, selected: s.id == current, extended: extended, onTap: () => onTap(s.id),
                      badge: s.id == 'alerts' ? alertCount : s.id == 'orders' ? app.sales.pendingCount : 0),
              ],
            ),
          ),
          const Divider(color: Colors.white24, height: 1),
          ListTile(
            dense: true,
            leading: const Icon(Icons.lock_rounded, color: Colors.white70),
            title: extended ? Text(op?.displayName ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)) : null,
            subtitle: extended ? Text('اضغط للقفل', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11)) : null,
            onTap: app.session.lock,
          ),
          const SizedBox(height: 6),
        ]),
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({required this.section, required this.selected, required this.extended, required this.onTap, this.badge = 0});
  final Section section;
  final bool selected;
  final bool extended;
  final VoidCallback onTap;
  final int badge;
  @override
  Widget build(BuildContext context) {
    final icon = Badge(
      isLabelVisible: badge > 0,
      label: Text('$badge'),
      child: Icon(section.icon, color: selected ? Colors.white : Colors.white70, size: 22),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: selected ? Brand.sage : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Tooltip(
            message: extended ? '' : section.label,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: extended ? 12 : 0, vertical: 11),
              child: extended
                  ? Row(children: [
                      icon,
                      const SizedBox(width: 12),
                      Expanded(child: Text(section.label, style: TextStyle(color: Colors.white.withValues(alpha: selected ? 1 : 0.82), fontWeight: FontWeight.w700))),
                    ])
                  : Center(child: icon),
            ),
          ),
        ),
      ),
    );
  }
}

class _PhoneShell extends StatelessWidget {
  const _PhoneShell({required this.sections, required this.current, required this.onTap, required this.body});
  final List<Section> sections;
  final Section current;
  final ValueChanged<String> onTap;
  final Widget body;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    const primaryIds = ['dashboard', 'pos', 'orders'];
    final primary = sections.where((s) => primaryIds.contains(s.id)).toList();
    final more = sections.where((s) => !primaryIds.contains(s.id)).toList();
    final inMore = more.any((s) => s.id == current.id);
    final idx = inMore ? primary.length : primary.indexWhere((s) => s.id == current.id);
    final alertCount = app.alerts.alerts.where((a) => a.severity != 'info').length;
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: idx < 0 ? 0 : idx,
        onDestinationSelected: (i) {
          if (i < primary.length) {
            onTap(primary[i].id);
          } else {
            unawaited(_showMore(context, more));
          }
        },
        destinations: [
          for (final s in primary)
            NavigationDestination(
              icon: Badge(isLabelVisible: s.id == 'orders' && app.sales.pendingCount > 0, label: Text('${app.sales.pendingCount}'), child: Icon(s.icon)),
              label: s.label,
            ),
          NavigationDestination(
            icon: Badge(isLabelVisible: alertCount > 0, label: Text('$alertCount'), child: const Icon(Icons.apps_rounded)),
            label: inMore ? current.label : 'المزيد',
          ),
        ],
      ),
    );
  }

  Future<void> _showMore(BuildContext context, List<Section> more) async {
    final app = Services.read(context);
    final id = await showModalBottomSheet<String>(
      context: context,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              leading: const Icon(Icons.storefront_rounded),
              title: Text(app.session.account?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text(app.session.operator?.displayName ?? ''),
              trailing: IconButton(icon: const Icon(Icons.lock_rounded), tooltip: 'قفل', onPressed: () {
                Navigator.pop(c);
                app.session.lock();
              }),
            ),
            const Divider(),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3,
              childAspectRatio: 1.15,
              children: [
                for (final s in more)
                  InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => Navigator.pop(c, s.id),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: Theme.of(c).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
                        child: Icon(s.icon, color: Theme.of(c).colorScheme.primary),
                      ),
                      const SizedBox(height: 6),
                      Text(s.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700), maxLines: 2),
                    ]),
                  ),
              ],
            ),
          ]),
        ),
      ),
    );
    if (id != null) onTap(id);
  }
}

/// عنوان كل قسم (مع زر المزامنة والتنبيهات)
class SectionAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SectionAppBar({super.key, required this.title, this.actions = const [], this.bottom});
  final String title;
  final List<Widget> actions;
  final PreferredSizeWidget? bottom;

  @override
  Size get preferredSize => Size.fromHeight(kToolbarHeight + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return AppBar(
      title: Text(title),
      bottom: bottom,
      actions: [
        ...actions,
        ListenableBuilder(
          listenable: Listenable.merge([app.catalog, app.sales]),
          builder: (_, _) => IconButton(
            tooltip: 'مزامنة الآن',
            onPressed: app.catalog.syncing || app.sales.flushing ? null : () => app.syncNow(),
            icon: app.catalog.syncing || app.sales.flushing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.sync_rounded),
          ),
        ),
        const SizedBox(width: 4),
      ],
    );
  }
}
