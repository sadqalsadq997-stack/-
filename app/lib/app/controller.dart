// ══════════════════════════════════════════════════════════════════
// منسّق التطبيق: يربط الخدمات ببعض
//  • بعد فتح النظام: تحميل بيانات المنشأة من الجهاز ⇒ تسجيل الجهاز ⇒
//    مزامنة ⇒ رفع المعلّق ⇒ التنبيهات
//  • كل 3 دقائق وهو متصل: رفع + مزامنة. رجوع النت: رفع فوري.
// ══════════════════════════════════════════════════════════════════

import 'dart:async';

import 'package:flutter/widgets.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/store.dart';
import '../printing/printer.dart';
import '../services/alerts.dart';
import '../services/catalog.dart';
import '../services/connectivity.dart';
import '../services/device.dart';
import '../services/sales.dart';
import '../services/session.dart';

class AppServices extends ChangeNotifier {
  AppServices._(this.api, this.store, this.secure)
      : session = SessionService(api, secure, store),
        connectivity = ConnectivityService(api),
        device = DeviceService(api, store),
        catalog = CatalogService(api, store),
        sales = SalesService(api, store),
        alerts = AlertsService(api, store),
        printer = PrinterService(store);

  static Future<AppServices> create() async {
    final store = await LocalStore.open();
    final s = AppServices._(Api(), store, SecureBox());
    await s.printer.load();
    await s.alerts.init();
    s._wire();
    await s.session.boot();
    return s;
  }

  final Api api;
  final LocalStore store;
  final SecureBox secure;
  final SessionService session;
  final ConnectivityService connectivity;
  final DeviceService device;
  final CatalogService catalog;
  final SalesService sales;
  final AlertsService alerts;
  final PrinterService printer;

  String? _loadedTenant;
  bool tenantReady = false;
  String? setupError;
  Timer? _syncTimer;
  Timer? _alertTimer;
  StreamSubscription<void>? _backSub;
  DateTime? _pausedAt;

  String? get branchId => session.operator?.branchId ?? device.branchId ?? (catalog.branches.isNotEmpty ? catalog.branches.first.id : null);
  bool get needsBranchChoice =>
      session.operator?.branchId == null && device.branchId == null && catalog.branches.length > 1;

  void _wire() {
    session.addListener(_onSession);
    _backSub = connectivity.onBackOnline.listen((_) => syncNow());
  }

  Future<void> _onSession() async {
    if (session.stage == SessionStage.unlocked) {
      final t = session.account?.tenantId;
      if (t != null && t != _loadedTenant) await _loadTenant(t);
      _startTimers();
      unawaited(syncNow(register: true));
    } else {
      _stopTimers();
      if (session.stage == SessionStage.inactive && tenantReady && sales.pendingCount > 0) {
        unawaited(sales.flush().catchError((Object _) {}));
      }
      if (session.stage == SessionStage.signedOut) {
        _loadedTenant = null;
        tenantReady = false;
      }
    }
    notifyListeners();
  }

  Future<void> _loadTenant(String tenant) async {
    _loadedTenant = tenant;
    await device.load(tenant);
    await catalog.load(tenant);
    await sales.load(tenant);
    tenantReady = true;
    notifyListeners();
  }

  void _startTimers() {
    _syncTimer?.cancel();
    _alertTimer?.cancel();
    _syncTimer = Timer.periodic(AppConfig.syncInterval, (_) => syncNow());
    _alertTimer = Timer.periodic(AppConfig.alertsInterval, (_) => refreshAlerts());
  }

  void _stopTimers() {
    _syncTimer?.cancel();
    _alertTimer?.cancel();
  }

  bool _syncing = false;

  /// رفع المعلّق + مزامنة الكتالوج + التنبيهات
  Future<void> syncNow({bool register = false, bool full = false}) async {
    if (_syncing || session.stage != SessionStage.unlocked || !tenantReady) return;
    _syncing = true;
    try {
      if (!device.registered || register) {
        setupError = await device.register(branch: branchId);
      }
      await sales.flush();
      await catalog.sync(branch: branchId, full: full);
      if (device.registered && catalog.branches.isNotEmpty && device.branchId == null && session.operator?.branchId == null && catalog.branches.length == 1) {
        await device.setBranch(catalog.branches.first.id);
      }
      unawaited(sales.refreshZatcaStatuses());
      await refreshAlerts();
    } catch (e) {
      setupError = friendlyError(e);
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  Future<void> refreshAlerts() async {
    final local = <AppAlert>[];
    final age = sales.oldestPendingAge;
    if (sales.pendingCount > 0 && age != null && age > const Duration(hours: 6)) {
      final critical = age > const Duration(hours: 18);
      local.add(AppAlert({
        'key': 'pending:${sales.pendingCount}:${age.inHours ~/ 6}',
        'type': 'pending_upload',
        'severity': critical ? 'critical' : 'warning',
        'title': '${sales.pendingCount} فاتورة بالجهاز ما انرفعت',
        'body': critical ? 'اتصل بالإنترنت الآن — مهلة الهيئة 24 ساعة من وقت البيع' : 'ترتفع تلقائياً أول ما يرجع الاتصال',
        'route': '/orders',
      }));
    }
    if (sales.failedCount > 0) {
      local.add(AppAlert({
        'key': 'failed:${sales.failedCount}', 'type': 'pending_upload', 'severity': 'critical',
        'title': '${sales.failedCount} فاتورة رفضها السيرفر', 'body': 'افتح الطلبات وراجع السبب', 'route': '/orders',
      }));
    }
    await alerts.refresh(branch: branchId, local: local, online: connectivity.online);
  }

  Future<void> chooseBranch(String id) async {
    await device.setBranch(id);
    await device.register(branch: id);
    await catalog.sync(branch: id);
    notifyListeners();
  }

  // دورة حياة التطبيق
  void onLifecycle(AppLifecycleState s) {
    if (s == AppLifecycleState.paused || s == AppLifecycleState.hidden) {
      _pausedAt ??= DateTime.now();
    } else if (s == AppLifecycleState.resumed) {
      final away = _pausedAt == null ? Duration.zero : DateTime.now().difference(_pausedAt!);
      _pausedAt = null;
      session.onResume(away);
      if (away > const Duration(seconds: 30)) unawaited(syncNow());
    }
  }

  @override
  void dispose() {
    _stopTimers();
    _backSub?.cancel();
    session.removeListener(_onSession);
    super.dispose();
  }
}

/// الوصول للخدمات من أي شاشة
class Services extends InheritedWidget {
  const Services({super.key, required this.app, required super.child});
  final AppServices app;

  static AppServices of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<Services>()!.app;
  static AppServices read(BuildContext context) => context.getInheritedWidgetOfExactType<Services>()!.app;

  @override
  bool updateShouldNotify(Services oldWidget) => app != oldWidget.app;
}
