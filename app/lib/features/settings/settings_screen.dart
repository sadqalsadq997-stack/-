// ══════════════════════════════════════════════════════════════════
// الإعدادات
//  • الحساب والفرع والجهاز والمزامنة
//  • الطابعة (شبكة 9100 / طابعة النظام / بدون) + تجربة
//  • الإشعارات: تشغيل/إيقاف، الإذن، ساعات الهدوء، كل نوع لحاله
//  • الخصوصية والدعم + حذف الحساب (مطلوب من آبل وجوجل)
//  • القفل وتسجيل الخروج (ممنوع لو فيه فواتير ما انرفعت)
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../printing/printer.dart';
import '../../services/alerts.dart';
import '../../ui/widgets.dart';
import '../auth/auth_screens.dart';
import '../shell/home_shell.dart';

Future<void> openSite(BuildContext context, String path) async {
  final uri = Uri.parse('${AppConfig.siteUrl}$path');
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {}
  if (!ok && context.mounted) {
    await Clipboard.setData(ClipboardData(text: uri.toString()));
    if (context.mounted) showSnack(context, 'تم نسخ الرابط: $uri');
  }
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final wide = isWide(context);
    final cards = <Widget>[
      const _AccountCard(),
      const _DeviceCard(),
      const _PrinterCard(),
      const _NotificationsCard(),
      const _PrivacyCard(),
      const _SecurityCard(),
    ];
    return Scaffold(
      appBar: const SectionAppBar(title: 'الإعدادات'),
      body: ListenableBuilder(
        listenable: Listenable.merge([app, app.device, app.catalog, app.sales, app.printer, app.alerts, app.connectivity]),
        builder: (context, _) => wide
            ? SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: Column(children: [for (final c in cards.take(3)) Padding(padding: const EdgeInsets.only(bottom: 12), child: c)])),
                  const SizedBox(width: 12),
                  Expanded(child: Column(children: [for (final c in cards.skip(3)) Padding(padding: const EdgeInsets.only(bottom: 12), child: c)])),
                ]),
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 32),
                children: [for (final c in cards) Padding(padding: const EdgeInsets.only(bottom: 12), child: c)],
              ),
      ),
    );
  }
}

Widget _row(String label, String value, {bool ltr = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
        Flexible(
          child: Text(value, textDirection: ltr ? TextDirection.ltr : null, textAlign: TextAlign.left, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ),
      ]),
    );

// ── الحساب والفرع ───────────────────────────────────────────────────
class _AccountCard extends StatelessWidget {
  const _AccountCard();
  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final acc = app.session.account;
    final op = app.session.operator;
    final branches = app.catalog.branches;
    final branchName = branches.where((b) => b.id == app.branchId).map((b) => b.name).firstOrNull ?? '—';
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SectionTitle('الحساب', icon: Icons.storefront_rounded),
        _row('المنشأة', acc?.name ?? '—'),
        if (acc?.accountNumber != null) _row('رقم الحساب', acc!.accountNumber!, ltr: true),
        if (acc?.email != null) _row('البريد', acc!.email!, ltr: true),
        _row('المستخدم الحالي', op?.displayName ?? '—'),
        if (acc?.plan != null) _row('الباقة', acc!.plan!),
        if (acc?.periodEnd != null) _row('الاشتراك فعّال حتى', dateKsa(acc!.periodEnd!)),
        const Divider(height: 22),
        Row(children: [
          const Icon(Icons.store_mall_directory_rounded, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('فرع هذا الجهاز: $branchName', style: const TextStyle(fontWeight: FontWeight.w700))),
          if (branches.length > 1 && op?.branchId == null)
            TextButton(
              onPressed: () async {
                final pending = app.sales.pendingCount;
                if (pending > 0) {
                  showSnack(context, 'ارفع الفواتير المعلّقة ($pending) أولاً قبل تغيير الفرع', error: true);
                  return;
                }
                if (!app.connectivity.online) {
                  showSnack(context, 'تغيير الفرع يحتاج إنترنت', error: true);
                  return;
                }
                await chooseBranchDialog(context);
              },
              child: const Text('تغيير'),
            ),
        ]),
        if (op?.branchId != null) const Text('الموظف مربوط بفرع محدد من إدارة الموظفين.', style: TextStyle(fontSize: 12)),
      ]),
    );
  }
}

// ── الجهاز والمزامنة ───────────────────────────────────────────────
class _DeviceCard extends StatefulWidget {
  const _DeviceCard();
  @override
  State<_DeviceCard> createState() => _DeviceCardState();
}

class _DeviceCardState extends State<_DeviceCard> {
  bool _busy = false;

  Future<void> _sync() async {
    final app = Services.read(context);
    if (!app.connectivity.online && !await app.connectivity.check()) {
      if (mounted) showSnack(context, 'لا يوجد اتصال بالإنترنت', error: true);
      return;
    }
    setState(() => _busy = true);
    await app.syncNow(full: true);
    if (!mounted) return;
    setState(() => _busy = false);
    showSnack(context, app.setupError ?? (app.sales.pendingCount == 0 ? 'تمت المزامنة ✓' : 'باقي ${app.sales.pendingCount} فاتورة — تُرفع تلقائياً'),
        error: app.setupError != null);
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final d = app.device;
    final pending = app.sales.pendingCount;
    final failed = app.sales.failedCount;
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SectionTitle('الجهاز والمزامنة', icon: Icons.sync_rounded,
            trailing: StatusChip(app.connectivity.online ? 'متصل' : 'بدون إنترنت', color: app.connectivity.online ? Brand.success : Brand.warning)),
        _row('رمز الجهاز (في أرقام الفواتير)', d.code ?? 'غير مسجّل بعد', ltr: true),
        _row('آخر رقم فاتورة', d.nextSeq > 1 ? 'INV-${d.code ?? '?'}-${(d.nextSeq - 1).toString().padLeft(6, '0')}' : '—', ltr: true),
        _row('آخر مزامنة', app.catalog.lastSync == null ? '—' : ago(app.catalog.lastSync!)),
        _row('المنتجات / العملاء بالجهاز', '${app.catalog.products.length} / ${app.catalog.customers.length}'),
        _row('فواتير بانتظار الرفع', '$pending'),
        if (failed > 0) _row('فواتير رفضها السيرفر', '$failed'),
        if (app.setupError != null)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(app.setupError!, style: const TextStyle(color: Brand.danger, fontSize: 12))),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BusyButton(label: 'مزامنة الآن', icon: Icons.sync_rounded, busy: _busy, onPressed: _sync)),
          if (failed > 0) ...[
            const SizedBox(width: 8),
            OutlinedButton(onPressed: () => ShellNav.go(context, 'orders'), child: const Text('مراجعة المرفوضة')),
          ],
        ]),
        const SizedBox(height: 6),
        const Text('البيع يشتغل بدون إنترنت: الفواتير تنحفظ بالجهاز وترتفع للسيرفر والهيئة تلقائياً أول ما يرجع الاتصال.', style: TextStyle(fontSize: 12)),
      ]),
    );
  }
}

// ── الطابعة ─────────────────────────────────────────────────────────
class _PrinterCard extends StatefulWidget {
  const _PrinterCard();
  @override
  State<_PrinterCard> createState() => _PrinterCardState();
}

class _PrinterCardState extends State<_PrinterCard> {
  late PrinterSettings _s;
  late final TextEditingController _host;
  late final TextEditingController _port;
  bool _testing = false;
  List<({String name, String url})> _system = const [];

  @override
  void initState() {
    super.initState();
    final cur = Services.read(context).printer.settings;
    _s = PrinterSettings.from(cur.toJson());
    _host = TextEditingController(text: _s.host);
    _port = TextEditingController(text: '${_s.port}');
    _loadSystem();
  }

  Future<void> _loadSystem() async {
    final p = Services.read(context).printer;
    if (!p.isDesktop) return;
    final list = await p.systemPrinters();
    if (mounted) setState(() => _system = [for (final x in list) (name: x.name, url: x.url)]);
  }

  @override
  void dispose() {
    _host.dispose();
    _port.dispose();
    super.dispose();
  }

  static final _ipv4 = RegExp(r'^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$');
  static final _hostname = RegExp(r'^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$');

  Future<bool> _save() async {
    if (_s.mode == 'network') {
      final h = _host.text.trim();
      final port = int.tryParse(_port.text.trim()) ?? 0;
      if (!(_ipv4.hasMatch(h) || _hostname.hasMatch(h))) {
        showSnack(context, 'اكتب عنوان IP الطابعة مثل 192.168.1.100', error: true);
        return false;
      }
      if (port < 1 || port > 65535) {
        showSnack(context, 'رقم المنفذ غير صحيح (عادة 9100)', error: true);
        return false;
      }
      _s.host = h;
      _s.port = port;
    }
    await Services.read(context).printer.save(_s);
    return true;
  }

  Future<void> _test() async {
    if (!await _save() || !mounted) return;
    final app = Services.read(context);
    setState(() => _testing = true);
    final err = await app.printer.testPrint(app.catalog.seller);
    if (!mounted) return;
    setState(() => _testing = false);
    showSnack(context, err ?? 'تم إرسال صفحة التجربة ✓', error: err != null);
  }

  void _set(void Function() f) {
    setState(f);
    _save();
  }

  @override
  Widget build(BuildContext context) {
    final p = Services.of(context).printer;
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SectionTitle('الطابعة', icon: Icons.print_rounded),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'network', label: Text('حرارية (شبكة)'), icon: Icon(Icons.lan_rounded)),
            ButtonSegment(value: 'system', label: Text('طابعة النظام'), icon: Icon(Icons.print_rounded)),
            ButtonSegment(value: 'off', label: Text('بدون'), icon: Icon(Icons.print_disabled_rounded)),
          ],
          selected: {_s.mode},
          onSelectionChanged: (v) => _set(() => _s.mode = v.first),
        ),
        const SizedBox(height: 10),
        if (_s.mode == 'network') ...[
          Row(children: [
            Expanded(
              flex: 3,
              child: LabeledField(label: 'عنوان الطابعة (IP)', hint: '192.168.1.100', controller: _host, ltr: true, keyboard: TextInputType.url,
                  onSubmitted: (_) => _save()),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: LabeledField(label: 'المنفذ', controller: _port, ltr: true, keyboard: TextInputType.number, onSubmitted: (_) => _save()),
            ),
          ]),
          const SizedBox(height: 4),
          const Text('الطابعة والجهاز لازم يكونون على نفس شبكة الواي فاي. العنوان تلقاه في ورقة الإعدادات اللي تطبعها الطابعة.', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 8),
        ],
        if (_s.mode == 'system' && p.isDesktop) ...[
          DropdownButtonFormField<String?>(
            initialValue: _system.any((x) => x.url == _s.systemPrinter) ? _s.systemPrinter : null,
            decoration: const InputDecoration(labelText: 'الطابعة (طباعة مباشرة بدون نافذة)'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('اسألني كل مرة')),
              for (final x in _system) DropdownMenuItem<String?>(value: x.url, child: Text(x.name, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => _set(() => _s.systemPrinter = v),
          ),
          const SizedBox(height: 8),
        ],
        if (_s.mode != 'off') ...[
          Row(children: [
            const Expanded(child: Text('عرض الورق')),
            SegmentedButton<int>(
              showSelectedIcon: false,
              segments: const [ButtonSegment(value: 58, label: Text('58 مم')), ButtonSegment(value: 80, label: Text('80 مم'))],
              selected: {_s.paper},
              onSelectionChanged: (v) => _set(() => _s.paper = v.first),
            ),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            const Expanded(child: Text('عدد النسخ')),
            IconButton(onPressed: _s.copies > 1 ? () => _set(() => _s.copies--) : null, icon: const Icon(Icons.remove_circle_outline_rounded)),
            Text('${_s.copies}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            IconButton(onPressed: _s.copies < 3 ? () => _set(() => _s.copies++) : null, icon: const Icon(Icons.add_circle_outline_rounded)),
          ]),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('طباعة تلقائية بعد كل بيع'),
            value: _s.autoPrint,
            onChanged: (v) => _set(() => _s.autoPrint = v),
          ),
          if (_s.mode == 'network')
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('فتح درج النقود مع الطباعة'),
              subtitle: const Text('للدرج الموصول بالطابعة'),
              value: _s.openDrawer,
              onChanged: (v) => _set(() => _s.openDrawer = v),
            ),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: _testing ? null : _test,
            icon: _testing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.receipt_rounded),
            label: const Text('طباعة تجربة'),
          ),
        ],
      ]),
    );
  }
}

// ── الإشعارات ───────────────────────────────────────────────────────
class _NotificationsCard extends StatelessWidget {
  const _NotificationsCard();
  @override
  Widget build(BuildContext context) {
    final a = Services.of(context).alerts;
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SectionTitle('الإشعارات', icon: Icons.notifications_active_rounded),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('تفعيل الإشعارات المهمة'),
          subtitle: const Text('حد أقصى 6 في اليوم — العاجلة فقط تتجاوز الحد'),
          value: a.enabled,
          onChanged: (v) async {
            await a.setEnabled(v);
            if (v) {
              final ok = await a.requestPermission();
              if (!ok && context.mounted) {
                showSnack(context, 'الإذن مرفوض من إعدادات الجهاز — فعّل إشعارات فلسي من إعدادات النظام', error: true);
              }
            }
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('ساعات الهدوء'),
          subtitle: const Text('بدون إشعارات من 11 مساءً إلى 7 صباحاً (إلا العاجلة)'),
          value: a.quietHours,
          onChanged: a.enabled ? a.setQuiet : null,
        ),
        const Divider(),
        const Text('أنواع التنبيهات', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final e in alertTypeLabels.entries)
          CheckboxListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(e.value),
            value: !a.disabledTypes.contains(e.key),
            onChanged: a.enabled ? (v) => a.toggleType(e.key, v ?? true) : null,
          ),
        const SizedBox(height: 4),
        const Text('الإشعارات تطلع من التطبيق نفسه على جهازك — ما نستخدم أي خدمة إشعارات خارجية ولا نرسل بياناتك لأي طرف.', style: TextStyle(fontSize: 12)),
      ]),
    );
  }
}

// ── الخصوصية والدعم ────────────────────────────────────────────────
class _PrivacyCard extends StatelessWidget {
  const _PrivacyCard();
  @override
  Widget build(BuildContext context) {
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SectionTitle('الخصوصية والدعم', icon: Icons.privacy_tip_rounded),
        const Text(
          '• بياناتك تنحفظ في خوادم فلسي وفي جهازك فقط — ما نبيعها ولا نشاركها مع معلنين.\n'
          '• ما فيه تتبّع ولا إعلانات ولا أدوات تحليلات داخل التطبيق.\n'
          '• بيانات الدخول في الخزنة الآمنة للجهاز، والاتصال مشفّر (HTTPS).\n'
          '• الفواتير تُرسل لهيئة الزكاة والضريبة والجمارك فقط كما يلزم النظام.',
          style: TextStyle(fontSize: 13, height: 1.7),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          OutlinedButton.icon(onPressed: () => openSite(context, '/privacy'), icon: const Icon(Icons.policy_rounded), label: const Text('سياسة الخصوصية')),
          OutlinedButton.icon(onPressed: () => openSite(context, '/terms'), icon: const Icon(Icons.gavel_rounded), label: const Text('الشروط والأحكام')),
          OutlinedButton.icon(
            onPressed: () async {
              final uri = Uri(scheme: 'mailto', path: AppConfig.supportEmail, query: 'subject=${Uri.encodeComponent('دعم تطبيق فلسي')}');
              var ok = false;
              try {
                ok = await launchUrl(uri);
              } catch (_) {}
              if (!ok) {
                await Clipboard.setData(const ClipboardData(text: AppConfig.supportEmail));
                if (context.mounted) showSnack(context, 'تم نسخ بريد الدعم ${AppConfig.supportEmail}');
              }
            },
            icon: const Icon(Icons.support_agent_rounded),
            label: const Text('الدعم الفني'),
          ),
          OutlinedButton.icon(
            onPressed: () => showLicensePage(
              context: context,
              applicationName: 'فلسي',
              applicationVersion: AppConfig.version,
              applicationIcon: const Padding(padding: EdgeInsets.all(8), child: FelsyLogo(size: 48)),
            ),
            icon: const Icon(Icons.description_rounded),
            label: const Text('التراخيص'),
          ),
        ]),
        const SizedBox(height: 10),
        const Text('فلسي ${AppConfig.version}', style: TextStyle(fontSize: 12)),
      ]),
    );
  }
}

// ── الأمان والحساب ──────────────────────────────────────────────────
class _SecurityCard extends StatelessWidget {
  const _SecurityCard();

  Future<void> _logout(BuildContext context) async {
    final app = Services.read(context);
    final pending = app.sales.pendingCount;
    if (pending > 0) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('ما تقدر تطلع الحين'),
          content: Text('فيه $pending فاتورة بالجهاز ما انرفعت للسيرفر والهيئة. اتصل بالإنترنت واضغط "مزامنة الآن" وبعدها اطلع — حتى ما تضيع الفواتير.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('حسناً'))],
        ),
      );
      return;
    }
    if (!await confirm(context, 'تسجيل الخروج', 'يمسح بيانات المنشأة من هذا الجهاز ويرجعك لشاشة الدخول.', ok: 'خروج', danger: true)) return;
    await app.session.logout();
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final owner = app.session.account?.role == 'owner';
    return FCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SectionTitle('الأمان', icon: Icons.shield_rounded),
        const Text('النظام يقفل تلقائياً بعد 30 دقيقة بدون استخدام ويطلب رمز PIN.', style: TextStyle(fontSize: 12)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(onPressed: app.session.lock, icon: const Icon(Icons.lock_rounded), label: const Text('قفل الآن')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _logout(context),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('تسجيل الخروج'),
            ),
          ),
        ]),
        const Divider(height: 28),
        const Text('حذف الحساب', style: TextStyle(fontWeight: FontWeight.w900, color: Brand.danger)),
        const SizedBox(height: 4),
        Text(
          owner
              ? 'يحذف المنشأة وكل الفروع والمنتجات والفواتير والعملاء وحسابات الموظفين نهائياً — ولا يمكن استرجاعها.'
              : 'حسابك تابع لمنشأة، وحذفه يتم من مالك المنشأة (إدارة الموظفين). تقدر تطلب الحذف من الدعم الفني أيضاً.',
          style: const TextStyle(fontSize: 12),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: owner
              ? TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: Brand.danger),
                  onPressed: () => showDialog<void>(context: context, builder: (_) => const _DeleteAccountDialog()),
                  icon: const Icon(Icons.delete_forever_rounded),
                  label: const Text('حذف الحساب نهائياً'),
                )
              : TextButton.icon(
                  onPressed: () async {
                    final uri = Uri(scheme: 'mailto', path: AppConfig.supportEmail,
                        query: 'subject=${Uri.encodeComponent('طلب حذف حساب')}&body=${Uri.encodeComponent('البريد: ${app.session.account?.email ?? ''}')}');
                    var ok = false;
                    try {
                      ok = await launchUrl(uri);
                    } catch (_) {}
                    if (!ok) {
                      await Clipboard.setData(const ClipboardData(text: AppConfig.supportEmail));
                      if (context.mounted) showSnack(context, 'تم نسخ بريد الدعم ${AppConfig.supportEmail}');
                    }
                  },
                  icon: const Icon(Icons.mail_rounded),
                  label: const Text('طلب حذف حسابي'),
                ),
        ),
      ]),
    );
  }
}

class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();
  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _acc = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _acc.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final app = Services.read(context);
    if (_acc.text.trim() != (app.session.account?.accountNumber ?? '')) {
      setState(() => _error = 'اكتب رقم الحساب بشكل صحيح للتأكيد');
      return;
    }
    if (_pass.text.isEmpty) {
      setState(() => _error = 'اكتب كلمة المرور');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await app.api.fn('account-manage', {'action': 'delete_account', 'confirm_account': _acc.text.trim(), 'password': _pass.text},
          timeout: const Duration(seconds: 60));
      if (!mounted) return;
      Navigator.pop(context);
      await app.session.logout(discardPending: true);
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return AlertDialog(
      icon: const Icon(Icons.warning_rounded, color: Brand.danger, size: 36),
      title: const Text('هل ترغب حقاً بحذف حسابك؟'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('هذا الإجراء نهائي. كل بيانات منشأتك تنحذف ولا يمكن استرجاعها.'),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Brand.warning.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Text('تنبيه: نظام ضريبة القيمة المضافة يلزم المنشآت بحفظ الفواتير 6 سنوات — نزّل نسخة من فواتيرك (من الموقع) قبل الحذف.',
                style: TextStyle(fontSize: 12)),
          ),
          if (app.sales.pendingCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('فيه ${app.sales.pendingCount} فاتورة بالجهاز ما انرفعت وبتنحذف.', style: const TextStyle(color: Brand.danger, fontSize: 12)),
            ),
          const SizedBox(height: 12),
          LabeledField(label: 'اكتب رقم الحساب ${app.session.account?.accountNumber ?? ''} للتأكيد', controller: _acc, ltr: true, keyboard: TextInputType.number),
          const SizedBox(height: 10),
          LabeledField(label: 'كلمة المرور', controller: _pass, obscure: true, ltr: true),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Brand.danger))),
        ]),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context), child: const Text('إلغاء')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Brand.danger),
          onPressed: _busy ? null : _delete,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('نعم، احذف حسابي نهائياً'),
        ),
      ],
    );
  }
}
