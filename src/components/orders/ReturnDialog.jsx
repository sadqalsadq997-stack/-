import React, { useState } from 'react';
import { Loader2, Undo2, X, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { printReceipt, loadSeller } from '@/lib/receipt';
import { issueEinvoice } from '@/lib/einvoice';

// ══════════════════════════════════════════════════════════════════
// المرتجع = إشعار دائن (Credit Note) مرتبط بالفاتورة الأصلية
// الحساب كله في السيرفر (create_return): ما يسمح بإرجاع أكثر من المباع،
// والسبب إلزامي حسب متطلبات هيئة الزكاة والضريبة والجمارك.
// ══════════════════════════════════════════════════════════════════

const REASONS = ['منتج تالف أو به عيب', 'طلب خاطئ', 'تأخر الطلب', 'العميل غيّر رأيه', 'خطأ في الفاتورة'];

export default function ReturnDialog({ order, onClose, onDone }) {
  const items = (Array.isArray(order.items) ? order.items : []).filter(i => i.product_id);
  const [qty, setQty] = useState(() => Object.fromEntries(items.map(i => [i.product_id, Number(i.quantity ?? i.qty ?? 1)])));
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  const unit = (i) => Number(i.price ?? 0);
  const total = items.reduce((s, i) => s + Math.round(unit(i) * 100) * (qty[i.product_id] || 0), 0) / 100;
  const sel = items.filter(i => (qty[i.product_id] || 0) > 0);
  const change = (i, d) => setQty(q => ({ ...q, [i.product_id]: Math.min(Number(i.quantity ?? i.qty ?? 1), Math.max(0, (q[i.product_id] || 0) + d)) }));

  async function submit() {
    const why = reason === 'أخرى' ? other.trim() : reason;
    if (!why) { toast.error('اكتب سبب الإرجاع'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_return', {
      p_order: order.id, p_items: sel.map(i => ({ product_id: i.product_id, quantity: qty[i.product_id] })), p_reason: why,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم المرتجع • ${data.total} ⃁ — إشعار دائن ${data.number}`);
    // الإشعار الدائن يُوقّع ويُرسل للهيئة مثل الفاتورة (مرتبط بالفاتورة الأصلية)
    const ez = await issueEinvoice('credit', data.credit_note_id, { timeoutMs: data.is_b2b ? 20000 : 4000 });
    const seller = await loadSeller(supabase).catch(() => ({}));
    if (data.is_b2b && ez.status !== 'not_onboarded' && !String(ez.status || '').startsWith('cleared')) {
      toast.warning('الإشعار الدائن للشركة بانتظار اعتماد الهيئة — اطبعه بعد الاعتماد', { duration: 8000 });
    } else {
      printReceipt({
        doc_type: 'credit_note', order_number: data.number, original_number: data.original, reason: why,
        items: data.items, subtotal: data.subtotal, tax_amount: data.vat, total: data.total, rounding_amount: data.rounding,
        discount_amount: data.discount, discount_net: data.discount_net, lines_net: data.lines_net, tax_breakdown: data.breakdown, is_b2b: data.is_b2b, buyer: data.buyer,
        created_at: new Date().toISOString(), ...(ez.qr ? { zatca_qr: ez.qr } : {}),
      }, seller).catch(() => {});
    }
    onDone?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div dir="rtl" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black"><Undo2 className="h-5 w-5 text-primary" />مرتجع — إشعار دائن</h2>
            <p className="text-xs text-muted-foreground">من الفاتورة <b dir="ltr">{order.order_number}</b></p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">هذي الفاتورة قديمة وما فيها أرقام الأصناف — ما يمكن إرجاعها جزئياً.</p>
        ) : (
          <>
            <ul className="mb-4 space-y-2">
              {items.map(i => (
                <li key={i.product_id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{unit(i).toFixed(2)} ⃁ · المباع {i.quantity ?? i.qty}</p>
                  </div>
                  <button onClick={() => change(i, -1)} aria-label="إنقاص" className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted"><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center font-bold">{qty[i.product_id] || 0}</span>
                  <button onClick={() => change(i, 1)} aria-label="زيادة" className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted"><Plus className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
            <label className="mb-1 block text-sm font-bold">سبب الإرجاع</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...REASONS, 'أخرى'].map(r => (
                <button key={r} onClick={() => setReason(r)} className={`rounded-full px-3 py-1 text-xs font-medium ${reason === r ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{r}</button>
              ))}
            </div>
            {reason === 'أخرى' && <input value={other} onChange={e => setOther(e.target.value)} maxLength={200} placeholder="اكتب السبب"
              className="mb-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none" />}
            <p className="mb-3 text-xs text-muted-foreground">يُصدر إشعار دائن مرتبط بالفاتورة الأصلية، وتُخصم ضريبته من إقرارك الضريبي تلقائياً.</p>
            <button onClick={submit} disabled={busy || total <= 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} إرجاع {total.toFixed(2)} ⃁ وطباعة الإشعار
            </button>
          </>
        )}
      </div>
    </div>
  );
}
