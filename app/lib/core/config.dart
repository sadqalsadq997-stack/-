// ══════════════════════════════════════════════════════════════════
// إعدادات التطبيق
// التطبيق يكلّم موقع فلسي فقط (felsy.org/api/db) — نفس وكيل الموقع على
// Vercel. رابط Supabase ومفاتيحه ما توجد في التطبيق نهائياً.
// للتجربة على سيرفر آخر: flutter run --dart-define=FELSY_API=https://...
// ══════════════════════════════════════════════════════════════════

class AppConfig {
  static const apiBase = String.fromEnvironment('FELSY_API', defaultValue: 'https://felsy.org/api/db');
  static const siteUrl = String.fromEnvironment('FELSY_SITE', defaultValue: 'https://felsy.org');
  static const supportEmail = 'info@felsy.org';
  static const version = String.fromEnvironment('FELSY_VERSION', defaultValue: '1.0.0');

  /// رمز الطلبات العامة (الوكيل يستبدله بالمفتاح العام على السيرفر)
  static const publicToken = 'felsy-public';

  /// كل كم يزامن الكتالوج ويرفع الفواتير وهو متصل
  static const syncInterval = Duration(minutes: 3);

  /// فحص التنبيهات من السيرفر
  static const alertsInterval = Duration(minutes: 10);

  /// القفل التلقائي بعد عدم استخدام (مثل الموقع)
  static const idleLock = Duration(minutes: 30);

  /// مهلة الهيئة للفاتورة المبسطة
  static const zatcaWindow = Duration(hours: 24);
}
