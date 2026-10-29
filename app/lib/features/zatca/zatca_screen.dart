// ══════════════════════════════════════════════════════════════════
// الفوترة الإلكترونية (المرحلة الثانية) — نفس مركز الموقع
//  ١) البيانات الضريبية والعنوان الوطني للفرع
//  ٢) الربط برمز OTP من بوابة فاتورة + اختبار على بيئة الهيئة
//  ٣) المتابعة: المُبلّغ، المعلّق، المتأخر، المرفوض + إعادة الإرسال
// المفتاح الخاص والشهادة في السيرفر فقط (مشفّرة) — ما توصل للتطبيق.
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/controller.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/zatca_qr.dart';
import '../../ui/widgets.dart';
import '../shell/home_shell.dart';

class _Field {
  const _Field(this.k, this.label, {this.hint, this.ltr = false, this.max, this.digits});
  final String k;
  final String label;
  final String? hint;
  final bool ltr;
  final int? max;
  final int? digits; // عدد أرقام إلزامي
}

const _fields = [
  _Field('business_name', 'الاسم القانوني للمنشأة', hint: 'كما في شهادة التسجيل في ضريبة القيمة المضافة'),
  _Field('vat_number', 'الرقم الضريبي', hint: '3XXXXXXXXXXXXX3', ltr: true, max: 15),
  _Field('cr_number', 'السجل التجاري', hint: '10 أرقام', ltr: true, max: 10, digits: 10),
  _Field('branch_name', 'اسم الفرع', hint: 'الفرع الرئيسي'),
  _Field('short_address', 'العنوان المختصر (اختياري)', hint: 'RRRD2929', ltr: true, max: 8),
  _Field('address_building', 'رقم المبنى', hint: '4 أرقام', ltr: true, max: 4, digits: 4),
  _Field('address_postal', 'الرمز البريدي', hint: '5 أرقام', ltr: true, max: 5, digits: 5),
  _Field('address_street', 'الشارع'),
  _Field('address_district', 'الحي'),
  _Field('address_city', 'المدينة', hint: 'الرياض'),
];

class ZatcaScreen extends StatefulWidget {
  const ZatcaScreen({super.key});
  @override
  State<ZatcaScreen> createState() => _ZatcaScreenState();
}

class _ZatcaScreenState extends State<ZatcaScreen> {
  int _gen = 0;

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    final branch = app.branchId;
    return Scaffold(
      appBar: SectionAppBar(title: 'الفوترة الإلكترونية', actions: [
        IconButton(tooltip: 'تحديث', onPressed: () => setState(() => _gen++), icon: const Icon(Icons.refresh_rounded)),
      ]),
      body: branch == null
          ? const EmptyState(icon: Icons.store_mall_directory_outlined, title: 'اختر الفرع أولاً', body: 'من الإعدادات ← الفرع')
          : AsyncView<_ZatcaData>(
              key: ValueKey('$branch$_gen'),
              load: () => _ZatcaData.load(app.api, branch),
              builder: (context, d, reload) => _ZatcaBody(branch: branch, data: d, reload: reload),
            ),
    );
  }
}

class _ZatcaData {
  _ZatcaData(this.status, this.config, this.docs);
  final Map<String, dynamic> status;
  final Map<String, dynamic>? config;
  final List<Map<String, dynamic>> docs;

  bool get active => status['status'] == 'active';

  static Future<_ZatcaData> load(Api api, String branch) async {
    final results = await Future.wait([
      api.rpc('zatca_branch_status', {'p_branch': branch}),
      api.fn('zatca-einvoice', {'action': 'status', 'branch_id': branch}),
    ]);
    final st = asMap(results[0]);
    final cfg = asMap(results[1])['config'];
    var docs = <Map<String, dynamic>>[];
    if (st['status'] == 'active') {
      docs = await api.select('zatca_invoices',
          columns: 'id,invoice_number,invoice_type,invoice_counter,zatca_status,zatca_errors,zatca_warnings,total,created_at,order_id,credit_note_id,doc_kind',
          filters: {'branch_id': 'eq.$branch'}, order: 'invoice_counter.desc.nullslast', limit: 40);
    }
    return _ZatcaData(st, cfg is Map ? asMap(cfg) : null, docs);
  }
}

class _ZatcaBody extends StatefulWidget {
  const _ZatcaBody({required this.branch, required this.data, required this.reload});
  final String branch;
  final _ZatcaData data;
  final Future<void> Function() reload;
  @override
  State<_ZatcaBody> createState() => _ZatcaBodyState();
}

class _ZatcaBodyState extends State<_ZatcaBody> {
  final _form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _c = {
    for (final f in _fields) f.k: TextEditingController(text: toS(widget.data.config?[f.k]) ?? ''),
  };
  late bool _b2b = (toS(widget.data.config?['invoice_types']) ?? '0100') == '1100';
  final _otp = TextEditingController();
  String _env = 'production';
  String _busy = '';
  List<Map<String, dynamic>>? _steps;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    _otp.dispose();
    super.dispose();
  }

  bool get _online => Services.read(context).connectivity.online;

  Future<void> _saveProfile() async {
    if (!_form.currentState!.validate()) return;
    if (!_online) return showSnack(context, 'يحتاج إنترنت', error: true);
    final app = Services.read(context);
    setState(() => _busy = 'save');
    try {
      await app.api.rpc('zatca_save_profile', {
        'p_branch': widget.branch,
        'p': {for (final f in _fields) f.k: _c[f.k]!.text.trim(), 'invoice_types': _b2b ? '1100' : '0100'},
      });
      if (!mounted) return;
      showSnack(context, 'تم حفظ البيانات الضريبية');
      await widget.reload();
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _onboard() async {
    final otp = _otp.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) return showSnack(context, 'رمز OTP: 6 أرقام من بوابة فاتورة', error: true);
    if (!_online) return showSnack(context, 'الربط يحتاج إنترنت', error: true);
    final active = widget.data.active;
    if (active && !await confirm(context, 'إعادة الربط', 'الفرع مربوط مسبقاً. إعادة الربط تصدر شهادة جديدة وتبدأ سلسلة فواتير جديدة. متأكد؟', ok: 'إعادة الربط', danger: true)) {
      return;
    }
    if (!mounted) return;
    final app = Services.read(context);
    setState(() {
      _busy = 'onboard';
      _steps = null;
    });
    try {
      final r = asMap(await app.api.fn('zatca-einvoice', {'action': 'onboard', 'branch_id': widget.branch, 'otp': otp, 'environment': _env, 'force': active},
          timeout: const Duration(seconds: 90)));
      _steps = asList(r['steps']);
      if (!mounted) return;
      if (r['ok'] == true) {
        _otp.clear();
        showSnack(context, 'تم ربط الفرع بمنصة فاتورة ✓');
        await app.syncNow();
        await widget.reload();
      } else {
        showSnack(context, 'تعذر الربط — راجع الخطوات', error: true);
      }
    } on ApiException catch (e) {
      _steps = asList(asMap(e.body)['steps']);
      if (mounted) showSnack(context, _steps!.isEmpty ? friendlyError(e) : 'تعذر الربط — راجع الخطوات', error: true);
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _selftest() async {
    if (!_online) return showSnack(context, 'يحتاج إنترنت', error: true);
    final app = Services.read(context);
    setState(() {
      _busy = 'selftest';
      _steps = null;
    });
    try {
      final r = asMap(await app.api.fn('zatca-einvoice', {'action': 'selftest'}, timeout: const Duration(seconds: 90)));
      _steps = asList(r['steps']);
      if (mounted) showSnack(context, r['ok'] == true ? 'نجح الاختبار على بيئة الهيئة ✓' : 'فشل الاختبار — راجع الخطوات', error: r['ok'] != true);
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _resend(Map<String, dynamic> d) async {
    if (!_online) return showSnack(context, 'يحتاج إنترنت', error: true);
    final app = Services.read(context);
    final id = toS(d['credit_note_id']) ?? toS(d['order_id']);
    if (id == null) return;
    setState(() => _busy = '${d['id']}');
    try {
      final r = asMap(await app.api.fn('zatca-einvoice', {'action': 'issue', 'kind': d['doc_kind'] == 'credit' ? 'credit' : 'invoice', 'id': id}));
      if (!mounted) return;
      showSnack(context, zatcaStatusLabels[r['status']] ?? 'تم');
      await widget.reload();
    } catch (e) {
      if (mounted) showSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  /// رسائل الهيئة (أخطاء/ملاحظات) — نصوص أو كائنات {message}
  static List<String> _msgs(Map<String, dynamic> d) => [
        for (final k in ['zatca_errors', 'zatca_warnings'])
          if (d[k] is List)
            for (final m in d[k] as List) m is Map ? '${m['message'] ?? m['code'] ?? m}' : '$m',
      ];

  String? _validate(_Field f, String? v) {
    final s = (v ?? '').trim();
    if (f.k == 'vat_number') return isValidVat(s) ? null : 'الرقم الضريبي 15 رقم يبدأ وينتهي بـ 3';
    if (f.k == 'short_address') return s.isEmpty || RegExp(r'^[A-Za-z]{4}\d{4}$').hasMatch(s) ? null : '4 حروف + 4 أرقام';
    if (s.isEmpty) return 'مطلوب';
    if (f.digits != null && !RegExp('^\\d{${f.digits}}\$').hasMatch(s)) return '${f.digits} أرقام';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final st = widget.data.status;
    final active = widget.data.active;
    final hasCfg = widget.data.config != null;
    final cfgTypes = toS(widget.data.config?['invoice_types']) ?? '0100';
    final wide = isWide(context);
    return ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
      // ── الحالة ──
      FCard(
        borderColor: (active ? Brand.success : Brand.warning).withValues(alpha: 0.4),
        color: (active ? Brand.success : Brand.warning).withValues(alpha: 0.05),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(active ? Icons.verified_user_rounded : Icons.warning_amber_rounded, size: 34, color: active ? Brand.success : Brand.warning),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(active ? 'الفرع مربوط بمنصة فاتورة' : 'الفرع غير مربوط بعد', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                Text(
                  active
                      ? 'البيئة: ${st['environment'] == 'production' ? 'الإنتاج (فواتير حقيقية)' : 'المحاكاة (تجريبية)'} • ${toI(st['counter'])} مستند في السلسلة'
                          '${st['cert_expires_at'] != null ? ' • الشهادة حتى ${dateKsa(DateTime.tryParse('${st['cert_expires_at']}') ?? DateTime.now())}' : ''}'
                      : 'كل فاتورة تُصدر الآن برمز QR (المرحلة الأولى). أكمل الخطوتين بالأسفل لتنرسل الفواتير للهيئة تلقائياً.',
                  style: const TextStyle(fontSize: 13),
                ),
              ]),
            ),
          ]),
          if (active) ...[
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: wide ? 4 : 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: wide ? 2.4 : 2.2,
              children: [
                StatTile(label: 'مُبلّغة آخر 24 ساعة', value: toI(st['reported_24h']), color: Brand.success),
                StatTile(label: 'بانتظار الإرسال', value: toI(st['pending']), color: Brand.info),
                StatTile(label: 'متأخرة (+20 ساعة)', value: toI(st['overdue']), color: toI(st['overdue']) > 0 ? Brand.danger : null),
                StatTile(label: 'مرفوضة', value: toI(st['rejected']), color: toI(st['rejected']) > 0 ? Brand.danger : null),
              ],
            ),
            if (toI(st['overdue']) > 0)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text('⚠️ فيه فواتير ما انرسلت للهيئة من أكثر من 20 ساعة — المهلة النظامية 24 ساعة. تأكد من الاتصال واضغط "إعادة الإرسال".',
                    style: TextStyle(color: Brand.danger, fontWeight: FontWeight.w700, fontSize: 13)),
              ),
          ],
        ]),
      ),
      const SizedBox(height: 12),

      // ── ١) البيانات ──
      FCard(
        child: Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const SectionTitle('١) البيانات الضريبية والعنوان الوطني', icon: Icons.badge_rounded),
            const Text('تطبع في كل فاتورة وتُرسل للهيئة — لازم تطابق شهادة التسجيل والعنوان الوطني (سبل).', style: TextStyle(fontSize: 12)),
            const SizedBox(height: 12),
            Wrap(spacing: 10, runSpacing: 12, children: [
              for (final f in _fields)
                SizedBox(
                  width: wide && f.k != 'business_name' ? 300 : double.infinity,
                  child: LabeledField(
                    label: f.label,
                    hint: f.hint,
                    controller: _c[f.k]!,
                    ltr: f.ltr,
                    maxLength: f.max,
                    keyboard: f.ltr && f.k != 'short_address' ? TextInputType.number : null,
                    validator: (v) => _validate(f, v),
                  ),
                ),
            ]),
            const SizedBox(height: 10),
            CheckboxListTile(
              value: _b2b,
              onChanged: (v) => setState(() => _b2b = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text('أصدر فواتير ضريبية للشركات (B2B) إضافة للمبسطة', style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('لعملائك من المنشآت بأرقامهم الضريبية — تُعتمد من الهيئة لحظياً قبل التسليم.'
                  '${active && cfgTypes != (_b2b ? '1100' : '0100') ? ' تغيير هذا الخيار يحتاج إعادة الربط برمز OTP جديد.' : ''}'),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: BusyButton(label: 'حفظ البيانات', icon: Icons.save_rounded, busy: _busy == 'save', onPressed: _busy.isEmpty ? _saveProfile : null, expand: false),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 12),

      // ── ٢) الربط ──
      FCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SectionTitle('٢) الربط مع منصة فاتورة', icon: Icons.link_rounded),
          const Text(
            '1. ادخل بوابة فاتورة fatoora.zatca.gov.sa بحساب المنشأة (نفاذ).\n'
            '2. اختر "تسجيل وحدة حلول جديدة" واطلب رمز OTP (صالح لساعة).\n'
            '3. اكتب الرمز هنا واضغط "ربط الفرع" — فلسي يصدر الشهادة ويجتاز فحوصات الامتثال تلقائياً.',
            style: TextStyle(fontSize: 13, height: 1.7),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () async {
                await Clipboard.setData(const ClipboardData(text: 'https://fatoora.zatca.gov.sa'));
                if (context.mounted) showSnack(context, 'تم نسخ رابط بوابة فاتورة');
              },
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: const Text('نسخ رابط البوابة'),
            ),
          ),
          const SizedBox(height: 6),
          Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.end, children: [
            SizedBox(
              width: 150,
              child: TextField(
                controller: _otp,
                keyboardType: TextInputType.number,
                textDirection: TextDirection.ltr,
                textAlign: TextAlign.center,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(fontSize: 20, letterSpacing: 6, fontWeight: FontWeight.w700),
                decoration: const InputDecoration(labelText: 'رمز OTP', counterText: '', hintText: '123456'),
              ),
            ),
            SizedBox(
              width: 250,
              child: DropdownButtonFormField<String>(
                initialValue: _env,
                decoration: const InputDecoration(labelText: 'البيئة'),
                items: const [
                  DropdownMenuItem(value: 'production', child: Text('الإنتاج — فواتير حقيقية')),
                  DropdownMenuItem(value: 'simulation', child: Text('المحاكاة — للتجربة')),
                ],
                onChanged: (v) => setState(() => _env = v ?? 'production'),
              ),
            ),
            BusyButton(
              label: active ? 'إعادة الربط' : 'ربط الفرع',
              icon: Icons.link_rounded,
              busy: _busy == 'onboard',
              onPressed: _busy.isEmpty && hasCfg ? _onboard : null,
              expand: false,
            ),
            OutlinedButton.icon(
              onPressed: _busy.isEmpty ? _selftest : null,
              icon: _busy == 'selftest'
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.science_rounded),
              label: const Text('اختبار على بيئة الهيئة'),
            ),
          ]),
          if (!hasCfg) const Padding(padding: EdgeInsets.only(top: 8), child: Text('احفظ البيانات الضريبية أولاً.', style: TextStyle(color: Brand.warning, fontSize: 12))),
          if (toS(st['error']) != null && !active)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('آخر خطأ: ${st['error']}', style: const TextStyle(color: Brand.danger, fontSize: 12)),
            ),
          if (_steps != null && _steps!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainer, borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final s in _steps!)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(s['ok'] == true ? Icons.check_circle_rounded : Icons.cancel_rounded, size: 18,
                          color: s['ok'] == true ? Brand.success : Brand.danger),
                      const SizedBox(width: 6),
                      Expanded(child: Text('${s['step'] ?? ''}${s['detail'] != null ? ' — ${s['detail']}' : ''}', style: const TextStyle(fontSize: 12))),
                    ]),
                  ),
              ]),
            ),
          ],
          const SizedBox(height: 10),
          const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.lock_rounded, size: 16),
            SizedBox(width: 6),
            Expanded(
              child: Text('المفتاح الخاص والشهادة يُحفظان مشفّرين (AES-256) في السيرفر فقط — ما يوصل لهم التطبيق ولا أي موظف.', style: TextStyle(fontSize: 11)),
            ),
          ]),
        ]),
      ),

      // ── ٣) آخر المستندات ──
      if (active) ...[
        const SizedBox(height: 12),
        const SectionTitle('آخر المستندات المرسلة', icon: Icons.receipt_long_rounded),
        if (widget.data.docs.isEmpty) const EmptyState(icon: Icons.receipt_outlined, title: 'ما فيه مستندات بعد'),
        for (final d in widget.data.docs)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: FCard(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('#${toI(d['invoice_counter'])}', style: const TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(toS(d['invoice_number']) ?? '', textDirection: TextDirection.ltr, textAlign: TextAlign.right, style: const TextStyle(fontSize: 13))),
                  ZatcaChip(toS(d['zatca_status'])),
                ]),
                const SizedBox(height: 4),
                Row(children: [
                  Expanded(
                    child: Text('${d['doc_kind'] == 'credit' ? 'إشعار دائن' : 'فاتورة'} • ${money(toD(d['total']))} $riyal • '
                        '${dateTimeKsa(DateTime.tryParse('${d['created_at']}') ?? DateTime.now())}', style: const TextStyle(fontSize: 12)),
                  ),
                  if (d['zatca_status'] == 'error' || d['zatca_status'] == 'signed')
                    TextButton(onPressed: _busy.isEmpty ? () => _resend(d) : null, child: Text(_busy == '${d['id']}' ? '...' : 'إعادة الإرسال')),
                ]),
                if (d['zatca_status'] == 'rejected')
                  const Text('صحّحها بمرتجع ثم فاتورة جديدة', style: TextStyle(color: Brand.danger, fontSize: 12)),
                if (_msgs(d).isNotEmpty)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    dense: true,
                    title: const Text('التفاصيل', style: TextStyle(fontSize: 12)),
                    children: [
                      for (final m in _msgs(d))
                        Align(alignment: AlignmentDirectional.centerStart, child: Text(m, style: const TextStyle(fontSize: 11))),
                    ],
                  ),
              ]),
            ),
          ),
      ],
    ]);
  }
}
