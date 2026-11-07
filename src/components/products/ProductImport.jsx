import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Download, FileSpreadsheet, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { parseProductFile, buildPlan, fetchAllRows, downloadTemplate } from '@/lib/productImport';

const ACTION_UI = {
  insert: { label: 'جديد', cls: 'bg-green-500/10 text-green-600' },
  update: { label: 'تحديث', cls: 'bg-blue-500/10 text-blue-600' },
  skip: { label: 'تخطي', cls: 'bg-muted text-muted-foreground' },
  error: { label: 'خطأ', cls: 'bg-red-500/10 text-red-600' },
};

export default function ProductImport({ onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [stage, setStage] = useState('pick'); // pick → preview → done
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [existing, setExisting] = useState([]);
  const [categories, setCategories] = useState([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState(null);

  const plan = useMemo(
    () => (parsed ? buildPlan(parsed.rows, existing, categories, { updateExisting }) : []),
    [parsed, existing, categories, updateExisting],
  );
  const counts = useMemo(() => {
    const c = { insert: 0, update: 0, skip: 0, error: 0 };
    for (const p of plan) c[p.action]++;
    return c;
  }, [plan]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const [p, prods, cats] = await Promise.all([
        parseProductFile(file),
        fetchAllRows(supabase, 'products', 'id, sku, barcode'),
        fetchAllRows(supabase, 'categories', 'id, name, name_ar'),
      ]);
      if (!p.rows.length) throw new Error('ما لقيت أي صف منتجات في الملف');
      setFileName(file.name);
      setParsed(p);
      setExisting(prods);
      setCategories(cats);
      setStage('preview');
    } catch (err) {
      toast.error(err.message || 'تعذر قراءة الملف');
    }
    setBusy(false);
  }

  async function run() {
    const inserts = plan.filter((p) => p.action === 'insert');
    const updates = plan.filter((p) => p.action === 'update');
    const total = inserts.length + updates.length;
    if (!total) return toast.error('لا يوجد شيء للاستيراد');

    setBusy(true);
    setProgress(0);
    let added = 0;
    let updated = 0;
    let done = 0;
    const failed = [];
    const tick = (n) => { done += n; setProgress(Math.round((done / total) * 100)); };

    // الإضافة على دفعات؛ لو فشلت دفعة نعيدها صفاً صفاً لنعرف الصف المعطوب
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      const { error } = await supabase.from('products').insert(chunk.map((c) => c.payload));
      if (!error) added += chunk.length;
      else {
        for (const c of chunk) {
          const { error: e } = await supabase.from('products').insert(c.payload);
          if (e) failed.push({ line: c.row.line, msg: e.message });
          else added++;
        }
      }
      tick(chunk.length);
    }

    // التحديث: كل منتج بحقوله المعبّأة فقط
    for (let i = 0; i < updates.length; i += 5) {
      const chunk = updates.slice(i, i + 5);
      await Promise.all(chunk.map(async (u) => {
        const { error } = await supabase.from('products').update(u.payload).eq('id', u.match.id);
        if (error) failed.push({ line: u.row.line, msg: error.message });
        else updated++;
      }));
      tick(chunk.length);
    }

    qc.invalidateQueries({ queryKey: ['products'] });
    setResult({ added, updated, failed, skipped: counts.skip, errors: counts.error });
    setStage('done');
    setBusy(false);
  }

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors" disabled={busy}>
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          استيراد المنتجات من إكسل
        </h1>
      </div>

      {stage === 'pick' && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            <p>الأعمدة المدعومة: الاسم عربي، الاسم إنجليزي، رمز المنتج، الباركود، السعر قبل الضريبة، سعر التكلفة، التصنيف، رابط الصورة.</p>
            <p>إذا كان الباركود أو رمز المنتج موجوداً في النظام يتم تحديث المنتج، والخلايا الفارغة لا تمسح أي بيانات موجودة.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => downloadTemplate().catch(() => toast.error('تعذر إنشاء القالب'))}
              className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-muted">
              <Download className="w-4 h-4" /> تنزيل القالب
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} اختيار ملف (xlsx / csv)
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPick} className="hidden" />
          </div>
        </div>
      )}

      {stage === 'preview' && parsed && (
        <>
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="text-sm text-muted-foreground">الملف: <span className="font-bold text-foreground">{fileName}</span> — {parsed.rows.length} صف</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className={`px-3 py-1 rounded-full ${ACTION_UI.insert.cls}`}>جديد: {counts.insert}</span>
              <span className={`px-3 py-1 rounded-full ${ACTION_UI.update.cls}`}>تحديث: {counts.update}</span>
              <span className={`px-3 py-1 rounded-full ${ACTION_UI.skip.cls}`}>تخطي: {counts.skip}</span>
              <span className={`px-3 py-1 rounded-full ${ACTION_UI.error.cls}`}>أخطاء: {counts.error}</span>
            </div>
            {parsed.unknownHeaders.length > 0 && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                أعمدة غير معروفة تم تجاهلها: {parsed.unknownHeaders.join('، ')}
              </p>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              تحديث المنتجات الموجودة (حسب الباركود أو الرمز)، وإلا تُتخطى
            </label>
            {counts.error > 0 && <p className="text-xs text-muted-foreground">صفوف الأخطاء لن تُستورد — صحّحها في الملف وأعد رفعه، أو أكمل بالباقي.</p>}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-right text-xs text-muted-foreground">
                    <th className="p-2.5 font-medium">سطر</th>
                    <th className="p-2.5 font-medium">الحالة</th>
                    <th className="p-2.5 font-medium">الاسم</th>
                    <th className="p-2.5 font-medium">الرمز</th>
                    <th className="p-2.5 font-medium">الباركود</th>
                    <th className="p-2.5 font-medium">السعر</th>
                    <th className="p-2.5 font-medium">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.slice(0, 200).map((p) => (
                    <tr key={p.row.line}>
                      <td className="p-2.5 text-muted-foreground">{p.row.line}</td>
                      <td className="p-2.5"><span className={`px-2 py-0.5 rounded-full text-xs ${ACTION_UI[p.action].cls}`}>{ACTION_UI[p.action].label}</span></td>
                      <td className="p-2.5">{p.row.name_ar || p.row.name}</td>
                      <td className="p-2.5 font-mono text-xs" dir="ltr">{p.row.sku}</td>
                      <td className="p-2.5 font-mono text-xs" dir="ltr">{p.row.barcode}</td>
                      <td className="p-2.5">{p.row.base_price ?? ''}</td>
                      <td className="p-2.5 text-xs">
                        {p.errors.map((m, i) => <div key={i} className="text-red-600">{m}</div>)}
                        {p.warnings.map((m, i) => <div key={i} className="text-amber-600">{m}</div>)}
                        {p.note && <div className="text-muted-foreground">{p.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.length > 200 && <p className="p-2.5 text-xs text-muted-foreground border-t border-border">يُعرض أول 200 صف فقط — الاستيراد يشمل كل الصفوف.</p>}
          </div>

          {busy && (
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={() => { setStage('pick'); setParsed(null); }} disabled={busy}
              className="px-5 py-2.5 text-sm rounded-xl border border-border hover:bg-muted disabled:opacity-50">اختيار ملف آخر</button>
            <button onClick={run} disabled={busy || counts.insert + counts.update === 0}
              className="flex items-center gap-2 px-5 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              استيراد ({counts.insert + counts.update})
            </button>
          </div>
        </>
      )}

      {stage === 'done' && result && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <p className="flex items-center gap-2 font-bold text-green-600"><CheckCircle2 className="w-5 h-5" /> انتهى الاستيراد</p>
          <ul className="text-sm space-y-1">
            <li>تمت إضافة: <b>{result.added}</b></li>
            <li>تم تحديث: <b>{result.updated}</b></li>
            {result.skipped > 0 && <li>تم تخطي: <b>{result.skipped}</b></li>}
            {result.errors > 0 && <li>صفوف فيها أخطاء لم تُستورد: <b>{result.errors}</b></li>}
            {result.failed.length > 0 && <li className="text-red-600">فشل عند الحفظ: <b>{result.failed.length}</b></li>}
          </ul>
          {result.failed.length > 0 && (
            <div className="max-h-40 overflow-auto text-xs text-red-600 space-y-1 border border-border rounded-xl p-3">
              {result.failed.map((f, i) => <div key={i}>سطر {f.line}: {f.msg}</div>)}
            </div>
          )}
          <button onClick={onClose} className="px-5 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">رجوع للمنتجات</button>
        </div>
      )}
    </div>
  );
}
