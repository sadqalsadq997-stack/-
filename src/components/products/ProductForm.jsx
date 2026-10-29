import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Save, Loader2, ImagePlus, X } from 'lucide-react';
import { uploadImage } from '@/lib/images';
import { VAT_CATEGORIES, VAT_EXEMPTIONS, vatCategoryOf } from '@/lib/vat';
import { toast } from 'sonner';

export default function ProductForm({ product, onClose }) {
  const isEdit = !!product?.id;
  const [form, setForm] = useState({
    name: '', name_ar: '', base_price: '', cost_price: '', barcode: '', sku: '',
    category_id: '', unit_type: 'piece', is_active: true, show_in_menu: true,
    show_in_store: false, track_inventory: false, min_stock_alert: 5, tax_rate: 15,
    tax_inclusive: false, ...product,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => { const { data } = await supabase.from('categories').select('id, name, name_ar').eq('is_active', true); return data || []; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const cat = vatCategoryOf(form);
      if (cat !== 'S' && !form.vat_exemption_code) throw new Error('اختر سبب الإعفاء أو النسبة الصفرية');
      const payload = {
        ...form,
        base_price: form.base_price ? Number(form.base_price) : null,
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        min_stock_alert: Number(form.min_stock_alert),
        vat_category: cat,
        vat_exemption_code: cat === 'S' ? null : form.vat_exemption_code,
        tax_rate: cat === 'S' ? 15 : 0,
      };
      if (isEdit) { const { error } = await supabase.from('products').update(payload).eq('id', product.id); if (error) throw error; }
      else { const { error } = await supabase.from('products').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? 'تم تحديث المنتج' : 'تم إضافة المنتج'); onClose(); },
    onError: (e) => toast.error('فشل الحفظ: ' + e.message),
  });

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black">{isEdit ? 'تعديل المنتج' : 'منتج جديد'}</h1>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[['name_ar','الاسم بالعربي',true],['name','الاسم بالإنجليزي',false],['barcode','الباركود',false],['sku','رمز المنتج SKU',false]].map(([k,l,req]) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground mb-1 block">{l}{req && <span className="text-red-500">*</span>}</label>
              <input value={form[k]||''} onChange={e => set(k, e.target.value)}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">سعر البيع (⃁)</label>
            <input type="number" step="0.01" value={form.base_price||''} onChange={e => set('base_price', e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">سعر التكلفة (⃁)</label>
            <input type="number" step="0.01" value={form.cost_price||''} onChange={e => set('cost_price', e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">التصنيف</label>
            <select value={form.category_id||''} onChange={e => set('category_id', e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
              <option value="">— بدون تصنيف —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الوحدة</label>
            <select value={form.unit_type} onChange={e => set('unit_type', e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
              {['piece','kg','g','liter','ml','box','dozen','carton'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <ImagePicker value={form.image_url} onChange={(url) => set('image_url', url)} />

        <VatPicker form={form} set={set} />

        <div className="grid grid-cols-2 gap-3">
          {[
            ['is_active', 'المنتج مفعّل'],
            ['show_in_menu', 'يظهر في القائمة'],
            ['show_in_store', 'يظهر في المتجر'],
            ['track_inventory', 'تتبع المخزون'],
            ['tax_inclusive', 'السعر شامل الضريبة'],
          ].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer select-none">
              <div onClick={() => set(k, !form[k])}
                className={`w-10 h-5 rounded-full relative transition-colors ${form[k] ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${form[k] ? 'right-0.5' : 'left-0.5'}`} />
              </div>
              <span className="text-sm">{l}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-5 py-2.5 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
        <button onClick={() => { if (!form.name && !form.name_ar) return toast.error('الاسم مطلوب'); save.mutate(); }} disabled={save.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ
        </button>
      </div>
    </div>
  );
}

// الضريبة: أغلب الأصناف 15%. الأدوية والتصدير صفرية، والخدمات المالية معفاة —
// الرمز يطلع في الفاتورة الإلكترونية والإقرار (الهيئة تشترطه)
function VatPicker({ form, set }) {
  const cat = vatCategoryOf(form);
  const codes = VAT_EXEMPTIONS[cat] || [];
  return (
    <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-muted/30 p-4">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">ضريبة القيمة المضافة</label>
        <select value={cat}
          onChange={e => { const c = e.target.value; set('vat_category', c); set('vat_exemption_code', c === 'S' ? null : (VAT_EXEMPTIONS[c]?.[0]?.code ?? null)); }}
          className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
          {VAT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {cat !== 'S' && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">السبب (رمز الهيئة)<span className="text-red-500">*</span></label>
          <select value={form.vat_exemption_code || ''} onChange={e => set('vat_exemption_code', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
            {codes.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
      )}
      {cat !== 'S' && <p className="col-span-2 text-[11px] leading-relaxed text-amber-700">تأكد إن الصنف فعلاً يستحق هذا الإعفاء — اختيار خاطئ يعرّض المنشأة لغرامات. المطاعم والمحلات العادية: كل أصنافها 15%.</p>}
    </div>
  );
}

// صورة المنتج: تُضغط في الجهاز (WebP ≤ 800px) قبل الرفع — توفّر المساحة وتسرّع المنيو
function ImagePicker({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file, 'products')); toast.success('تم رفع الصورة'); }
    catch (err) { toast.error(err.message || 'تعذر رفع الصورة'); }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-muted/40">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">🍽️</div>}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
      </div>
      <div className="space-y-1.5">
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted">
          <ImagePlus className="h-4 w-4" /> {value ? 'تغيير الصورة' : 'إضافة صورة'}
          <input type="file" accept="image/*" onChange={pick} className="hidden" disabled={busy} />
        </label>
        {value && <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" />إزالة</button>}
        <p className="text-[11px] text-muted-foreground">صورة واضحة للطبق تفتح النفس — تُضغط تلقائياً</p>
      </div>
    </div>
  );
}
