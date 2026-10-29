// ══════════════════════════════════════════════════════════════════
// فلسي Felsy — تطبيق نقطة البيع والمحاسبة والفوترة الإلكترونية
// ويندوز • آيفون/آيباد • أندرويد — يشتغل بدون إنترنت
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app/app.dart';
import 'app/controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
  final services = await AppServices.create();
  runApp(FelsyApp(services: services));
}
