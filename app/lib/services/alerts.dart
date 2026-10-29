// ══════════════════════════════════════════════════════════════════
// التنبيهات الذكية — مهمة فقط وبدون إزعاج
//  • من السيرفر (app_alerts): نقص/نفاد مخزون، صلاحية، فواتير متأخرة أو
//    مرفوضة من الهيئة، شهادة الهيئة، ضريبة مشتريات غير مدفوعة، موعد
//    الإقرار، انتهاء الاشتراك
//  • من الجهاز: فواتير ما انرفعت وقربت مهلة الـ 24 ساعة، أو فشل رفعها
//  قواعد عدم الإزعاج:
//   - كل تنبيه يُرسل مرة وحدة لنفس المحتوى (المفتاح يتغير لو تغيّر)
//   - حد أعلى 6 إشعارات في اليوم (الحرجة مستثناة)
//   - ساعات الهدوء 11 مساءً – 7 صباحاً (إلا الحرجة)
//   - المستخدم يقدر يطفي أي نوع من الإعدادات
// الإشعارات محلية من التطبيق نفسه — ما فيه أي خدمة خارجية تشوف بياناتك.
// ══════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../core/api.dart';
import '../core/store.dart';

class AppAlert {
  AppAlert(this.raw);
  final Map<String, dynamic> raw;
  String get key => toS(raw['key']) ?? '';
  String get type => toS(raw['type']) ?? '';
  String get severity => toS(raw['severity']) ?? 'info';
  String get title => toS(raw['title']) ?? '';
  String get body => toS(raw['body']) ?? '';
  String? get route => toS(raw['route']);
  bool get critical => severity == 'critical';
}

const alertTypeLabels = {
  'low_stock': 'نقص أو نفاد المخزون',
  'expiry': 'أصناف قاربت صلاحيتها على الانتهاء',
  'zatca_overdue': 'فواتير متأخرة عن الهيئة',
  'zatca_rejected': 'فواتير مرفوضة من الهيئة',
  'cert_expiry': 'انتهاء شهادة الهيئة',
  'unpaid_input_vat': 'ضريبة مشتريات غير مدفوعة (12 شهر)',
  'vat_due': 'موعد الإقرار الضريبي',
  'subscription': 'انتهاء الاشتراك',
  'pending_upload': 'فواتير بالجهاز ما انرفعت',
};

class AlertsService extends ChangeNotifier {
  AlertsService(this.api, this.store);
  final Api api;
  final LocalStore store;
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();

  List<AppAlert> alerts = const [];
  bool ready = false;
  bool permissionAsked = false;
  bool enabled = true;
  Set<String> disabledTypes = {};
  bool quietHours = true;
  Map<String, String> _sent = {}; // key ⇒ وقت الإرسال
  void Function(String? route)? onTap;

  Future<void> init() async {
    final prefs = await store.readMap('alert_prefs') ?? {};
    enabled = prefs['enabled'] != false;
    quietHours = prefs['quiet'] != false;
    permissionAsked = prefs['asked'] == true;
    disabledTypes = ((prefs['disabled'] as List?) ?? const []).map((e) => '$e').toSet();
    _sent = asMap(prefs['sent']).map((k, v) => MapEntry(k, '$v'));
    try {
      const settings = InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_felsy'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
        windows: WindowsInitializationSettings(appName: 'فلسي', appUserModelId: 'Felsy.FelsyPOS', guid: '6c1a7d52-4c1e-4f0a-9d1b-2f6a9e0b7c31'),
      );
      await _plugin.initialize(
        settings: settings,
        onDidReceiveNotificationResponse: (r) => onTap?.call(r.payload),
      );
      ready = true;
    } catch (_) {
      ready = false;
    }
    notifyListeners();
  }

  Future<void> _savePrefs() => store.write('alert_prefs', {
        'enabled': enabled, 'quiet': quietHours, 'asked': permissionAsked, 'disabled': disabledTypes.toList(), 'sent': _sent,
      });

  /// طلب إذن الإشعارات (بعد شرح بسيط للمستخدم داخل التطبيق)
  Future<bool> requestPermission() async {
    permissionAsked = true;
    await _savePrefs();
    try {
      if (Platform.isAndroid) {
        final a = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        return await a?.requestNotificationsPermission() ?? false;
      }
      if (Platform.isIOS) {
        final i = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
        return await i?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
      }
      return true; // ويندوز ما يحتاج إذن
    } catch (_) {
      return false;
    }
  }

  Future<void> setEnabled(bool v) async {
    enabled = v;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> setQuiet(bool v) async {
    quietHours = v;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> toggleType(String type, bool on) async {
    if (on) {
      disabledTypes.remove(type);
    } else {
      disabledTypes.add(type);
    }
    await _savePrefs();
    notifyListeners();
  }

  /// تحديث التنبيهات (السيرفر + محلية) وإرسال الجديد منها فقط
  Future<void> refresh({String? branch, List<AppAlert> local = const [], bool online = true}) async {
    var server = <AppAlert>[];
    if (online) {
      try {
        server = asList(await api.rpc('app_alerts', {'p_branch': branch})).map(AppAlert.new).toList();
      } catch (_) {
        server = alerts.where((a) => a.type != 'pending_upload').toList(); // نبقي آخر نسخة
      }
    } else {
      server = alerts.where((a) => a.type != 'pending_upload').toList();
    }
    alerts = [...local, ...server]..sort((a, b) => _rank(b.severity).compareTo(_rank(a.severity)));
    notifyListeners();
    await _notifyNew();
  }

  static int _rank(String s) => s == 'critical' ? 3 : s == 'warning' ? 2 : 1;

  Future<void> _notifyNew() async {
    if (!enabled || !ready) return;
    final now = DateTime.now();
    final ksaHour = now.toUtc().add(const Duration(hours: 3)).hour;
    final quiet = quietHours && (ksaHour >= 23 || ksaHour < 7);
    final today = '${now.year}-${now.month}-${now.day}';
    var sentToday = _sent.values.where((v) => v.startsWith(today)).length;
    var id = now.millisecondsSinceEpoch % 100000;
    for (final a in alerts) {
      if (a.key.isEmpty || _sent.containsKey(a.key) || disabledTypes.contains(a.type)) continue;
      if (!a.critical && (quiet || sentToday >= 6)) continue;
      try {
        await _plugin.show(
          id: id++,
          title: a.title,
          body: a.body,
          notificationDetails: NotificationDetails(
            android: AndroidNotificationDetails(
              a.critical ? 'felsy_critical' : 'felsy_alerts',
              a.critical ? 'تنبيهات عاجلة' : 'تنبيهات فلسي',
              channelDescription: a.critical ? 'فواتير الهيئة والأمور العاجلة' : 'المخزون والإقرار والاشتراك',
              importance: a.critical ? Importance.high : Importance.defaultImportance,
              priority: a.critical ? Priority.high : Priority.defaultPriority,
              styleInformation: BigTextStyleInformation(a.body),
            ),
            iOS: const DarwinNotificationDetails(),
            windows: const WindowsNotificationDetails(),
          ),
          payload: a.route,
        );
        _sent[a.key] = '$today ${now.hour}:${now.minute}';
        sentToday++;
      } catch (_) {}
    }
    // تنظيف المفاتيح القديمة (أكثر من 300)
    if (_sent.length > 300) {
      final keys = _sent.keys.toList()..sort((a, b) => _sent[a]!.compareTo(_sent[b]!));
      for (final k in keys.take(_sent.length - 300)) {
        _sent.remove(k);
      }
    }
    await _savePrefs();
  }
}
