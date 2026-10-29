// ══════════════════════════════════════════════════════════════════
// جهاز التطبيق وسلسلة فواتيره
//  • كل جهاز يسجَّل في السيرفر برمز (D1، D2…) — مرة وحدة مع الإنترنت
//  • رقم الفاتورة يتولد في الجهاز: INV-D1-000123 ⇒ البيع يشتغل بدون إنترنت
//  • الرقم يُحجز ويُحفظ قبل الطباعة (لو انطفى الجهاز ما يتكرر الرقم أبداً)
//  • السيرفر يتحقق عند الرفع: الجهاز تابع للمنشأة، غير موقوف، والرقم ما استُخدم
// ══════════════════════════════════════════════════════════════════

import 'dart:io';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/ids.dart';
import '../core/store.dart';

class DeviceService extends ChangeNotifier {
  DeviceService(this.api, this.store);
  final Api api;
  final LocalStore store;

  String? tenantId;
  String? id;
  String? code;
  int nextSeq = 1;
  bool registered = false;
  String? branchId;

  String get _file => 'device_$tenantId';

  Future<void> load(String tenant) async {
    tenantId = tenant;
    final m = await store.readMap(_file);
    if (m == null) {
      id = uuidV4();
      code = null;
      nextSeq = 1;
      registered = false;
      branchId = null;
      await _save();
    } else {
      id = toS(m['id']) ?? uuidV4();
      code = toS(m['code']);
      nextSeq = toI(m['next_seq']) < 1 ? 1 : toI(m['next_seq']);
      registered = m['registered'] == true && code != null;
      branchId = toS(m['branch_id']);
    }
    notifyListeners();
  }

  Future<void> _save() =>
      store.write(_file, {'id': id, 'code': code, 'next_seq': nextSeq, 'registered': registered, 'branch_id': branchId});

  String get platformLabel {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    if (Platform.isWindows) return 'windows';
    if (Platform.isMacOS) return 'macos';
    return Platform.operatingSystem;
  }

  String get _defaultName {
    const names = {'android': 'أندرويد', 'ios': 'آيفون/آيباد', 'windows': 'ويندوز', 'macos': 'ماك'};
    var host = '';
    try {
      host = Platform.localHostname;
    } catch (_) {}
    final base = names[platformLabel] ?? platformLabel;
    return host.isEmpty || host == 'localhost' ? base : '$base — $host';
  }

  /// التسجيل/التحديث في السيرفر (وقت الاتصال). يرجع رسالة خطأ أو null.
  Future<String?> register({String? branch}) async {
    if (id == null) return 'الجهاز غير جاهز';
    try {
      final r = asMap(await api.rpc('app_register_device', {
        'p_device': id, 'p_name': _defaultName, 'p_platform': platformLabel, 'p_version': AppConfig.version, 'p_branch': branch ?? branchId,
      }));
      code = toS(r['code']);
      final serverLast = toI(r['last_seq']);
      if (nextSeq <= serverLast) nextSeq = serverLast + 1; // لا تكرار مع ما استلمه السيرفر
      registered = code != null;
      branchId = toS(r['branch_id']) ?? branch ?? branchId;
      await _save();
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      if (e.message.contains('device_other_tenant')) {
        // الجهاز كان مسجلاً لمنشأة أخرى ⇒ معرّف جديد
        id = uuidV4();
        nextSeq = 1;
        registered = false;
        await _save();
        return register(branch: branch);
      }
      return friendlyError(e);
    } catch (e) {
      return friendlyError(e);
    }
  }

  /// حجز رقم فاتورة جديد (يُحفظ فوراً قبل أي طباعة)
  Future<({int seq, String invoiceNo})> takeSeq() async {
    if (!registered || code == null) {
      throw StateError('أول تشغيل للجهاز يحتاج إنترنت لتسجيله — اتصل ثم أعد المحاولة');
    }
    final seq = nextSeq;
    nextSeq = seq + 1;
    await _save();
    return (seq: seq, invoiceNo: 'INV-$code-${seq.toString().padLeft(6, '0')}');
  }

  Future<void> setBranch(String? b) async {
    branchId = b;
    await _save();
    notifyListeners();
  }
}
