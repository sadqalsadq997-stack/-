// ══════════════════════════════════════════════════════════════════
// الجلسة: الدخول ← رمز PIN ← النظام
//  • الدخول بالبريد وكلمة المرور عبر auth-login (10 محاولات لكل جهاز)
//  • التوكن في خزنة الجهاز الآمنة (Keychain/Keystore/DPAPI)
//  • رمز PIN يتحقق منه السيرفر (verify_app_pin_v2) — ونحفظ بصمة محلية
//    مملّحة تسمح بفتح النظام بدون إنترنت (10 محاولات ثم قفل 30 دقيقة)
//  • قفل تلقائي بعد 30 دقيقة بدون استخدام
// ══════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:convert';
import 'dart:isolate';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/ids.dart';
import '../core/permissions.dart';
import '../core/pin_hash.dart';
import '../core/store.dart';

enum SessionStage { booting, signedOut, inactive, needsWebSetup, needsAdminPin, locked, unlocked }

class Operator {
  const Operator({required this.role, this.empId, this.name, this.perms = const {}, this.branchId});
  factory Operator.fromJson(Map<String, dynamic> j) => Operator(
        role: normalizeRole(toS(j['role'])), empId: toS(j['emp_id']), name: toS(j['emp_name']),
        perms: asMap(j['permissions']), branchId: toS(j['branch_id']),
      );
  final String role;
  final String? empId;
  final String? name;
  final Map<String, dynamic> perms;
  final String? branchId;

  bool get isAdmin => role == 'admin';
  String get displayName => name ?? roleLabels[role] ?? 'المدير';
  bool can(String path) => canAccess(role, perms, path);

  Map<String, dynamic> toJson() => {'role': role, 'emp_id': empId, 'emp_name': name, 'permissions': perms, 'branch_id': branchId};
}

class Account {
  const Account(this.raw);
  final Map<String, dynamic> raw;
  String? get tenantId => toS(raw['tenant_id']);
  String get name => toS(raw['name']) ?? '';
  String? get accountNumber => toS(raw['account_number']);
  String? get email => toS(raw['email']);
  String? get plan => toS(raw['plan']);
  String? get role => toS(raw['role']);
  DateTime? get periodEnd => DateTime.tryParse('${raw['period_end'] ?? ''}');
  bool get paid {
    final s = toS(raw['status']);
    final end = periodEnd;
    return (s == 'active' || s == 'trialing') && end != null && end.isAfter(DateTime.now());
  }
}

class SessionService extends ChangeNotifier {
  SessionService(this.api, this.secure, this.store);
  final Api api;
  final SecureBox secure;
  final LocalStore store;

  SessionStage stage = SessionStage.booting;
  Account? account;
  Operator? operator;
  String? lastError;

  String? _access;
  String? _refresh;
  DateTime? _expiresAt;
  Completer<bool>? _refreshing;
  String _deviceSalt = '';
  DateTime _lastActive = DateTime.now();
  Timer? _idleTimer;

  bool get hasSession => _refresh != null;
  String? get userId {
    final t = _access;
    if (t == null) return null;
    return toS(_jwtPayload(t)['sub']);
  }

  // ── التشغيل ──────────────────────────────────────────────────────
  Future<void> boot() async {
    api.deviceId = await _stableDeviceId();
    _deviceSalt = await secure.get('device_salt') ?? '';
    if (_deviceSalt.isEmpty) {
      _deviceSalt = randomToken(24);
      await secure.set('device_salt', _deviceSalt);
    }
    api.tokenProvider = _validToken;
    api.onUnauthorized = () => _doRefresh(force: true);

    final s = await secure.getJson('session');
    if (s == null || s['refresh_token'] == null) {
      _go(SessionStage.signedOut);
      return;
    }
    _access = toS(s['access_token']);
    _refresh = toS(s['refresh_token']);
    _expiresAt = DateTime.tryParse('${s['expires_at'] ?? ''}');
    final cached = await store.readMap('account');
    if (cached != null) account = Account(cached);
    _go(SessionStage.locked);
    unawaited(refreshAccount());
  }

  Future<String> _stableDeviceId() async {
    var id = await secure.get('device_token');
    if (id == null || !RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(id)) {
      id = randomToken(18);
      await secure.set('device_token', id);
    }
    return id;
  }

  void _go(SessionStage s) {
    stage = s;
    notifyListeners();
  }

  // ── الدخول ───────────────────────────────────────────────────────
  /// يرجع رسالة خطأ عربية أو null عند النجاح
  Future<String?> login(String email, String password) async {
    lastError = null;
    try {
      final r = asMap(await api.fn('auth-login', {'email': email.trim().toLowerCase(), 'password': password}, auth: false));
      if (r['access_token'] == null) return 'تعذر الدخول';
      await _saveTokens(r);
    } on ApiException catch (e) {
      final b = asMap(e.body);
      if (e.status == 429) return toS(b['error']) ?? 'محاولات كثيرة — حاول لاحقاً';
      if (b['code'] == 'invalid') {
        final left = b['remaining'];
        return 'البريد أو كلمة المرور غير صحيحة${left is num ? ' — باقي ${left.toInt()} محاولة من هذا الجهاز' : ''}';
      }
      if (b['code'] == 'unconfirmed') return 'البريد غير مفعّل — افتح رسالة التفعيل في بريدك';
      return friendlyError(e);
    } catch (e) {
      return friendlyError(e);
    }
    return _afterLogin();
  }

  Future<String?> _afterLogin() async {
    try {
      final acc = await refreshAccount(throwErrors: true);
      if (acc == null) {
        _go(SessionStage.inactive);
        return null;
      }
      if (!acc.paid) {
        _go(SessionStage.inactive);
        return null;
      }
      final st = await api.rpc('app_pin_status');
      final row = st is List && st.isNotEmpty ? asMap(st.first) : asMap(st);
      if (row['has_settings'] != true || row['onboarded'] != true) {
        _go(SessionStage.needsWebSetup);
      } else if (row['has_admin_pin'] != true) {
        _go(SessionStage.needsAdminPin);
      } else {
        _go(SessionStage.locked);
      }
      return null;
    } catch (e) {
      return friendlyError(e);
    }
  }

  /// يحدّث بيانات المنشأة والاشتراك (وقت الاتصال)
  Future<Account?> refreshAccount({bool throwErrors = false}) async {
    try {
      final r = await api.rpc('my_account');
      final m = asMap(r);
      if (m.isEmpty) return null;
      final prevTenant = account?.tenantId;
      account = Account(m);
      await store.write('account', m);
      if (prevTenant != null && prevTenant != account!.tenantId) {
        // الحساب انتقل لمنشأة ثانية ⇒ نمسح بصمات PIN القديمة
        await secure.set('pins', null);
      }
      if (!account!.paid && stage == SessionStage.unlocked) _go(SessionStage.inactive);
      notifyListeners();
      return account;
    } catch (e) {
      if (throwErrors) rethrow;
      return account;
    }
  }

  // ── رمز PIN ──────────────────────────────────────────────────────
  static Future<String> _hashInIsolate(String pin) => Isolate.run(() => hashPin(pin));

  /// يرجع رسالة خطأ أو null عند النجاح
  Future<String?> unlock(String pin) async {
    final lock = await _offlineLockState();
    if (lock != null) return lock;
    final h = await _hashInIsolate(pin);
    try {
      final r = await api.rpc('verify_app_pin_v2', {'p_hash': h, 'p_device': api.deviceId});
      final row = r is List && r.isNotEmpty ? asMap(r.first) : asMap(r);
      if (row['ok'] == true) {
        final op = Operator.fromJson(row);
        await _rememberPin(h, op);
        await _resetOfflineAttempts();
        _unlocked(op);
        return null;
      }
      final retry = toI(row['retry_after']);
      if (retry > 0) return 'تم إيقاف الدخول من هذا الجهاز بعد 10 محاولات خاطئة — حاول بعد ${(retry / 60).ceil()} دقيقة';
      final left = row['remaining'];
      return left is num ? 'رمز PIN غير صحيح • باقي ${left.toInt()} محاولة' : 'رمز PIN غير صحيح';
    } on ApiException catch (e) {
      if (!e.isNetwork) return friendlyError(e);
      return _unlockOffline(h);
    } catch (e) {
      return _unlockOffline(h);
    }
  }

  Future<String?> _unlockOffline(String pinHash) async {
    final pins = await secure.getJson('pins') ?? {};
    final key = offlinePinKey(pinHash, _deviceSalt);
    final e = asMap(pins[key]);
    final saved = DateTime.tryParse('${e['at'] ?? ''}');
    if (e.isNotEmpty && saved != null && DateTime.now().difference(saved).inDays <= 30) {
      await _resetOfflineAttempts();
      _unlocked(Operator.fromJson(asMap(e['op'])));
      return null;
    }
    final n = await _bumpOfflineAttempts();
    if (e.isNotEmpty) return 'مرّ أكثر من 30 يوم بدون اتصال — اتصل بالإنترنت لتأكيد الرمز';
    return n >= 10 ? 'تم إيقاف الدخول 30 دقيقة بعد 10 محاولات خاطئة' : 'رمز غير صحيح (أو لم يُستخدم على هذا الجهاز مع الإنترنت من قبل) • باقي ${10 - n}';
  }

  Future<void> _rememberPin(String pinHash, Operator op) async {
    final pins = await secure.getJson('pins') ?? {};
    pins[offlinePinKey(pinHash, _deviceSalt)] = {'op': op.toJson(), 'at': DateTime.now().toIso8601String()};
    await secure.setJson('pins', pins);
  }

  Future<String?> _offlineLockState() async {
    final m = await secure.getJson('pin_attempts') ?? {};
    final until = DateTime.tryParse('${m['until'] ?? ''}');
    if (until != null && until.isAfter(DateTime.now())) {
      return 'الجهاز موقوف مؤقتاً — حاول بعد ${until.difference(DateTime.now()).inMinutes + 1} دقيقة';
    }
    return null;
  }

  Future<int> _bumpOfflineAttempts() async {
    final m = await secure.getJson('pin_attempts') ?? {};
    final n = toI(m['n']) + 1;
    await secure.setJson('pin_attempts', {
      'n': n >= 10 ? 0 : n,
      if (n >= 10) 'until': DateTime.now().add(const Duration(minutes: 30)).toIso8601String(),
    });
    return n;
  }

  Future<void> _resetOfflineAttempts() => secure.setJson('pin_attempts', null);

  /// أول مرة: المالك يضبط رمز PIN المدير
  Future<String?> setAdminPin(String pin) async {
    try {
      final h = await _hashInIsolate(pin);
      await api.rpc('set_initial_admin_pin', {'p_hash': h});
      const op = Operator(role: 'admin');
      await _rememberPin(h, op);
      _unlocked(op);
      return null;
    } catch (e) {
      return friendlyError(e);
    }
  }

  void _unlocked(Operator op) {
    operator = op;
    _lastActive = DateTime.now();
    _idleTimer?.cancel();
    _idleTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (stage == SessionStage.unlocked && DateTime.now().difference(_lastActive) > AppConfig.idleLock) lock();
    });
    _go(account != null && !account!.paid ? SessionStage.inactive : SessionStage.unlocked);
  }

  /// أي لمسة في الواجهة تمدد الجلسة
  void touch() => _lastActive = DateTime.now();

  void lock() {
    if (stage != SessionStage.unlocked) return;
    operator = null;
    _idleTimer?.cancel();
    _go(SessionStage.locked);
  }

  /// رجوع التطبيق من الخلفية بعد مدة ⇒ قفل
  void onResume(Duration away) {
    if (away > AppConfig.idleLock) lock();
  }

  /// تسجيل الخروج ومسح بيانات المنشأة من الجهاز.
  /// حماية: الفواتير اللي ما انرفعت (ومعها عداد الجهاز) ما تنمسح — نظام الهيئة
  /// يلزم بإرسالها، وترتفع تلقائياً أول ما يدخل نفس الحساب. (إلا عند حذف الحساب)
  Future<void> logout({bool discardPending = false}) async {
    final keep = <String>{'printer'};
    if (!discardPending) {
      for (final n in await store.names()) {
        if (!n.startsWith('sales_')) continue;
        final l = await store.readList(n) ?? const [];
        if (asList(l).any((s) => s['status'] != 'synced')) {
          keep
            ..add(n)
            ..add('device_${n.substring(6)}');
        }
      }
    }
    try {
      await api.send('POST', '/auth/v1/logout', timeout: const Duration(seconds: 6));
    } catch (_) {}
    _access = null;
    _refresh = null;
    _expiresAt = null;
    operator = null;
    account = null;
    _idleTimer?.cancel();
    await secure.set('session', null);
    await secure.set('pins', null);
    await store.wipe(keep: keep);
    _go(SessionStage.signedOut);
  }

  // ── التوكن ───────────────────────────────────────────────────────
  Future<void> _saveTokens(Map<String, dynamic> r) async {
    _access = toS(r['access_token']);
    _refresh = toS(r['refresh_token']) ?? _refresh;
    final exp = toI(_jwtPayload(_access ?? '')['exp']);
    _expiresAt = exp > 0
        ? DateTime.fromMillisecondsSinceEpoch(exp * 1000)
        : DateTime.now().add(Duration(seconds: r['expires_in'] is num ? (r['expires_in'] as num).toInt() : 3600));
    await secure.setJson('session', {'access_token': _access, 'refresh_token': _refresh, 'expires_at': _expiresAt!.toIso8601String()});
  }

  Future<String?> _validToken() async {
    if (_access == null) return null;
    if (_expiresAt != null && _expiresAt!.difference(DateTime.now()) < const Duration(seconds: 60)) {
      await _doRefresh();
    }
    return _access;
  }

  Future<bool> _doRefresh({bool force = false}) async {
    if (_refresh == null) return false;
    if (!force && _expiresAt != null && _expiresAt!.difference(DateTime.now()) > const Duration(seconds: 60)) return true;
    final running = _refreshing;
    if (running != null) return running.future;
    final c = Completer<bool>();
    _refreshing = c;
    try {
      final r = asMap(await api.send('POST', '/auth/v1/token', query: {'grant_type': 'refresh_token'},
          json: {'refresh_token': _refresh}, auth: false, timeout: const Duration(seconds: 15)));
      if (r['access_token'] != null) {
        await _saveTokens(r);
        c.complete(true);
      } else {
        c.complete(false);
      }
    } on ApiException catch (e) {
      if (!e.isNetwork && (e.status == 400 || e.status == 401 || e.status == 403)) {
        // الجلسة أُلغيت (تغيير كلمة المرور / حذف) ⇒ دخول من جديد
        await secure.set('session', null);
        _access = null;
        _refresh = null;
        operator = null;
        _go(SessionStage.signedOut);
      }
      c.complete(false);
    } catch (_) {
      c.complete(false);
    } finally {
      _refreshing = null;
    }
    return c.future;
  }

  static Map<String, dynamic> _jwtPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return const {};
      final s = base64Url.normalize(parts[1]);
      return asMap(jsonDecode(utf8.decode(base64Url.decode(s))));
    } catch (_) {
      return const {};
    }
  }

  @override
  void dispose() {
    _idleTimer?.cancel();
    super.dispose();
  }
}
