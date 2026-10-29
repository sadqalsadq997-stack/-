import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Loader2, Save, Link2, AlertTriangle, CheckCircle2, XCircle, FlaskConical, RefreshCw, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callFunction } from '@/lib/api';

// ══════════════════════════════════════════════════════════════════
// مركز الفوترة الإلكترونية (المرحلة الثانية — الربط مع منصة فاتورة)
//  ١) البيانات الضريبية والعنوان الوطني للفرع
//  ٢) الربط برمز OTP من بوابة فاتورة
//  ٣) المتابعة: المرسل، المعلّق، المتأخر، المرفوض
// ══════════════════════════════════════════════════════════════════

export const ZATCA_STATUS = {
  pending:           { label: 'بانتظار التوقيع', cls: 'bg-slate-100 text-slate-600' },
  signed:            { label: 'موقّعة — بانتظار الإرسال', cls: 'bg-sky-100 text-sky-700' },
  reported:          { label: 'مُبلّغة للهيئة ✓', cls: 'bg-emerald-100 text-emerald-700' },
  reported_warnings: { label: 'مُبلّغة (مع ملاحظات)', cls: 'bg-emerald-100 text-emerald-700' },
  cleared:           { label: 'معتمدة من الهيئة ✓', cls: 'bg-emerald-100 text-emerald-700' },
  cleared_warnings:  { label: 'معتمدة (مع ملاحظات)', cls: 'bg-emerald-100 text-emerald-700' },
  error:             { label: 'تعذر الإرسال — يعاد تلقائياً', cls: 'bg-amber-100 text-amber-700' },
  rejected:          { label: 'مرفوضة من الهيئة', cls: 'bg-red-100 text-red-700' },
};

export function ZatcaBadge({ status }) {
  const s = ZATCA_STATUS[status];
  if (!s) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>;
}

const activeBranchId = () => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}').id || null; } catch { return null; } };

const FIELDS = [
  { k: 'business_name', l: 'الاسم القانوني للمنشأة', hint: 'كما في شهادة التسجيل في ضريبة القيمة المضافة', span: 2 },
  { k: 'vat_number', l: 'الرقم الضريبي', ph: '3XXXXXXXXXXXXX3', ltr: true, max: 15 },
  { k: 'cr_number', l: 'السجل التجاري', ph: '10 أرقام', ltr: true, max: 10 },
  { k: 'branch_name', l: 'اسم الفرع', ph: 'الفرع الرئيسي' },
  { k: 'short_address', l: 'العنوان المختصر (اختياري)', ph: 'RRRD2929', ltr: true, max: 8 },
  { k: 'address_building', l: 'رقم المبنى', ph: '4 أرقام', ltr: true, max: 4 },
  { k: 'address_postal', l: 'الرمز البريدي', ph: '5 أرقام', ltr: true, max: 5 },
  { k: 'address_street', l: 'الشارع' },
  { k: 'address_district', l: 'الحي' },
  { k: 'address_city', l: 'المدينة', ph: 'الرياض' },
];

export default function ZatcaCenter() {
  const branch = activeBranchId();
  const qc = useQueryClient();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [otp, setOtp] = useState('');
  const [env, setEnv] = useState('production');
  const [busy, setBusy] = useState('');
  const [steps, setSteps] = useState(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['zatca-config', branch],
    enabled: !!branch,
    queryFn: async () => (await callFunction('zatca-einvoice', { action: 'status', branch_id: branch })).data?.config ?? null,
  });
  const { data: st, refetch: refetchStatus } = useQuery({
    queryKey: ['zatca-status', branch],
    enabled: !!branch,
    queryFn: async () => (await supabase.rpc('zatca_branch_status', { p_branch: branch })).data,
    refetchInterval: 30_000,
  });
  const { data: docs = [] } = useQuery({
    queryKey: ['zatca-docs', branch],
    enabled: !!branch && st?.status === 'active',
    queryFn: async () => (await supabase.from('zatca_invoices')
      .select('id, invoice_number, invoice_type, invoice_counter, zatca_status, zatca_errors, zatca_warnings, total, created_at, reported_at, order_id, credit_note_id, doc_kind')
      .eq('branch_id', branch).order('invoice_counter', { ascending: false, nullsFirst: false }).limit(30)).data || [],
    refetchInterval: 30_000,
  });

  useEffect(() => { if (cfg) setForm(f => ({ ...cfg, ...f })); }, [cfg]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (!branch) return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">اختر الفرع من القائمة الجانبية أولاً.</p>;

  async function saveProfile() {
    setSaving(true);
    const { error } = await supabase.rpc('zatca_save_profile', { p_branch: branch, p: { ...form, invoice_types: form.invoice_types === '1100' ? '1100' : '0100' } });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('تم حفظ البيانات الضريبية');
    qc.invalidateQueries({ queryKey: ['zatca-config'] }); refetchStatus();
  }

  async function onboard() {
    if (!/^\d{6}$/.test(otp)) { toast.error('رمز OTP: 6 أرقام من بوابة فاتورة'); return; }
    if (st?.status === 'active' && !window.confirm('الفرع مربوط مسبقاً. إعادة الربط تصدر شهادة جديدة وتبدأ سلسلة فواتير جديدة. متأكد؟')) return;
    setBusy('onboard'); setSteps(null);
    const { data, error } = await callFunction('zatca-einvoice', { action: 'onboard', branch_id: branch, otp, environment: env, force: st?.status === 'active' });
    setBusy('');
    setSteps(data?.steps || null);
    if (error || !data?.ok) { toast.error(error || 'تعذر الربط — راجع الخطوات'); }
    else { toast.success('تم ربط الفرع بمنصة فاتورة ✓'); setOtp(''); }
    qc.invalidateQueries({ queryKey: ['zatca-config'] }); refetchStatus();
  }

  async function selftest() {
    setBusy('selftest'); setSteps(null);
    const { data, error } = await callFunction('zatca-einvoice', { action: 'selftest' });
    setBusy('');
    setSteps(data?.steps || null);
    if (error) toast.error(error);
    else if (data?.ok) toast.success('نجح الاختبار على بيئة الهيئة ✓');
    else toast.error('فشل الاختبار — راجع الخطوات');
  }

  async function resend(d) {
    setBusy(d.id);
    const { data, error } = await callFunction('zatca-einvoice', { action: 'issue', kind: d.doc_kind === 'credit' ? 'credit' : 'invoice', id: d.credit_note_id || d.order_id });
    setBusy('');
    if (error) toast.error(error); else toast.success(ZATCA_STATUS[data?.status]?.label || 'تم');
    qc.invalidateQueries({ queryKey: ['zatca-docs'] }); refetchStatus();
  }

  const active = st?.status === 'active';
  const inp = 'h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm focus:border-primary focus:outline-none';

  return (
    <div className="max-w-4xl space-y-5">
      {/* الحالة */}
      <section className={`rounded-2xl border p-5 ${active ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'}`}>
        <div className="flex flex-wrap items-center gap-3">
          {active ? <ShieldCheck className="h-8 w-8 text-emerald-600" /> : <AlertTriangle className="h-8 w-8 text-amber-500" />}
          <div className="flex-1">
            <h2 className="text-lg font-black">{active ? 'الفرع مربوط بمنصة فاتورة' : 'الفرع غير مربوط بعد'}</h2>
            <p className="text-sm text-muted-foreground">
              {active ? `البيئة: ${st.environment === 'production' ? 'الإنتاج (فواتير حقيقية)' : 'المحاكاة (تجريبية)'} · ${st.counter} مستند في السلسلة`
                : 'كل فاتورة تُصدر الآن برمز QR (المرحلة الأولى). أكمل الخطوتين بالأسفل لتنرسل الفواتير للهيئة تلقائياً.'}
            </p>
          </div>
        </div>
        {active && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['مُبلّغة آخر 24 ساعة', st.reported_24h, 'text-emerald-600'], ['بانتظار الإرسال', st.pending, 'text-sky-600'],
              ['متأخرة (+20 ساعة)', st.overdue, st.overdue ? 'text-red-600' : ''], ['مرفوضة', st.rejected, st.rejected ? 'text-red-600' : '']].map(([l, v, c]) => (
              <div key={l} className="rounded-xl bg-card p-3"><p className={`text-2xl font-black ${c}`}>{v ?? 0}</p><p className="text-xs text-muted-foreground">{l}</p></div>
            ))}
          </div>
        )}
        {active && st.overdue > 0 && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">⚠️ فيه فواتير ما انرسلت للهيئة من أكثر من 20 ساعة — المهلة النظامية 24 ساعة. تأكد من الاتصال واضغط "إعادة الإرسال".</p>
        )}
      </section>

      {/* ١) البيانات */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-bold">١) البيانات الضريبية والعنوان الوطني</h3>
        <p className="mb-4 text-xs text-muted-foreground">تطبع في كل فاتورة وتُرسل للهيئة — لازم تطابق شهادة التسجيل والعنوان الوطني (سبل).</p>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(f => (
              <label key={f.k} className={`text-xs ${f.span === 2 ? 'sm:col-span-2' : ''}`}>
                <span className="mb-1 block font-medium text-foreground">{f.l}</span>
                <input value={form[f.k] || ''} onChange={set(f.k)} placeholder={f.ph} dir={f.ltr ? 'ltr' : undefined} maxLength={f.max}
                  inputMode={f.ltr && f.k !== 'short_address' ? 'numeric' : undefined} className={inp} />
                {f.hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{f.hint}</span>}
              </label>
            ))}
          </div>
        )}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={form.invoice_types === '1100'}
            onChange={e => setForm(f => ({ ...f, invoice_types: e.target.checked ? '1100' : '0100' }))} />
          <span className="text-sm">
            <b>أصدر فواتير ضريبية للشركات (B2B)</b> إضافة للمبسطة
            <span className="block text-xs text-muted-foreground">لعملائك من المنشآت بأرقامهم الضريبية — تُعتمد من الهيئة لحظياً قبل التسليم.
              {active && cfg?.invoice_types !== form.invoice_types && <b className="text-amber-700"> تغيير هذا الخيار يحتاج إعادة الربط برمز OTP جديد.</b>}</span>
          </span>
        </label>
        <button onClick={saveProfile} disabled={saving} className="mt-4 flex h-10 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ البيانات
        </button>
      </section>

      {/* ٢) الربط */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-bold">٢) الربط مع منصة فاتورة</h3>
        <ol className="my-3 list-decimal space-y-1 pr-5 text-sm text-muted-foreground">
          <li>ادخل <a href="https://fatoora.zatca.gov.sa" target="_blank" rel="noopener" className="font-bold text-primary">بوابة فاتورة <ExternalLink className="inline h-3 w-3" /></a> بحساب المنشأة (نفاذ).</li>
          <li>اختر "تسجيل وحدة حلول جديدة / Onboard new solution unit" واطلب رمز OTP (صالح لساعة).</li>
          <li>اكتب الرمز هنا واضغط "ربط الفرع" — فلسي يصدر الشهادة ويجتاز فحوصات الامتثال تلقائياً.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="mb-1 block font-medium">رمز OTP</span>
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" placeholder="123456"
              className="h-10 w-32 rounded-xl border border-border bg-muted/40 px-3 text-center font-mono text-lg tracking-widest focus:border-primary focus:outline-none" />
          </label>
          <label className="text-xs"><span className="mb-1 block font-medium">البيئة</span>
            <select value={env} onChange={e => setEnv(e.target.value)} className="h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm">
              <option value="production">الإنتاج — فواتير حقيقية</option>
              <option value="simulation">المحاكاة — للتجربة (بوابة المحاكاة)</option>
            </select>
          </label>
          <button onClick={onboard} disabled={!!busy || !cfg} className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {active ? 'إعادة الربط' : 'ربط الفرع'}
          </button>
          <button onClick={selftest} disabled={!!busy} className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50" title="يختبر الاتصال وقبول الهيئة لشكل الفواتير على بيئة المطورين — بدون أي فواتير حقيقية">
            {busy === 'selftest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} اختبار على بيئة الهيئة
          </button>
        </div>
        {!cfg && <p className="mt-2 text-xs text-amber-600">احفظ البيانات الضريبية أولاً.</p>}
        {st?.error && !active && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700" dir="auto">آخر خطأ: {st.error}</p>}
        {steps && (
          <ul className="mt-3 space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
            {steps.map(s => (
              <li key={s.step} className="flex items-start gap-2">
                {s.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" />}
                <span className="font-mono">{s.step}</span>{s.detail && <span className="text-muted-foreground" dir="auto">— {s.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          المفتاح الخاص والشهادة يُحفظان مشفّرين (AES-256) في السيرفر فقط — ما يوصل لهم المتصفح ولا أي موظف.</p>
      </section>

      {/* ٣) آخر المستندات */}
      {active && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-bold">آخر المستندات المرسلة</h3>
            <button onClick={() => { qc.invalidateQueries({ queryKey: ['zatca-docs'] }); refetchStatus(); }} className="rounded-lg p-1.5 hover:bg-muted" aria-label="تحديث"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">{['#', 'المستند', 'النوع', 'المبلغ', 'الحالة', ''].map(h => <th key={h} className="px-3 py-2 text-right font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} className="border-b border-border/50 align-top">
                    <td className="px-3 py-2 font-mono text-xs">{d.invoice_counter}</td>
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{d.invoice_number}</td>
                    <td className="px-3 py-2 text-xs">{d.doc_kind === 'credit' ? 'إشعار دائن' : 'فاتورة مبسطة'}</td>
                    <td className="px-3 py-2 text-xs">{Number(d.total).toFixed(2)} ⃁</td>
                    <td className="px-3 py-2"><ZatcaBadge status={d.zatca_status} />
                      {(d.zatca_errors || d.zatca_warnings) && (
                        <details className="mt-1 text-[11px] text-muted-foreground"><summary className="cursor-pointer">التفاصيل</summary>
                          <pre className="whitespace-pre-wrap" dir="auto">{(d.zatca_errors || d.zatca_warnings || []).map(m => m.message || JSON.stringify(m)).join('\n')}</pre></details>
                      )}
                    </td>
                    <td className="px-3 py-2">{d.zatca_status === 'rejected' && <span className="text-[11px] text-red-600">صحّحها بمرتجع ثم فاتورة جديدة</span>}{['error', 'signed'].includes(d.zatca_status) && (
                      <button onClick={() => resend(d)} disabled={busy === d.id} className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">{busy === d.id ? '...' : 'إعادة الإرسال'}</button>)}</td>
                  </tr>
                ))}
                {docs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">ما فيه مستندات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
