import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Printer, Trash2, FileDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { printHTML, esc, printFonts } from '@/lib/print';
import { tenantUploadPath } from '@/lib/api';
import { compressImage } from '@/lib/images';

const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d) => d.toISOString().slice(0, 10);

// فترات الإقرار: ربع سنوية (الأغلب) أو شهرية (إيرادات > 40 مليون)
function quarters() {
  const now = new Date(); const out = [];
  for (let i = 0; i < 6; i++) {
    const q = Math.floor(now.getMonth() / 3) - i;
    const y = now.getFullYear() + Math.floor(q / 4);
    const qq = ((q % 4) + 4) % 4;
    const from = new Date(Date.UTC(y, qq * 3, 1)); const to = new Date(Date.UTC(y, qq * 3 + 3, 0));
    out.push({ id: `${y}-Q${qq + 1}`, label: `الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][qq]} ${y}`, from: iso(from), to: iso(to) });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// فواتير المشتريات — ضريبة المدخلات القابلة للاسترداد
// ══════════════════════════════════════════════════════════════════
export function PurchasesTab() {
  const qc = useQueryClient();
  const empty = { supplier_name: '', supplier_vat: '', invoice_number: '', invoice_date: iso(new Date()), claim_date: iso(new Date()), total: '', vat_amount: '', notes: '',
    invoice_kind: 'tax', deductible: true, non_deductible_reason: '', paid: true, due_date: '', expense_account: '5100' };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['purchase-invoices'],
    queryFn: async () => (await supabase.from('purchase_invoices').select('*').order('invoice_date', { ascending: false }).limit(300)).data || [],
  });

  // المستخدم يكتب الإجمالي من الفاتورة ⇒ نستنتج الضريبة 15% (يقدر يعدلها)
  const autoVat = f.total && !f.vat_amount ? (Number(f.total) - Number(f.total) / 1.15) : null;
  const vat = f.vat_amount !== '' ? Number(f.vat_amount) : autoVat || 0;
  const net = Math.max(0, Number(f.total || 0) - vat);

  async function save(e) {
    e.preventDefault();
    if (f.supplier_vat && !/^3\d{13}3$/.test(f.supplier_vat)) { toast.error('الرقم الضريبي للمورد 15 رقم يبدأ وينتهي بـ 3'); return; }
    if (!(Number(f.total) > 0)) { toast.error('اكتب إجمالي الفاتورة'); return; }
    setBusy(true);
    try {
      let attachment_url = null;
      if (file) {
        // صورة الفاتورة: مضغوطة (مقروءة) في مخزن خاص بالمنشأة
        const blob = await compressImage(file, { max: 1600, quality: 0.7 });
        const path = await tenantUploadPath('purchases', blob.type === 'image/webp' ? 'webp' : 'jpg');
        const { error: upErr } = await supabase.storage.from('docs').upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) throw upErr;
        attachment_url = path;
      }
      const { error } = await supabase.from('purchase_invoices').insert({
        supplier_name: f.supplier_name.trim(), supplier_vat: f.supplier_vat.trim() || null, invoice_number: f.invoice_number.trim(),
        invoice_date: f.invoice_date, claim_date: f.claim_date, net_amount: Math.round(net * 100) / 100, vat_amount: Math.round(vat * 100) / 100,
        notes: f.notes.trim() || null, attachment_url, invoice_kind: f.invoice_kind, deductible: f.deductible,
        non_deductible_reason: f.deductible ? null : (f.non_deductible_reason.trim() || 'غير قابلة للخصم'),
        paid: f.paid, due_date: f.paid ? null : (f.due_date || null), expense_account: f.expense_account,
      });
      if (error) throw error;
      toast.success('تمت إضافة فاتورة الشراء — ضريبتها تنخصم من إقرارك');
      setF(empty); setFile(null);
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] }); qc.invalidateQueries({ queryKey: ['vat-return'] });
    } catch (err) {
      const m = String(err.message || '');
      toast.error(m.includes('duplicate') ? 'هذي الفاتورة مسجلة من قبل' : m || 'تعذر الحفظ', { duration: 7000 });
    }
    setBusy(false);
  }

  async function openDoc(path) {
    const { data } = await supabase.storage.from('docs').createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function markPaid(r) {
    const { error } = await supabase.from('purchase_invoices').update({ paid: true, paid_at: iso(new Date()) }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('تم تسجيل الدفع للمورد');
    qc.invalidateQueries({ queryKey: ['purchase-invoices'] }); qc.invalidateQueries({ queryKey: ['vat-return'] });
  }

  async function remove(id) {
    if (!window.confirm('حذف فاتورة الشراء؟')) return;
    await supabase.from('purchase_invoices').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['purchase-invoices'] }); qc.invalidateQueries({ queryKey: ['vat-return'] });
  }

  const inp = 'h-10 w-full rounded-xl border border-border bg-muted/40 px-3 text-sm focus:border-primary focus:outline-none';
  const totalVat = rows.filter(r => r.deductible !== false).reduce((s, r) => s + Number(r.vat_amount), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={save} className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-bold">إضافة فاتورة شراء</h3>
        <p className="text-xs text-muted-foreground">أي شي اشتريته من منشأة مسجلة بالضريبة (مواد، معدات، إيجار...) — ضريبتها تُسترد بخصمها من ضريبة مبيعاتك.</p>
        <input required value={f.supplier_name} onChange={e => setF({ ...f, supplier_name: e.target.value })} placeholder="اسم المورد / المنشأة" className={inp} />
        <input value={f.supplier_vat} onChange={e => setF({ ...f, supplier_vat: e.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="الرقم الضريبي للمورد (15 رقم)" dir="ltr" inputMode="numeric" className={inp} />
        <div className="grid grid-cols-2 gap-2">
          <input required value={f.invoice_number} onChange={e => setF({ ...f, invoice_number: e.target.value })} placeholder="رقم الفاتورة" dir="ltr" className={inp} />
          <input required type="date" value={f.invoice_date} onChange={e => setF({ ...f, invoice_date: e.target.value })} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">الإجمالي شامل الضريبة<input required inputMode="decimal" value={f.total} onChange={e => setF({ ...f, total: e.target.value.replace(/[^\d.]/g, '') })} dir="ltr" className={`${inp} mt-1`} /></label>
          <label className="text-xs">الضريبة<input inputMode="decimal" value={f.vat_amount} placeholder={autoVat ? autoVat.toFixed(2) : '0.00'} onChange={e => setF({ ...f, vat_amount: e.target.value.replace(/[^\d.]/g, '') })} dir="ltr" className={`${inp} mt-1`} /></label>
        </div>
        <p className="text-xs text-muted-foreground">قبل الضريبة: <b>{n2(net)}</b> · الضريبة: <b>{n2(vat)}</b> ⃁</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">نوع المستند
            <select value={f.invoice_kind} onChange={e => setF({ ...f, invoice_kind: e.target.value })} className={`${inp} mt-1`}>
              <option value="tax">فاتورة ضريبية (باسم منشأتك)</option>
              <option value="simplified">فاتورة مبسطة (أقل من 1000 ⃁)</option>
              <option value="customs">بيان جمركي (استيراد)</option>
            </select>
          </label>
          <label className="text-xs">تاريخ الاستلام
            <input type="date" value={f.claim_date} onChange={e => setF({ ...f, claim_date: e.target.value })} className={`${inp} mt-1`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.deductible} onChange={e => setF({ ...f, deductible: e.target.checked })} className="h-4 w-4" />
          ضريبتها قابلة للخصم (مرتبطة بنشاط المنشأة)
        </label>
        <label className="block text-xs">تُسجَّل في حساب
          <select value={f.expense_account} onChange={e => setF({ ...f, expense_account: e.target.value })} className={`${inp} mt-1`}>
            <option value="5100">تكلفة المواد / البضاعة (5100)</option>
            <option value="1300">مخزون بضاعة للبيع (1300)</option>
            <option value="5200">مصروفات تشغيلية (5200)</option>
            <option value="5220">إيجار (5220)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.paid} onChange={e => setF({ ...f, paid: e.target.checked })} className="h-4 w-4" />
          مدفوعة للمورد
        </label>
        {!f.paid && (
          <label className="block text-xs">تاريخ استحقاق الدفع (آجل)
            <input type="date" value={f.due_date} min={f.invoice_date} onChange={e => setF({ ...f, due_date: e.target.value })} className={`${inp} mt-1`} />
            <span className="mt-0.5 block text-[11px] text-muted-foreground">إذا ما دفعتها خلال 12 شهر من الاستحقاق، فلسي يعكس ضريبتها تلقائياً في الإقرار ويستردها لما تدفع.</span>
          </label>
        )}
        {!f.deductible && <input value={f.non_deductible_reason} onChange={e => setF({ ...f, non_deductible_reason: e.target.value })} placeholder="السبب: ضيافة، استخدام شخصي، سيارة ركاب..." className={inp} />}
        <details className="rounded-xl bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <summary className="cursor-pointer font-bold text-foreground">شروط خصم ضريبة المشتريات (اللائحة التنفيذية)</summary>
          <ul className="mt-1 list-disc space-y-0.5 pr-4">
            <li>لازم فاتورة ضريبية صادرة من مورد مسجل بالضريبة (رقمه الضريبي مطلوب) — المادة 49.</li>
            <li>الفاتورة المبسطة تقبل فقط إذا قيمة التوريد أقل من 1000 ⃁ — المادة 53.</li>
            <li>تُخصم في إقرار الفترة اللي استلمت فيها الفاتورة، وخلال 5 سنوات من التوريد كحد أقصى.</li>
            <li>إذا ما دفعت للمورد خلال 12 شهر، يلزم تعديل الخصم في إقرار نهاية المهلة.</li>
            <li>احتفظ بالفاتورة 6 سنوات. الضيافة والاستخدام الشخصي غير قابلة للخصم.</li>
            <li>فواتير المشتريات <b>ما تُرسل للهيئة منك</b> — المورد هو اللي يرسلها، وأنت تخصم ضريبتها في الإقرار.</li>
          </ul>
        </details>
        <label className="block text-xs">صورة الفاتورة (اختياري)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs" />
        </label>
        <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-bold">فواتير المشتريات</h3>
          <span className="text-sm text-muted-foreground">ضريبة مدخلات: <b className="text-foreground">{n2(totalVat)} ⃁</b></span>
        </div>
        {isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">{['التاريخ', 'المورد', 'رقم الفاتورة', 'قبل الضريبة', 'الضريبة', 'الإجمالي', ''].map(h => <th key={h} className="px-3 py-2 text-right font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-3 py-2 text-xs" dir="ltr">{r.invoice_date}</td>
                    <td className="px-3 py-2"><p className="font-bold">{r.supplier_name}</p>{r.supplier_vat && <p className="text-[11px] text-muted-foreground" dir="ltr">{r.supplier_vat}</p>}{r.deductible === false && <p className="text-[11px] text-amber-600">غير قابلة للخصم — {r.non_deductible_reason}</p>}{r.paid === false && <button onClick={() => markPaid(r)} className="mt-0.5 block text-[11px] font-bold text-sky-700 underline">غير مدفوعة{r.due_date ? ` (تستحق ${r.due_date})` : ''} — سجّل الدفع</button>}</td>
                    <td className="px-3 py-2 text-xs" dir="ltr">{r.invoice_number}{r.attachment_url && <button onClick={() => openDoc(r.attachment_url)} className="mr-1 text-primary underline">📎</button>}</td>
                    <td className="px-3 py-2">{n2(r.net_amount)}</td>
                    <td className="px-3 py-2 font-bold text-primary">{n2(r.vat_amount)}</td>
                    <td className="px-3 py-2">{n2(r.total)}</td>
                    <td className="px-3 py-2"><button onClick={() => remove(r.id)} aria-label="حذف" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">ما فيه فواتير مشتريات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// الإقرار الضريبي — بنفس ترتيب خانات نموذج هيئة الزكاة والضريبة والجمارك
// ══════════════════════════════════════════════════════════════════
export function VatReturnTab() {
  const periods = useMemo(quarters, []);
  const [pid, setPid] = useState(periods[1]?.id || periods[0].id); // الافتراضي: الربع السابق (المستحق تقديمه)
  const [custom, setCustom] = useState(null);
  const p = custom || periods.find(x => x.id === pid);

  const { data: r, isLoading } = useQuery({
    queryKey: ['vat-return', p.from, p.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vat_return', { p_from: p.from, p_to: p.to });
      if (error) throw error;
      return data;
    },
  });
  const { data: seller } = useQuery({
    queryKey: ['seller-mini'],
    queryFn: async () => (await supabase.from('app_settings').select('business_name, vat_number').limit(1).maybeSingle()).data || {},
  });

  const lines = r ? [
    { no: 1, label: 'المبيعات الخاضعة للنسبة الأساسية 15%', amount: r.sales_standard, adj: -r.returns_standard, vat: r.sales_vat - r.returns_vat },
    { no: 2, label: 'المبيعات للمواطنين (الخدمات الصحية والتعليم الخاص)', amount: 0, adj: 0, vat: 0 },
    { no: 3, label: 'المبيعات المحلية الخاضعة للنسبة الصفرية', amount: r.sales_zero_rated, adj: -r.returns_zero_rated, vat: 0 },
    { no: 4, label: 'الصادرات', amount: r.sales_exports, adj: -r.returns_exports, vat: 0 },
    { no: 5, label: 'المبيعات المعفاة', amount: r.sales_exempt, adj: -r.returns_exempt, vat: 0 },
    { no: 6, label: 'إجمالي المبيعات', amount: r.sales_standard + r.sales_zero_rated + r.sales_exports + r.sales_exempt,
      adj: -(r.returns_standard + r.returns_zero_rated + r.returns_exports + r.returns_exempt), vat: r.output_vat, total: true },
    { no: 7, label: 'المشتريات الخاضعة للنسبة الأساسية 15%', amount: r.purchases_net - r.imports_net,
      adj: r.input_recovery_net - r.input_reversal_net, vat: r.purchases_vat - r.imports_vat - r.input_reversal_vat + r.input_recovery_vat },
    { no: 8, label: 'الاستيرادات الخاضعة للضريبة (المسددة في الجمارك)', amount: r.imports_net, adj: 0, vat: r.imports_vat },
    { no: 9, label: 'الاستيرادات الخاضعة للاحتساب العكسي', amount: 0, adj: 0, vat: 0 },
    { no: 10, label: 'المشتريات الخاضعة للنسبة الصفرية', amount: 0, adj: 0, vat: 0 },
    { no: 11, label: 'المشتريات المعفاة', amount: 0, adj: 0, vat: 0 },
    { no: 12, label: 'إجمالي المشتريات', amount: r.purchases_net, adj: r.input_recovery_net - r.input_reversal_net, vat: r.input_vat, total: true },
  ] : [];

  function print() {
    const tr = lines.map(l => `<tr class="${l.total ? 't' : ''}"><td>${l.no}</td><td>${esc(l.label)}</td><td>${n2(l.amount)}</td><td>${n2(l.adj)}</td><td>${n2(l.vat)}</td></tr>`).join('');
    printHTML(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><style>${printFonts()}
body{font-family:'SaudiRiyal','Cairo',sans-serif;padding:14mm;color:#111;font-size:12px}h1{font-size:18px;margin:0}
.h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;padding-bottom:8px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:right}th{background:#f2f2f2}
td:nth-child(n+3){text-align:left;font-variant-numeric:tabular-nums;width:16%}tr.t td{font-weight:800;background:#fafafa}
.due{margin-top:14px;display:flex;justify-content:space-between;border:2px solid #111;padding:10px 14px;font-size:15px;font-weight:900}
.n{margin-top:12px;font-size:10px;color:#555}@page{size:A4;margin:0}</style></head><body>
<div class="h"><div><h1>إقرار ضريبة القيمة المضافة</h1><div>${esc(seller?.business_name || '')} — الرقم الضريبي ${esc(seller?.vat_number || '—')}</div></div><div>الفترة: ${p.from} إلى ${p.to}</div></div>
<table><thead><tr><th>#</th><th>البند</th><th>المبلغ (⃁)</th><th>التعديلات (⃁)</th><th>الضريبة (⃁)</th></tr></thead><tbody>${tr}</tbody></table>
<div class="due"><span>${r.net_due >= 0 ? 'صافي الضريبة المستحقة للسداد' : 'صافي الضريبة القابلة للاسترداد'}</span><span>${n2(Math.abs(r.net_due))} ⃁</span></div>
<p class="n">مُعد من نظام فلسي كمساعدة لتعبئة الإقرار في بوابة هيئة الزكاة والضريبة والجمارك. راجع الأرقام قبل التقديم. المبيعات: ${r.sales_count} فاتورة · المرتجعات: ${r.returns_count} إشعار دائن · المشتريات: ${r.purchases_count} فاتورة.</p>
</body></html>`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={custom ? 'custom' : pid} onChange={e => { if (e.target.value === 'custom') setCustom({ from: p.from, to: p.to }); else { setCustom(null); setPid(e.target.value); } }}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm">
          {periods.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          <option value="custom">فترة مخصصة (شهري)</option>
        </select>
        {custom && (<>
          <input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} className="h-10 rounded-xl border border-border bg-card px-2 text-sm" />
          <input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} className="h-10 rounded-xl border border-border bg-card px-2 text-sm" />
        </>)}
        <button onClick={print} disabled={!r} className="mr-auto flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">
          <Printer className="h-4 w-4" /> طباعة / PDF
        </button>
      </div>

      {isLoading || !r ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="ضريبة المبيعات (المخرجات)" value={r.output_vat} sub={`${r.sales_count} فاتورة − ${r.returns_count} مرتجع`} />
            <Stat label="ضريبة المشتريات (المدخلات)" value={r.input_vat} sub={`${r.purchases_count} فاتورة شراء`} />
            <Stat label={r.net_due >= 0 ? 'المستحق للسداد' : 'لك استرداد'} value={Math.abs(r.net_due)} strong tone={r.net_due >= 0 ? 'pay' : 'refund'} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="w-10 px-3 py-2.5 text-right">#</th><th className="px-3 py-2.5 text-right">البند</th>
                <th className="px-3 py-2.5 text-left">المبلغ</th><th className="px-3 py-2.5 text-left">التعديلات</th><th className="px-3 py-2.5 text-left">الضريبة</th>
              </tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.no} className={`border-b border-border/50 ${l.total ? 'bg-muted/30 font-black' : ''}`}>
                    <td className="px-3 py-2.5 text-muted-foreground">{l.no}</td><td className="px-3 py-2.5">{l.label}</td>
                    <td className="px-3 py-2.5 text-left tabular-nums" dir="ltr">{n2(l.amount)}</td>
                    <td className="px-3 py-2.5 text-left tabular-nums" dir="ltr">{n2(l.adj)}</td>
                    <td className="px-3 py-2.5 text-left font-bold tabular-nums" dir="ltr">{n2(l.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(r.input_reversal_count > 0 || r.input_recovery_count > 0) && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed">
              تعديلات ضريبة المدخلات (قاعدة 12 شهر): عكس {n2(r.input_reversal_vat)} ⃁ لـ {r.input_reversal_count} فاتورة غير مدفوعة،
              واسترداد {n2(r.input_recovery_vat)} ⃁ لـ {r.input_recovery_count} فاتورة دُفعت. ضعها في عمود التعديلات للبند 7.
            </p>
          )}
          {r.sales_out_of_scope > 0 && <p className="text-xs text-muted-foreground">مبيعات خارج نطاق الضريبة ({n2(r.sales_out_of_scope)} ⃁) لا تُدرج في الإقرار.</p>}
          <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            الأرقام محسوبة من فواتيرك والمرتجعات وفواتير المشتريات المسجلة. انسخها لخانات الإقرار في بوابة الهيئة (zatca.gov.sa) — موعد التقديم آخر يوم من الشهر التالي لنهاية الفترة.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, strong, tone }) {
  const cls = tone === 'pay' ? 'border-amber-500/40 bg-amber-500/5' : tone === 'refund' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card';
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 ${strong ? 'text-3xl' : 'text-2xl'} font-black tabular-nums`}>{n2(value)} <span className="text-base">⃁</span></p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
