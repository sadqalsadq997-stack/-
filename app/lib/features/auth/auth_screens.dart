// شاشات الدخول: البداية، تسجيل الدخول، رمز PIN، الاشتراك، الإعداد من الموقع
// (إنشاء الحساب والاشتراك من الموقع فقط — التطبيق للدخول والتشغيل)

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/controller.dart';
import '../../core/config.dart';
import '../../core/theme.dart';
import '../../services/session.dart';
import '../../ui/widgets.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: FelsyLogo(size: 64)));
}

/// خلفية شاشات الدخول (نفس روح الموقع)
class _AuthShell extends StatelessWidget {
  const _AuthShell({required this.child, this.title, this.subtitle});
  final Widget child;
  final String? title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: Theme.of(context).brightness == Brightness.dark
                ? [const Color(0xFF0E1513), const Color(0xFF13201B)]
                : [Brand.beige, const Color(0xFFE9F2EC)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const FelsyLogo(size: 52),
                  const SizedBox(height: 22),
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: s.surface,
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(color: s.outline),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 30, offset: const Offset(0, 12))],
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (title != null) Text(title!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 4),
                        Text(subtitle!, textAlign: TextAlign.center, style: TextStyle(color: s.onSurfaceVariant)),
                      ],
                      if (title != null) const SizedBox(height: 20),
                      child,
                    ]),
                  ),
                  const SizedBox(height: 18),
                  Text('felsy.org', style: TextStyle(color: s.onSurfaceVariant, fontSize: 12)),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_email.text.trim().isEmpty || _pass.text.isEmpty) {
      setState(() => _error = 'اكتب البريد وكلمة المرور');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await Services.read(context).session.login(_email.text, _pass.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) _pass.clear();
  }

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return _AuthShell(
      title: 'أهلاً بعودتك',
      subtitle: 'سجّل دخولك لحساب منشأتك',
      child: AutofillGroup(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textDirection: TextDirection.ltr,
            autofillHints: const [AutofillHints.email, AutofillHints.username],
            decoration: const InputDecoration(labelText: 'البريد الإلكتروني', prefixIcon: Icon(Icons.alternate_email_rounded)),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pass,
            obscureText: !_show,
            textDirection: TextDirection.ltr,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) => _login(),
            decoration: InputDecoration(
              labelText: 'كلمة المرور',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(icon: Icon(_show ? Icons.visibility_off_rounded : Icons.visibility_rounded), onPressed: () => setState(() => _show = !_show)),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Brand.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700)),
            ),
          ],
          const SizedBox(height: 18),
          BusyButton(label: 'دخول', busy: _busy, onPressed: _login, icon: Icons.login_rounded),
          const SizedBox(height: 16),
          Text(
            'ما عندك حساب؟ الاشتراك وإنشاء الحساب من موقع ${AppConfig.siteUrl.replaceFirst('https://', '')}',
            textAlign: TextAlign.center,
            style: TextStyle(color: s.onSurfaceVariant, fontSize: 13),
          ),
          Text('نسيت كلمة المرور؟ استعدها من الموقع.', textAlign: TextAlign.center, style: TextStyle(color: s.onSurfaceVariant, fontSize: 12)),
        ]),
      ),
    );
  }
}

class PinScreen extends StatefulWidget {
  const PinScreen({super.key, this.setup = false});
  final bool setup;
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> with SingleTickerProviderStateMixin {
  String _pin = '';
  String? _first; // للضبط الأول: تأكيد الرمز
  String? _error;
  bool _busy = false;
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
  final _focus = FocusNode();

  @override
  void dispose() {
    _shake.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _press(String d) async {
    if (_busy || _pin.length >= 4) return;
    setState(() {
      _pin += d;
      _error = null;
    });
    if (_pin.length == 4) await _submit();
  }

  void _back() {
    if (_busy || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _submit() async {
    final app = Services.read(context);
    if (widget.setup) {
      if (_first == null) {
        setState(() {
          _first = _pin;
          _pin = '';
        });
        return;
      }
      if (_first != _pin) {
        _fail('الرمزين غير متطابقين — أعد المحاولة');
        _first = null;
        return;
      }
      setState(() => _busy = true);
      final err = await app.session.setAdminPin(_pin);
      if (!mounted) return;
      setState(() => _busy = false);
      if (err != null) _fail(err);
      return;
    }
    setState(() => _busy = true);
    final err = await app.session.unlock(_pin);
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) _fail(err);
  }

  void _fail(String msg) {
    HapticFeedback.mediumImpact();
    _shake.forward(from: 0);
    setState(() {
      _error = msg;
      _pin = '';
    });
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final ch = e.character;
    if (ch != null && RegExp(r'^[0-9٠-٩]$').hasMatch(ch)) {
      final d = '٠١٢٣٤٥٦٧٨٩'.contains(ch) ? '${'٠١٢٣٤٥٦٧٨٩'.indexOf(ch)}' : ch;
      unawaited(_press(d));
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.backspace) {
      _back();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final s = Theme.of(context).colorScheme;
    final acc = app.session.account;
    final title = widget.setup ? (_first == null ? 'اختر رمز PIN للمدير' : 'أعد كتابة الرمز للتأكيد') : 'أدخل رمز PIN';
    return Focus(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: _onKey,
      child: _AuthShell(
        title: title,
        subtitle: widget.setup ? 'رمز من 4 أرقام لفتح النظام — لا تشاركه' : (acc?.name.isNotEmpty ?? false) ? acc!.name : null,
        child: Column(children: [
          AnimatedBuilder(
            animation: _shake,
            builder: (_, child) => Transform.translate(offset: Offset(math.sin(_shake.value * math.pi * 6) * 10 * (1 - _shake.value), 0), child: child),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (i) {
                final on = i < _pin.length;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: const EdgeInsets.symmetric(horizontal: 9),
                  width: 18, height: 18,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: on ? s.primary : Colors.transparent, border: Border.all(color: on ? s.primary : s.outline, width: 2)),
                );
              }),
            ),
          ),
          SizedBox(
            height: 46,
            child: Center(
              child: _busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                  : _error != null
                      ? Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700, fontSize: 13))
                      : null,
            ),
          ),
          Directionality(
            textDirection: TextDirection.ltr,
            child: GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.45,
              children: [
                for (final d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']) _Key(label: d, onTap: () => _press(d)),
                const SizedBox.shrink(),
                _Key(label: '0', onTap: () => _press('0')),
                _Key(icon: Icons.backspace_outlined, onTap: _back),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (!widget.setup)
            TextButton.icon(
              onPressed: () async {
                final ok = await confirm(context, 'تسجيل الخروج', 'تبي تطلع من حساب المنشأة على هذا الجهاز؟', ok: 'خروج');
                if (!ok || !context.mounted) return;
                final pending = Services.read(context).sales.pendingCount;
                if (pending > 0 && context.mounted) {
                  showSnack(context, 'فيه $pending فاتورة ما انرفعت — افتح النظام واتصل بالإنترنت أولاً', error: true);
                  return;
                }
                await Services.read(context).session.logout();
              },
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('حساب آخر'),
            ),
        ]),
      ),
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({this.label, this.icon, required this.onTap});
  final String? label;
  final IconData? icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Material(
      color: s.surfaceContainer,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Center(
          child: icon != null ? Icon(icon, size: 24) : Text(label!, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}

class InactiveScreen extends StatelessWidget {
  const InactiveScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final acc = app.session.account;
    return _AuthShell(
      title: 'الاشتراك غير فعّال',
      subtitle: acc?.name,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('اشتراك المنشأة غير فعّال حالياً. لمتابعة الاشتراك تواصل مع مالك حساب المنشأة، وبعد التفعيل اضغط تحديث.',
            textAlign: TextAlign.center),
        if (app.sales.pendingCount > 0) ...[
          const SizedBox(height: 8),
          Text('فواتيرك المحفوظة بالجهاز (${app.sales.pendingCount}) محفوظة وترتفع للهيئة تلقائياً.', textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
        if (acc?.periodEnd != null) ...[
          const SizedBox(height: 8),
          Text('انتهى في ${acc!.periodEnd!.toLocal().toString().substring(0, 10)}', textAlign: TextAlign.center),
        ],
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: () async {
            final a = await app.session.refreshAccount();
            if (a != null && a.paid) app.session.lock();
          },
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('تحديث'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () async {
            if (!await confirm(context, 'تسجيل الخروج', 'تبي تطلع من حساب المنشأة على هذا الجهاز؟', ok: 'خروج')) return;
            await app.session.logout();
          },
          child: const Text('تسجيل الخروج'),
        ),
      ]),
    );
  }
}

class WebSetupScreen extends StatelessWidget {
  const WebSetupScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return _AuthShell(
      title: 'أكمل إعداد المنشأة',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('الإعداد الأول (بيانات المنشأة والفروع ورمز PIN) يتم مرة وحدة من موقع ${AppConfig.siteUrl.replaceFirst('https://', '')} — بعدها كل شيء يشتغل من التطبيق.',
            textAlign: TextAlign.center),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: () async {
            await app.session.logout();
          },
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('أكملت الإعداد — سجّل الدخول من جديد'),
        ),
      ]),
    );
  }
}

/// اختيار الفرع (إذا المنشأة فيها أكثر من فرع)
Future<void> chooseBranchDialog(BuildContext context) async {
  final app = Services.read(context);
  final id = await showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: const Text('اختر فرع هذا الجهاز', style: TextStyle(fontWeight: FontWeight.w900)),
      children: [
        for (final b in app.catalog.branches)
          SimpleDialogOption(onPressed: () => Navigator.pop(c, b.id), child: Padding(padding: const EdgeInsets.all(6), child: Text(b.name, style: const TextStyle(fontSize: 16)))),
      ],
    ),
  );
  if (id != null) await app.chooseBranch(id);
}

/// للاستخدام في الواجهات: هل المستخدم يقدر يفتح هذا القسم؟
bool canOpen(BuildContext context, String path) => Services.of(context).session.operator?.can(path) ?? false;

extension SessionX on SessionService {
  bool get isAdmin => operator?.isAdmin ?? false;
}
