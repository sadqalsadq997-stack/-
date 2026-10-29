import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../core/theme.dart';
import '../features/auth/auth_screens.dart';
import '../features/shell/home_shell.dart';
import '../services/session.dart';
import 'controller.dart';

class FelsyApp extends StatefulWidget {
  const FelsyApp({super.key, required this.services});
  final AppServices services;
  @override
  State<FelsyApp> createState() => _FelsyAppState();
}

class _FelsyAppState extends State<FelsyApp> with WidgetsBindingObserver {
  final _navKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  bool _onKey(KeyEvent _) {
    widget.services.session.touch();
    return false;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    HardwareKeyboard.instance.removeHandler(_onKey);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => widget.services.onLifecycle(state);

  @override
  Widget build(BuildContext context) {
    return Services(
      app: widget.services,
      child: MaterialApp(
        navigatorKey: _navKey,
        title: 'فلسي',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: ThemeMode.system,
        locale: const Locale('ar', 'SA'),
        supportedLocales: const [Locale('ar', 'SA'), Locale('en', 'US')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        // تكبير الخط من إعدادات الجهاز مسموح بحد معقول حتى ما تخرب الشاشات
        builder: (context, child) {
          final mq = MediaQuery.of(context);
          return MediaQuery(
            data: mq.copyWith(textScaler: mq.textScaler.clamp(minScaleFactor: 0.9, maxScaleFactor: 1.25)),
            child: Listener(
              behavior: HitTestBehavior.translucent,
              onPointerDown: (_) => widget.services.session.touch(),
              child: child!,
            ),
          );
        },
        home: ListenableBuilder(
          listenable: widget.services.session,
          builder: (context, _) => switch (widget.services.session.stage) {
            SessionStage.booting => const SplashScreen(),
            SessionStage.signedOut => const LoginScreen(),
            SessionStage.inactive => const InactiveScreen(),
            SessionStage.needsWebSetup => const WebSetupScreen(),
            SessionStage.needsAdminPin => const PinScreen(setup: true),
            SessionStage.locked => const PinScreen(),
            SessionStage.unlocked => const HomeShell(),
          },
        ),
      ),
    );
  }
}
