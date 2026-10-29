// عناصر واجهة مشتركة بهوية فلسي

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';

class FelsyLogo extends StatelessWidget {
  const FelsyLogo({super.key, this.size = 40, this.light = false, this.withText = true});
  final double size;
  final bool light;
  final bool withText;

  @override
  Widget build(BuildContext context) {
    final mark = Image.asset('assets/images/felsy-mark.png', width: size, height: size * 0.89, fit: BoxFit.contain, filterQuality: FilterQuality.high);
    if (!withText) return mark;
    final color = light ? Colors.white : const Color(0xFF222528);
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        mark,
        SizedBox(width: size * 0.2),
        Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('Felsy', style: TextStyle(fontSize: size * 0.62, fontWeight: FontWeight.w700, color: color, height: 1)),
          Text('فلسي', style: TextStyle(fontSize: size * 0.3, fontWeight: FontWeight.w700, color: color.withValues(alpha: 0.6), height: 1.3)),
        ]),
      ]),
    );
  }
}

class FCard extends StatelessWidget {
  const FCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.color, this.borderColor});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Material(
      color: color ?? s.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: borderColor ?? s.outline)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing, this.icon});
  final String text;
  final Widget? trailing;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10, top: 4),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary), const SizedBox(width: 8)],
          Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
          ?trailing,
        ]),
      );
}

class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.icon, this.color, this.sub, this.isMoney = false});
  final String label;
  final num value;
  final IconData? icon;
  final Color? color;
  final String? sub;
  final bool isMoney;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    final c = color ?? s.primary;
    return FCard(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (icon != null)
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 18, color: c),
            ),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: TextStyle(color: s.onSurfaceVariant, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis)),
        ]),
        const SizedBox(height: 10),
        FittedBox(
          alignment: AlignmentDirectional.centerStart,
          fit: BoxFit.scaleDown,
          child: Text(isMoney ? '${money(value)} $riyal' : (value % 1 == 0 ? '${value.toInt()}' : value.toStringAsFixed(2)),
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        ),
        if (sub != null) Text(sub!, style: TextStyle(fontSize: 12, color: s.onSurfaceVariant)),
      ]),
    );
  }

}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: s.primaryContainer, shape: BoxShape.circle),
            child: Icon(icon, size: 34, color: s.primary),
          ),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900), textAlign: TextAlign.center),
          if (body != null) ...[
            const SizedBox(height: 6),
            Text(body!, style: TextStyle(color: s.onSurfaceVariant), textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.color, this.icon});
  final String label;
  final Color? color;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: c), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// لون حالة الهيئة
Color zatcaColor(String? s) => switch (s) {
      'reported' || 'cleared' => Brand.success,
      'reported_warnings' || 'cleared_warnings' => Brand.teal,
      'rejected' || 'failed' => Brand.danger,
      'error' => Brand.warning,
      'queued' => Brand.warning,
      _ => Brand.info,
    };

class ZatcaChip extends StatelessWidget {
  const ZatcaChip(this.status, {super.key});
  final String? status;
  @override
  Widget build(BuildContext context) => StatusChip(zatcaStatusLabels[status] ?? status ?? '—', color: zatcaColor(status),
      icon: (status ?? '').startsWith('reported') || (status ?? '').startsWith('cleared') ? Icons.verified_rounded : Icons.schedule_rounded);
}

/// شريط "بدون إنترنت"
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.online, required this.pending});
  final bool online;
  final int pending;
  @override
  Widget build(BuildContext context) {
    if (online && pending == 0) return const SizedBox.shrink();
    final offline = !online;
    return Material(
      color: offline ? const Color(0xFFFFF4DC) : const Color(0xFFE6F4EF),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          child: Row(children: [
            Icon(offline ? Icons.cloud_off_rounded : Icons.cloud_upload_rounded, size: 18, color: offline ? Brand.warning : Brand.success),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                offline
                    ? 'بدون إنترنت — البيع شغال والفواتير تنحفظ بالجهاز${pending > 0 ? ' ($pending بانتظار الرفع)' : ''}'
                    : 'جاري رفع $pending فاتورة للسيرفر والهيئة…',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: offline ? const Color(0xFF7A5200) : const Color(0xFF1B5E45)),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

void showSnack(BuildContext context, String msg, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  m?.hideCurrentSnackBar();
  m?.showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: error ? Brand.danger : null,
    duration: Duration(seconds: error ? 5 : 3),
  ));
}

Future<bool> confirm(BuildContext context, String title, String body, {String ok = 'تأكيد', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Brand.danger) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r ?? false;
}

/// زر بحالة تحميل
class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.label, required this.onPressed, this.busy = false, this.icon, this.expand = true});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  final bool expand;
  @override
  Widget build(BuildContext context) {
    final child = busy
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          ]);
    final b = FilledButton(onPressed: busy ? null : onPressed, child: child);
    return expand ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// جسم شاشة يجيب بيانات من السيرفر (تحميل / خطأ مع إعادة / بيانات)
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder, this.empty});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final Widget? empty;
  @override
  State<AsyncView<T>> createState() => _AsyncViewState<T>();
}

class _AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final d = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null && _data == null) {
      final offline = _error is ApiException && (_error as ApiException).isNetwork;
      return EmptyState(
        icon: offline ? Icons.cloud_off_rounded : Icons.error_outline_rounded,
        title: offline ? 'هذي الصفحة تحتاج إنترنت' : 'تعذر التحميل',
        body: friendlyError(_error!),
        action: OutlinedButton.icon(onPressed: _reload, icon: const Icon(Icons.refresh_rounded), label: const Text('إعادة المحاولة')),
      );
    }
    return RefreshIndicator(onRefresh: _reload, child: widget.builder(context, _data as T, _reload));
  }
}

/// حقل نص بعنوان
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key, required this.label, required this.controller, this.hint, this.keyboard, this.ltr = false,
    this.maxLength, this.validator, this.suffix, this.obscure = false, this.autofocus = false, this.onSubmitted, this.lines = 1,
  });
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboard;
  final bool ltr;
  final int? maxLength;
  final String? Function(String?)? validator;
  final Widget? suffix;
  final bool obscure;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;
  final int lines;

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        keyboardType: keyboard,
        textDirection: ltr ? TextDirection.ltr : null,
        maxLength: maxLength,
        validator: validator,
        obscureText: obscure,
        autofocus: autofocus,
        onFieldSubmitted: onSubmitted,
        minLines: lines,
        maxLines: obscure ? 1 : lines,
        decoration: InputDecoration(labelText: label, hintText: hint, suffixIcon: suffix, counterText: ''),
      );
}

/// عرض متجاوب: عمودين في الشاشات العريضة
bool isWide(BuildContext context) => MediaQuery.sizeOf(context).width >= 900;
bool isPhone(BuildContext context) => MediaQuery.sizeOf(context).width < 600;
