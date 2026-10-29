// ══════════════════════════════════════════════════════════════════
// رمز PIN — نفس خوارزمية الموقع (src/lib/security/pin.js):
// PBKDF2-HMAC-SHA256، 100,000 دورة، ملح ثابت 'felsy-pin-salt-v2'، 32 بايت hex
// السيرفر يخزنها مشفّرة (bcrypt) ويتحقق منها (verify_app_pin_v2).
// (ملف Dart صافي — يُختبر مقابل ناتج الموقع)
// ══════════════════════════════════════════════════════════════════

import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

const _salt = 'felsy-pin-salt-v2';
const pinIterations = 100000;

/// PBKDF2-HMAC-SHA256 (كتلة واحدة = 32 بايت تكفي)
Uint8List pbkdf2Sha256(List<int> password, List<int> salt, int iterations) {
  final hmac = Hmac(sha256, password);
  final block = Uint8List(salt.length + 4)
    ..setAll(0, salt)
    ..setAll(salt.length, const [0, 0, 0, 1]);
  var u = Uint8List.fromList(hmac.convert(block).bytes);
  final out = Uint8List.fromList(u);
  for (var i = 1; i < iterations; i++) {
    u = Uint8List.fromList(hmac.convert(u).bytes);
    for (var j = 0; j < out.length; j++) {
      out[j] ^= u[j];
    }
  }
  return out;
}

String toHex(List<int> bytes) {
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

/// تجزئة PIN كما يرسلها الموقع للسيرفر
String hashPin(String pin) => toHex(pbkdf2Sha256(utf8.encode(pin), utf8.encode(_salt), pinIterations));

/// بصمة محلية للتحقق بدون إنترنت (ما تُرسل لأي مكان): sha256(تجزئة PIN + ملح الجهاز)
String offlinePinKey(String pinHash, String deviceSalt) => sha256.convert(utf8.encode('$pinHash:$deviceSalt')).toString();
