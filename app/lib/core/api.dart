// ══════════════════════════════════════════════════════════════════
// الاتصال بالسيرفر (dart:io فقط — بدون مكتبات وسيطة)
//   /rest/v1/…       جداول ودوال القاعدة (RLS تحمي بيانات كل منشأة)
//   /functions/v1/…  الدوال (الدخول، الفوترة الإلكترونية)
//   /auth/v1/…       تجديد الجلسة والخروج
// كل الطلبات عبر felsy.org/api/db (HTTPS) — ما فيه اتصال مباشر بـ Supabase.
// ══════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.code, this.body});
  final int status;
  final String message;
  final String? code;
  final Object? body;

  /// انقطاع إنترنت / مهلة / السيرفر ما رد ⇒ نعيد المحاولة لاحقاً
  bool get isNetwork => status == 0 || status == 502 || status == 503 || status == 504;
  bool get isAuth => status == 401;

  @override
  String toString() => message;
}

/// ترجمة رسائل السيرفر الشائعة لعربي واضح
String friendlyError(Object e) {
  if (e is ApiException) {
    final m = e.message;
    if (e.status == 0) return 'لا يوجد اتصال بالإنترنت';
    if (e.status == 401) return 'انتهت الجلسة — سجّل الدخول من جديد';
    if (m.contains('permission denied') || m.contains('row-level security')) return 'ليس لديك صلاحية لهذا الإجراء';
    if (m.contains('duplicate key')) return 'البيانات مسجلة من قبل';
    if (m.contains('JWT')) return 'انتهت الجلسة — سجّل الدخول من جديد';
    if (e.status >= 500) return 'السيرفر غير متاح حالياً — حاول بعد قليل';
    return m;
  }
  if (e is TimeoutException || e is SocketException || e is HandshakeException) return 'لا يوجد اتصال بالإنترنت';
  return e.toString().replaceFirst('Exception: ', '');
}

typedef TokenProvider = Future<String?> Function();

class Api {
  Api({String? base}) : base = Uri.parse(base ?? AppConfig.apiBase) {
    // نسخة المتجر: HTTPS فقط (أي رابط غير مشفّر يوقف التطبيق بدل ما يرسل بيانات مكشوفة)
    if (const bool.fromEnvironment('dart.vm.product') && this.base.scheme != 'https') {
      throw StateError('FELSY_API must be https');
    }
    _http
      ..connectionTimeout = const Duration(seconds: 10)
      ..idleTimeout = const Duration(seconds: 30)
      ..userAgent = 'FelsyApp/${AppConfig.version} (${Platform.operatingSystem})';
  }

  final Uri base;
  final HttpClient _http = HttpClient();

  /// يعطي توكن صالح (يجدّده إذا قارب الانتهاء) — من خدمة الدخول
  TokenProvider? tokenProvider;

  /// يُستدعى عند 401 بعد فشل التجديد ⇒ الرجوع لشاشة الدخول
  Future<bool> Function()? onUnauthorized;

  /// معرّف الجهاز (لحدود المحاولات في السيرفر)
  String deviceId = '';

  /// يُبلَّغ بنتيجة كل طلب (متصل/غير متصل)
  void Function(bool online)? onReachability;

  Uri _uri(String path, [Map<String, String>? query]) {
    final p = base.path.endsWith('/') ? base.path.substring(0, base.path.length - 1) : base.path;
    return base.replace(path: '$p$path', queryParameters: (query == null || query.isEmpty) ? null : query);
  }

  /// طلب خام. يرجع JSON المفكوك (أو null).
  Future<Object?> send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? json,
    Map<String, String>? headers,
    bool auth = true,
    Duration timeout = const Duration(seconds: 20),
    bool retried = false,
  }) async {
    final token = auth && tokenProvider != null ? await tokenProvider!() : null;
    HttpClientResponse res;
    String text;
    try {
      final req = await _http.openUrl(method, _uri(path, query)).timeout(timeout);
      // لا نتبع أي تحويل ⇒ التوكن ما يوصل لأي عنوان غير السيرفر
      req.followRedirects = false;
      req.headers.set(HttpHeaders.acceptHeader, 'application/json');
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer ${token ?? AppConfig.publicToken}');
      headers?.forEach(req.headers.set);
      if (json != null) {
        final bytes = utf8.encode(jsonEncode(json));
        req.headers.contentType = ContentType('application', 'json', charset: 'utf-8');
        req.contentLength = bytes.length;
        req.add(bytes);
      }
      res = await req.close().timeout(timeout);
      text = await res.transform(utf8.decoder).join().timeout(timeout);
    } on TimeoutException {
      onReachability?.call(false);
      throw ApiException(0, 'انتهت مهلة الاتصال');
    } on SocketException {
      onReachability?.call(false);
      throw ApiException(0, 'لا يوجد اتصال بالإنترنت');
    } on HandshakeException {
      onReachability?.call(false);
      throw ApiException(0, 'تعذر الاتصال الآمن بالسيرفر');
    } on HttpException {
      onReachability?.call(false);
      throw ApiException(0, 'انقطع الاتصال');
    }
    onReachability?.call(res.statusCode < 500 || res.statusCode == 500);

    Object? body;
    if (text.isNotEmpty) {
      try {
        body = jsonDecode(text);
      } catch (_) {
        body = text;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    // انتهت صلاحية التوكن ⇒ نجدّد مرة وحدة ونعيد
    if (res.statusCode == 401 && auth && !retried && onUnauthorized != null) {
      if (await onUnauthorized!()) {
        return send(method, path, query: query, json: json, headers: headers, auth: auth, timeout: timeout, retried: true);
      }
    }
    throw ApiException(res.statusCode, _message(body, res.statusCode), code: _code(body), body: body);
  }

  static String _message(Object? body, int status) {
    if (body is Map) {
      final e = body['error'];
      if (e is Map && e['message'] is String) return e['message'] as String;
      for (final k in ['message', 'error', 'msg', 'error_description']) {
        final v = body[k];
        if (v is String && v.isNotEmpty) return v;
      }
    }
    if (body is String && body.isNotEmpty && body.length < 300) return body;
    return 'خطأ من السيرفر ($status)';
  }

  static String? _code(Object? body) => body is Map && body['code'] != null ? '${body['code']}' : null;

  // ── PostgREST ─────────────────────────────────────────────────────
  /// قراءة صفوف: filters مثل {'status': 'eq.completed', 'created_at': 'gte.2026-01-01'}
  Future<List<Map<String, dynamic>>> select(
    String table, {
    String columns = '*',
    Map<String, String> filters = const {},
    String? order,
    int? limit,
    int? offset,
  }) async {
    final q = <String, String>{'select': columns, ...filters};
    if (order != null) q['order'] = order;
    if (limit != null) q['limit'] = '$limit';
    if (offset != null) q['offset'] = '$offset';
    final r = await send('GET', '/rest/v1/$table', query: q);
    return r is List ? r.whereType<Map<String, dynamic>>().toList() : const [];
  }

  Future<Map<String, dynamic>> insert(String table, Map<String, dynamic> row, {String columns = '*'}) async {
    final r = await send('POST', '/rest/v1/$table', query: {'select': columns}, json: row,
        headers: {'Prefer': 'return=representation', 'Accept': 'application/vnd.pgrst.object+json'});
    return r is Map<String, dynamic> ? r : <String, dynamic>{};
  }

  Future<Map<String, dynamic>?> update(String table, Map<String, dynamic> values, Map<String, String> filters, {String columns = '*'}) async {
    final r = await send('PATCH', '/rest/v1/$table', query: {'select': columns, ...filters}, json: values,
        headers: {'Prefer': 'return=representation'});
    return r is List && r.isNotEmpty && r.first is Map<String, dynamic> ? r.first as Map<String, dynamic> : null;
  }

  Future<void> delete(String table, Map<String, String> filters) => send('DELETE', '/rest/v1/$table', query: filters);

  /// دالة في القاعدة
  Future<Object?> rpc(String fn, [Map<String, dynamic> args = const {}, Duration timeout = const Duration(seconds: 20)]) =>
      send('POST', '/rest/v1/rpc/$fn', json: args, timeout: timeout);

  /// Edge Function
  Future<Object?> fn(String name, Map<String, dynamic> body, {bool auth = true, Duration timeout = const Duration(seconds: 25)}) =>
      send('POST', '/functions/v1/$name', json: {'device_id': deviceId, ...body}, auth: auth, timeout: timeout);

  /// فحص سريع للاتصال
  Future<bool> ping() async {
    try {
      await send('GET', '/auth/v1/health', auth: false, timeout: const Duration(seconds: 6));
      return true;
    } on ApiException catch (e) {
      return !e.isNetwork;
    }
  }

  void close() => _http.close(force: true);
}

/// تحويل آمن للأرقام القادمة من JSON
double toD(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int toI(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String? toS(Object? v) => v == null ? null : '$v';
Map<String, dynamic> asMap(Object? v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<Map<String, dynamic>> asList(Object? v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];
