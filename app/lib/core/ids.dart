import 'dart:math';

final _rnd = Random.secure();

/// UUID v4 عشوائي آمن — معرّف البيع من الجهاز (يمنع تكرار الرفع)
String uuidV4() {
  final b = List<int>.generate(16, (_) => _rnd.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
  final s = List.generate(16, h).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

/// معرّف جهاز نصي (مثل getDeviceId في الموقع) — لحدود المحاولات في السيرفر
String randomToken([int bytes = 18]) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return List.generate(bytes + bytes ~/ 3, (_) => alphabet[_rnd.nextInt(alphabet.length)]).join();
}

final _uuidRe = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
bool isUuid(String? s) => s != null && _uuidRe.hasMatch(s);
