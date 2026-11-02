import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Truck, Plus, PackagePlus, Warehouse, Search, Loader2, ReceiptText, Trash2, Save } from 'lucide-react';

const money = value => Number(value || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = value => Number(value || 0);
const activeBranch = () => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}'); } catch { return {}; } };

export default function Purchases() {
  const branch = activeBranch();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierVat, setSupplierVat] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [lines, setLines] = useState([{ product_id: '', quantity: '1', unit_name: 'قطعة', unit_factor: '1', unit_cost: '0', tax_rate: '15' }]);

  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
    queryKey: ['purchase-warehouses', branch.id],
    enabled: !!branch.id && !!branch.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').eq('tenant_id', branch.tenant_id).eq('branch_id', branch.id).eq('is_active', true).order('created_at');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ['purchase-products', branch.tenant_id],
    enabled: !!branch.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id,name,name_ar,unit_type,cost_price,stock_quantity,unit_conversions').eq('tenant_id', branch.tenant_id).eq('is_active', true).order('name_ar');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['purchase-suppliers', branch.tenant_id],
    enabled: !!branch.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name,vat_number').eq('tenant_id', branch.tenant_id).order('name');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['purchase-history', branch.id],
    enabled: !!branch.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_invoices')
        .select('id,invoice_number,invoice_date,supplier_name,total,net_amount,vat_amount,paid_amount,payment_status,created_at,purchase_invoice_items(id,quantity,unit_name,base_quantity,unit_cost,base_unit_cost,products(name,name_ar))')
        .eq('branch_id', branch.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const totals = useMemo(() => lines.reduce((sum, line) => {
    const net = number(line.quantity) * number(line.unit_cost);
    const tax = net * number(line.tax_rate) / 100;
    return { net: sum.net + net, tax: sum.tax + tax, total: sum.total + net + tax };
  }, { net: 0, tax: 0, total: 0 }), [lines]);

  const createWarehouse = useMutation({
    mutationFn: async () => {
      if (!warehouseName.trim()) throw new Error('اكتب اسم المستودع');
      const { data, error } = await supabase.from('warehouses').insert({
        tenant_id: branch.tenant_id, branch_id: branch.id, name: warehouseName.trim(), is_active: true,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: data => { setWarehouseId(data.id); setWarehouseName(''); qc.invalidateQueries({ queryKey: ['purchase-warehouses', branch.id] }); toast.success('تم إنشاء المستودع'); },
    onError: error => toast.error(error.message || 'تعذر إنشاء المستودع'),
  });

  const receive = useMutation({
    mutationFn: async () => {
      if (!branch.id || !branch.tenant_id) throw new Error('اختر الفرع من القائمة أولاً');
      if (!warehouseId) throw new Error('أنشئ أو اختر مستودعاً');
      if (!invoiceNumber.trim()) throw new Error('رقم فاتورة المورد مطلوب');
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      if (!selectedSupplier && !supplierName.trim()) throw new Error('اختر المورد أو اكتب اسمه');
      const supplierVatNumber = selectedSupplier?.vat_number || supplierVat || null;
      if (!supplierVatNumber && validLines.some(l => number(l.tax_rate) > 0)) throw new Error('المورد غير مسجل ضريبياً؛ اجعل نسبة الضريبة 0% قبل الاستلام');
      const validLines = lines.filter(l => l.product_id);
      if (!validLines.length) throw new Error('أضف منتجاً واحداً على الأقل');
      if (validLines.some(l => number(l.quantity) <= 0 || number(l.unit_factor) <= 0 || number(l.unit_cost) < 0)) throw new Error('راجع الكمية والتكلفة ومعامل التحويل');
      const payload = validLines.map(l => ({
        product_id: l.product_id, quantity: number(l.quantity), unit_name: l.unit_name || 'قطعة',
        unit_factor: number(l.unit_factor), unit_cost: number(l.unit_cost), tax_rate: number(l.tax_rate),
      }));
      const { data, error } = await supabase.rpc('create_purchase_receipt', {
        p_branch: branch.id, p_warehouse: warehouseId, p_supplier: selectedSupplier?.id || null,
        p_supplier_name: selectedSupplier?.name || supplierName.trim(),
        p_supplier_vat: selectedSupplier?.vat_number || supplierVat || null,
        p_invoice_number: invoiceNumber.trim(), p_invoice_date: invoiceDate || null,
        p_paid_amount: number(paidAmount), p_notes: notes || null, p_lines: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('تم استلام المشتريات وتحديث المخزون');
      setInvoiceNumber(''); setPaidAmount('0'); setNotes('');
      setLines([{ product_id: '', quantity: '1', unit_name: 'قطعة', unit_factor: '1', unit_cost: '0', tax_rate: '15' }]);
      qc.invalidateQueries({ queryKey: ['purchase-history'] });
      qc.invalidateQueries({ queryKey: ['purchase-products'] });
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['purchase-suppliers'] });
    },
    onError: error => toast.error(error.message || 'تعذر تسجيل فاتورة المشتريات'),
  });

  const updateLine = (index, key, value) => setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  if (!branch.id || !branch.tenant_id) return <div dir="rtl" className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">اختر فرعاً مرتبطاً بمنشأة أولاً.</div>;

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black flex items-center gap-2"><ReceiptText className="h-6 w-6 text-primary" />المشتريات والاستلام</h1>
          <p className="mt-1 text-sm text-muted-foreground">سجّل فاتورة المورد، واستلم البضاعة إلى المستودع، وحدّث الكميات وتكلفة المخزون تلقائياً.</p></div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2"><Warehouse className="h-5 w-5 text-primary" />المستودع</h2>
        <div className="flex flex-wrap gap-2">
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="h-10 min-w-56 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">اختر المستودع</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input value={warehouseName} onChange={e => setWarehouseName(e.target.value)} placeholder="اسم مستودع جديد" className="h-10 min-w-48 rounded-xl border border-border bg-background px-3 text-sm" />
          <button onClick={() => createWarehouse.mutate()} disabled={createWarehouse.isPending || !warehouseName.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold disabled:opacity-50">
            {createWarehouse.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}إضافة مستودع
          </button>
        </div>
        {warehousesLoading && <p className="text-xs text-muted-foreground">جارٍ تحميل المستودعات...</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />بيانات فاتورة المورد</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs space-y-1"><span className="block font-medium">المورد المسجل</span>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">مورد جديد / غير مسجل</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          {!selectedSupplier && <label className="text-xs space-y-1"><span className="block font-medium">اسم المورد</span><input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>}
          {!selectedSupplier && <label className="text-xs space-y-1"><span className="block font-medium">الرقم الضريبي للمورد</span><input value={supplierVat} onChange={e => setSupplierVat(e.target.value)} dir="ltr" maxLength={15} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>}
          <label className="text-xs space-y-1"><span className="block font-medium">رقم فاتورة المورد</span><input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
          <label className="text-xs space-y-1"><span className="block font-medium">تاريخ الفاتورة</span><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
          <label className="text-xs space-y-1"><span className="block font-medium">المدفوع الآن</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary" />أصناف الفاتورة</h2>
          <button onClick={() => setLines(v => [...v, { product_id: '', quantity: '1', unit_name: 'قطعة', unit_factor: '1', unit_cost: '0', tax_rate: '15' }])} className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary"><Plus className="h-4 w-4" />إضافة صنف</button>
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => {
            const product = products.find(p => p.id === line.product_id);
            return <div key={index} className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-7">
              <label className="text-xs space-y-1 lg:col-span-2"><span className="block font-medium">المنتج</span>
                <select value={line.product_id} onChange={e => updateLine(index,'product_id',e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"><option value="">اختر منتجاً</option>{products.map(p => <option key={p.id} value={p.id}>{p.name_ar || p.name}</option>)}</select>
                {product && <span className="block text-[11px] text-muted-foreground">المخزون الحالي: {number(product.stock_quantity).toLocaleString('ar-SA')} {product.unit_type || ''}</span>}
              </label>
              <label className="text-xs space-y-1"><span className="block font-medium">الكمية المشتراة</span><input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={e => updateLine(index,'quantity',e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" /></label>
              <label className="text-xs space-y-1"><span className="block font-medium">اسم وحدة الشراء</span><input value={line.unit_name} onChange={e => updateLine(index,'unit_name',e.target.value)} placeholder="كرتون / كيس / كجم" className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" /></label>
              <label className="text-xs space-y-1"><span className="block font-medium">معامل التحويل</span><input type="number" min="0.000001" step="0.0001" value={line.unit_factor} onChange={e => updateLine(index,'unit_factor',e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" /><span className="block text-[10px] text-muted-foreground">كم وحدة مخزون في وحدة الشراء؟</span></label>
              <label className="text-xs space-y-1"><span className="block font-medium">تكلفة وحدة الشراء</span><input type="number" min="0" step="0.01" value={line.unit_cost} onChange={e => updateLine(index,'unit_cost',e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" /></label>
              <label className="text-xs space-y-1"><span className="block font-medium">ضريبة %</span><input type="number" min="0" max="100" step="0.01" value={line.tax_rate} onChange={e => updateLine(index,'tax_rate',e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" /></label>
              <div className="flex items-end justify-between gap-2 lg:col-span-7"><span className="text-xs text-muted-foreground">المخزون المضاف: {(number(line.quantity)*number(line.unit_factor)).toLocaleString('ar-SA',{maximumFractionDigits:4})} {product?.unit_type || ''} · قيمة السطر: {money(number(line.quantity)*number(line.unit_cost)*(1+number(line.tax_rate)/100))} ر.س</span>
                <button onClick={() => setLines(v => v.length===1 ? v : v.filter((_,i)=>i!==index))} disabled={lines.length===1} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30" aria-label="حذف الصنف"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>;
          })}
        </div>
        <label className="block text-xs space-y-1"><span className="font-medium">ملاحظات</span><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/40 p-4">
          <div className="grid grid-cols-3 gap-5 text-sm"><div><p className="text-xs text-muted-foreground">قبل الضريبة</p><b>{money(totals.net)} ر.س</b></div><div><p className="text-xs text-muted-foreground">الضريبة</p><b>{money(totals.tax)} ر.س</b></div><div><p className="text-xs text-muted-foreground">الإجمالي</p><b className="text-primary">{money(totals.total)} ر.س</b></div></div>
          <button onClick={() => receive.mutate()} disabled={receive.isPending || !warehouseId || totals.total<=0} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {receive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}تأكيد الاستلام وتحديث المخزون
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-bold">سجل المشتريات</h2><p className="text-xs text-muted-foreground mt-1">الفواتير المستلمة وتفاصيل الأصناف والمدفوعات</p></div><span className="rounded-lg bg-muted px-2 py-1 text-xs">{invoices.length} فاتورة</span></div>
        {isLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div> : invoices.length===0 ? <p className="p-8 text-center text-sm text-muted-foreground">لا توجد فواتير مشتريات بعد</p> : <div className="divide-y divide-border">
          {invoices.map(inv => <article key={inv.id} className="p-4 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>فاتورة {inv.invoice_number}</b><p className="text-xs text-muted-foreground">{inv.supplier_name} · {inv.invoice_date}</p></div><div className="text-left"><b>{money(inv.total)} ر.س</b><p className="text-xs text-muted-foreground">مدفوع {money(inv.paid_amount)} · {inv.payment_status==='paid'?'مدفوعة':inv.payment_status==='partial'?'مدفوعة جزئياً':'آجلة'}</p></div></div>
            <div className="flex flex-wrap gap-2">{(inv.purchase_invoice_items||[]).map(item => <span key={item.id} className="rounded-lg bg-muted px-2 py-1 text-xs">{item.products?.name_ar || item.products?.name || 'منتج'}: {number(item.quantity)} {item.unit_name} (مخزون +{number(item.base_quantity)})</span>)}</div>
          </article>)}
        </div>}
      </section>
    </div>
  );
}
