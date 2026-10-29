// حالة الاتصال: من نتيجة كل طلب + فحص خفيف كل 20 ثانية وقت الانقطاع
// (بدون مكتبات إضافية). رجوع الاتصال ⇒ رفع الفواتير ومزامنة الكتالوج.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api.dart';

class ConnectivityService extends ChangeNotifier {
  ConnectivityService(this.api) {
    api.onReachability = _report;
  }
  final Api api;
  bool online = true;
  DateTime? offlineSince;
  Timer? _probe;
  final _back = StreamController<void>.broadcast();

  /// يطلق حدث عند رجوع الاتصال
  Stream<void> get onBackOnline => _back.stream;

  void _report(bool ok) {
    if (ok == online) return;
    online = ok;
    if (!ok) {
      offlineSince = DateTime.now();
      _startProbe();
    } else {
      offlineSince = null;
      _probe?.cancel();
      _back.add(null);
    }
    notifyListeners();
  }

  void _startProbe() {
    _probe?.cancel();
    _probe = Timer.periodic(const Duration(seconds: 20), (_) => check());
  }

  Future<bool> check() async {
    final ok = await api.ping();
    _report(ok);
    return ok;
  }

  @override
  void dispose() {
    _probe?.cancel();
    _back.close();
    super.dispose();
  }
}
