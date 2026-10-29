import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, Search, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { money } from '@/lib/pricing';

// ══════════════════════════════════════════════════════════════════
// إضافات الدفع في نقطة البيع
//  • الخصم على الفاتورة (مبلغ أو نسبة) — يتوزع على فئات الضريبة في السيرفر
//  • فاتورة شركة (B2B): فاتورة ضريبية باسم المنشأة المشترية ورقمها الضريبي
//    وعنوانها الوطني — تُعتمد من الهيئة قبل تسليمها
// ══════════════════════════════════════════════════════════════════

const chip = (on) => `flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${on ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`;

export function DiscountBox({ value, onChange, gross, applied, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const invalid = Number(value.value) > 0 && !applied;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={chip(applied > 0)}>
          <Icon className="h-3.5 w-3.5" /> {applied > 0 ? `خصم ${money(applied)}` : 'خصم'}
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-64 space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-xs font-bold">
          {[['amount', 'مبلغ ⃁'], ['percent', 'نسبة %']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => onChange({ ...value, type: k })}
              className={`h-8 rounded-lg ${value.type === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          placeholder={value.type === 'percent' ? 'مثلاً 10' : 'مثلاً 5.00'}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none" />
        {invalid
          ? <p className="text-xs font-bold text-destructive">الخصم لازم يكون أقل من الإجمالي ({money(gross)} ⃁)</p>
          : <p className="text-[11px] leading-relaxed text-muted-foreground">الخصم شامل الضريبة ويظهر في الفاتورة الإلكترونية كخصم رسمي.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-9 flex-1 rounded-xl bg-primary text-xs font-bold text-primary-foreground">تم</button>
          {Number(value.value) > 0 && (
            <button type="button" onClick={() => { onChange({ type: value.type, value: '' }); setOpen(false); }}
              className="h-9 rounded-xl border border-border px-3 text-xs font-bold">إلغاء الخصم</button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** هل بيانات العميل تكفي لفاتورة ضريبية؟ (نفس شروط السيرفر felsy_buyer_snapshot) */
export function b2bMissing(c) {
  const miss = [];
  if (!c.vat_number && !c.cr_number) miss.push('الرقم الضريبي أو السجل التجاري');
  if (!c.addr_street) miss.push('الشارع');
  if (!/^\d{4}$/.test(c.addr_building || '')) miss.push('رقم المبنى');
  if (!c.addr_district) miss.push('الحي');
  if (!c.addr_city) miss.push('المدينة');
  if (!/^\d{5}$/.test(c.addr_postal || '')) miss.push('الرمز البريدي');
  return miss;
}

export function B2BBox({ value, onChange, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['b2b-customers'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('id, name, legal_name, phone, vat_number, cr_number, addr_street, addr_building, addr_district, addr_city, addr_postal')
        .or('vat_number.not.is.null,cr_number.not.is.null').order('name').limit(500);
      return data || [];
    },
    staleTime: 60_000,
  });
  const shown = useMemo(() => {
    const t = q.trim();
    return t ? list.filter((c) => [c.name, c.legal_name, c.vat_number, c.cr_number, c.phone].some((x) => String(x || '').includes(t))) : list;
  }, [list, q]);

  if (value) {
    return (
      <button type="button" onClick={() => onChange(null)} className={chip(true)} title="إلغاء فاتورة الشركة">
        <Icon className="h-3.5 w-3.5" /><span className="truncate">{value.legal_name || value.name}</span><X className="h-3 w-3 flex-shrink-0" />
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={chip(false)}><Icon className="h-3.5 w-3.5" /> فاتورة شركة</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>فاتورة ضريبية لمنشأة (B2B)</DialogTitle></DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            تصدر باسم المنشأة المشترية ورقمها الضريبي وعنوانها الوطني، وتُرسل للهيئة للاعتماد قبل تسليمها — تحتاج إنترنت.
          </p>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المنشأة أو الرقم الضريبي"
              className="h-10 w-full rounded-xl border border-border bg-background pr-9 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل…</p>}
            {!isLoading && shown.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                لا يوجد عملاء منشآت. أضف العميل برقمه الضريبي وعنوانه من <Link to="/customers" className="font-bold text-primary">صفحة العملاء</Link>.
              </div>
            )}
            {shown.map((c) => {
              const miss = b2bMissing(c);
              return (
                <button key={c.id} type="button" disabled={miss.length > 0}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-right hover:border-primary disabled:cursor-not-allowed disabled:opacity-70">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.legal_name || c.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{c.vat_number || `CR ${c.cr_number}`}</p>
                    {miss.length > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-700"><AlertTriangle className="h-3 w-3" />ناقص: {miss.join('، ')}</p>}
                  </div>
                  {!miss.length && <Check className="h-4 w-4 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
