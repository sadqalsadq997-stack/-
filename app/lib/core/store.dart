// ══════════════════════════════════════════════════════════════════
// التخزين في الجهاز
//  • LocalStore: ملفات JSON في مجلد التطبيق الخاص (الكتالوج، الفواتير
//    المعلّقة، السجل). الكتابة ذرّية: ملف مؤقت ثم إعادة تسمية ⇒ انقطاع
//    الكهرباء وقت الحفظ ما يخرب الملف.
//  • SecureBox: أسرار الجلسة (توكن الدخول) في Keychain/Keystore/DPAPI.
// ══════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

class LocalStore {
  LocalStore._(this._dir);
  final Directory _dir;
  final Map<String, Future<void>> _locks = {};

  static Future<LocalStore> open() async {
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}${Platform.pathSeparator}felsy_data');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return LocalStore._(dir);
  }

  File _file(String name) => File('${_dir.path}${Platform.pathSeparator}$name.json');

  /// قراءة (null إذا ما فيه ملف أو تالف)
  Future<Object?> read(String name) async {
    final f = _file(name);
    try {
      if (!await f.exists()) {
        // استرجاع من نسخة الكتابة لو انقطعت قبل إعادة التسمية
        final tmp = File('${f.path}.tmp');
        if (await tmp.exists()) return jsonDecode(await tmp.readAsString());
        return null;
      }
      return jsonDecode(await f.readAsString());
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> readMap(String name) async {
    final v = await read(name);
    return v is Map<String, dynamic> ? v : null;
  }

  Future<List<dynamic>?> readList(String name) async {
    final v = await read(name);
    return v is List<dynamic> ? v : null;
  }

  /// كتابة ذرّية ومتسلسلة لنفس الملف (ما تتداخل كتابتين)
  Future<void> write(String name, Object? value) {
    final prev = _locks[name] ?? Future<void>.value();
    final next = prev.then((_) async {
      final f = _file(name);
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(value), flush: true);
      await tmp.rename(f.path);
    }).catchError((Object _) {});
    _locks[name] = next;
    return next;
  }

  Future<void> delete(String name) async {
    final f = _file(name);
    if (await f.exists()) await f.delete();
  }

  /// أسماء الملفات المحفوظة
  Future<List<String>> names() async {
    final out = <String>[];
    await for (final e in _dir.list()) {
      final n = e.uri.pathSegments.last;
      if (n.endsWith('.json')) out.add(n.substring(0, n.length - 5));
    }
    return out;
  }

  /// مسح كل بيانات المنشأة من الجهاز (عند تسجيل الخروج)
  Future<void> wipe({Set<String> keep = const {}}) async {
    await for (final e in _dir.list()) {
      final n = e.uri.pathSegments.last.replaceAll('.json', '').replaceAll('.tmp', '');
      if (keep.contains(n)) continue;
      try {
        await e.delete(recursive: true);
      } catch (_) {}
    }
  }
}

class SecureBox {
  SecureBox() : _s = const FlutterSecureStorage();
  final FlutterSecureStorage _s;

  Future<String?> get(String key) async {
    try {
      return await _s.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> set(String key, String? value) async {
    try {
      if (value == null) {
        await _s.delete(key: key);
      } else {
        await _s.write(key: key, value: value);
      }
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> getJson(String key) async {
    final v = await get(key);
    if (v == null) return null;
    try {
      final d = jsonDecode(v);
      return d is Map<String, dynamic> ? d : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> setJson(String key, Map<String, dynamic>? value) => set(key, value == null ? null : jsonEncode(value));
}
