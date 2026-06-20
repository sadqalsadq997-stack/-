import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutGrid, Plus, Loader2, X, Save, Users,
  ChefHat, Receipt, CreditCard, ShoppingCart, CheckCircle2, Clock, Printer
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS = {
  available: { label: 'متاح',   color: 'bg-green-100 border-green-300 text-green-700' },
  occupied:  { label: 'مشغول',  color: 'bg-red-100 border-red-300 text-red-700' },
  reserved:  { label: 'محجوز',  color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
  cleaning:  { label: 'تنظيف', color: 'bg-blue-100 border-blue-300 text-blue-700' },
};

// ── مودال إضافة طلب ──────────────────────────────────────────────
function OrderModal({ table, products, onClose, onOrderSent }) {
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();
  const branchId = (() => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}').id; } catch { return null; } })();
  const cashierName = sessionStorage.getItem('pin_employee_name') || 'كاشير';

  const addItem = (p) => {
    setCart(c => {
      const ex = c.find(i => i.id === p.id);
      return ex ? c.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { id: p.id, name: p.name_ar || p.name, price: p.price, qty: 1 }];
    });
  };
  const removeItem = (id) => setCart(c => c.filter(i => i.id !== id));
  const changeQty = (id, delta) => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error('أضف منتجاً واحداً على الأقل');
      const orderNum = `T${table.table_number}-${Date.now().toString(36).toUpperCase()}`;
      const { data: ord, error } = await supabase.from('orders').insert({
        order_number: orderNum,
        branch_id: branchId,
        table_number: table.table_number,
        order_type: 'dine_in',
        status: 'pending',
        items: cart,
        subtotal,
        tax_amount: tax,
        total,
        notes,
        cashier_name: cashierName,
      }).select().single();
      if (error) throw error;
      // تحديث حالة الطاولة
      await supabase.from('tables_map').update({ status: 'occupied', current_order_id: ord.id }).eq('id', table.id);
      return ord;
    },
    onSuccess: (ord) => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('تم إرسال الطلب للمطبخ ✅');
      onOrderSent(ord);
    },
    onError: (e) => toast.error(e.message || 'فشل الإرسال'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* رأس المودال */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" />
            <h2 className="font-black text-lg">طلب جديد — طاولة #{table.table_number}</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* قائمة المنتجات */}
          <div className="flex-1 overflow-y-auto p-4 border-l border-border">
            <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wide">اختر المنتجات</p>
            <div className="grid grid-cols-2 gap-2">
              {products.map(p => (
                <button key={p.id} onClick={() => addItem(p)}
                  className="text-right p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all">
                  <p className="text-sm font-bold truncate">{p.name_ar || p.name}</p>
                  <p className="text-xs text-primary font-bold mt-1">{p.price?.toFixed(2)} ر.س</p>
                </button>
              ))}
            </div>
          </div>

          {/* السلة */}
          <div className="w-52 flex flex-col bg-muted/30">
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">الطلب</p>
              {cart.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">السلة فارغة</p>
              ) : cart.map(item => (
                <div key={item.id} className="bg-card rounded-xl p-2.5 border border-border">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-bold leading-tight flex-1">{item.name}</p>
                    <button onClick={() => removeItem(item.id)}><X className="w-3 h-3 text-muted-foreground" /></button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(item.id, -1)} className="w-5 h-5 rounded-md bg-border flex items-center justify-center text-xs">−</button>
                      <span className="text-xs font-black w-5 text-center">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, +1)} className="w-5 h-5 rounded-md bg-border flex items-center justify-center text-xs">+</button>
                    </div>
                    <span className="text-xs text-primary font-bold">{(item.price * item.qty).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border space-y-1.5">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات الطلب..." rows={2}
                className="w-full text-xs bg-background border border-border rounded-xl px-2 py-1.5 resize-none focus:outline-none focus:border-primary" />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div className="flex justify-between"><span>المجموع</span><span>{subtotal.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between"><span>ضريبة 15%</span><span>{tax.toFixed(2)} ر.س</span></div>
                <div className="flex justify-between font-black text-foreground text-sm pt-1 border-t border-border">
                  <span>الإجمالي</span><span>{total.toFixed(2)} ر.س</span>
                </div>
              </div>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !cart.length}
                className="w-full h-10 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50">
                {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
                إرسال للمطبخ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── مودال الفاتورة والدفع ──────────────────────────────────────────
function CheckoutModal({ table, order, onClose, onDone }) {
  const [payMethod, setPayMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const qc = useQueryClient();

  const change = amountPaid ? Math.max(0, +amountPaid - (order?.total || 0)) : 0;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('لا يوجد طلب مرتبط بهذه الطاولة');
      const paid = payMethod === 'cash' ? +(+amountPaid).toFixed(2) : order.total;
      if (payMethod === 'cash' && paid < order.total) throw new Error('المبلغ المدفوع أقل من الإجمالي');
      // إغلاق الطلب
      const { error: oe } = await supabase.from('orders').update({
        status: 'completed',
        payment_method: payMethod,
        amount_paid: paid,
        change_due: change,
      }).eq('id', order.id);
      if (oe) throw oe;
      // إعادة الطاولة للمتاح
      const { error: te } = await supabase.from('tables_map').update({ status: 'available', current_order_id: null }).eq('id', table.id);
      if (te) throw te;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('تم إغلاق الفاتورة ✅');
      onDone();
    },
    onError: (e) => toast.error(e.message || 'فشل الإغلاق'),
  });

  const printReceipt = () => {
    const win = window.open('', '_blank', 'width=400,height=600');
    win.document.write(`<html dir="rtl"><head><title>فاتورة</title>
    <style>body{font-family:monospace;padding:20px;text-align:center}
    hr{border:1px dashed #000}.row{display:flex;justify-content:space-between;margin:4px 0}
    .total{font-size:1.4em;font-weight:bold}</style></head><body>
    <h2>فاتورة - طاولة #${table.table_number}</h2>
    <p style="font-size:0.8em">${new Date().toLocaleString('ar-SA')}</p>
    <hr/>
    ${(order?.items || []).map(i => `<div class="row"><span>${i.name} × ${i.qty}</span><span>${(i.price * i.qty).toFixed(2)} ر.س</span></div>`).join('')}
    <hr/>
    <div class="row"><span>المجموع</span><span>${order?.subtotal?.toFixed(2)} ر.س</span></div>
    <div class="row"><span>ضريبة 15%</span><span>${order?.tax_amount?.toFixed(2)} ر.س</span></div>
    <div class="row total"><span>الإجمالي</span><span>${order?.total?.toFixed(2)} ر.س</span></div>
    <hr/><p>شكراً لزيارتكم</p></body></html>`);
    win.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <h2 className="font-black text-lg">الدفع — طاولة #{table.table_number}</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* تفاصيل الفاتورة */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
            {(order?.items || []).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.name} × {item.qty}</span>
                <span>{(item.price * item.qty).toFixed(2)} ر.س</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>المجموع</span><span>{order?.subtotal?.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>ضريبة 15%</span><span>{order?.tax_amount?.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between font-black text-lg text-primary">
                <span>الإجمالي</span><span>{order?.total?.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>

          {/* طريقة الدفع */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">طريقة الدفع</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 'cash', l: 'نقداً' }, { v: 'card', l: 'بطاقة' }, { v: 'mada', l: 'مدى' }].map(m => (
                <button key={m.v} onClick={() => setPayMethod(m.v)}
                  className={`h-10 rounded-xl text-sm font-bold border transition-all ${payMethod === m.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary'}`}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'cash' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">المبلغ المستلم</label>
              <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0.00"
                className="w-full h-11 bg-background border border-border rounded-xl px-3 text-lg font-black text-center focus:outline-none focus:border-primary" />
              {+amountPaid > 0 && (
                <div className="flex justify-between text-sm mt-2 font-bold">
                  <span>الباقي</span><span className="text-green-600">{change.toFixed(2)} ر.س</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={printReceipt}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-colors">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}
              className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
              {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              تأكيد الدفع وإغلاق الطاولة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────────
export default function Tables() {
  const [showAdd, setShowAdd]       = useState(false);
  const [form, setForm]             = useState({ table_number: '', seats: 4, shape: 'square' });
  const [orderModal, setOrderModal] = useState(null);   // { table }
  const [checkModal, setCheckModal] = useState(null);   // { table, order }
  const qc = useQueryClient();

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tables_map').select('*').order('table_number');
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  // جلب المنتجات للقائمة
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-order'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id,name,name_ar,price').eq('is_active', true).order('name_ar');
      if (error) return [];
      return data || [];
    },
  });

  const addTable = useMutation({
    mutationFn: async () => {
      if (!form.table_number) throw new Error('رقم الطاولة مطلوب');
      const { error } = await supabase.from('tables_map').insert({ ...form, status: 'available', seats: Number(form.seats) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setShowAdd(false); setForm({ table_number: '', seats: 4, shape: 'square' }); toast.success('تمت الإضافة'); },
    onError: (e) => toast.error(e.message || 'فشل الإضافة'),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('tables_map').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });

  const deleteTable = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('tables_map').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); toast.success('تم الحذف'); },
  });

  // فتح مودال الدفع مع جلب آخر طلب للطاولة
  const openCheckout = async (table) => {
    if (table.current_order_id) {
      const { data } = await supabase.from('orders').select('*').eq('id', table.current_order_id).single();
      setCheckModal({ table, order: data });
    } else {
      const { data } = await supabase.from('orders').select('*').eq('table_number', table.table_number).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).single().catch(() => ({ data: null }));
      setCheckModal({ table, order: data });
    }
  };

  const stats = Object.fromEntries(Object.keys(STATUS).map(s => [s, tables.filter(t => t.status === s).length]));

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-primary" />إدارة الطاولات
        </h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />طاولة جديدة
        </button>
      </div>

      {/* إحصائيات */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} className={`${v.color} border rounded-2xl p-3 text-center`}>
            <p className="text-2xl font-black">{stats[k] || 0}</p>
            <p className="text-xs">{v.label}</p>
          </div>
        ))}
      </div>

      {/* نموذج إضافة طاولة */}
      {showAdd && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">طاولة جديدة</h3>
            <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground mb-1 block">رقم الطاولة</label>
              <input value={form.table_number} onChange={e => setForm(f => ({...f, table_number: e.target.value}))}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">عدد المقاعد</label>
              <input type="number" min={1} max={20} value={form.seats} onChange={e => setForm(f => ({...f, seats: e.target.value}))}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">الشكل</label>
              <select value={form.shape} onChange={e => setForm(f => ({...f, shape: e.target.value}))}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
                <option value="square">مربع</option>
                <option value="round">دائري</option>
                <option value="rectangle">مستطيل</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
            <button onClick={() => addTable.mutate()} disabled={addTable.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
              <Save className="w-4 h-4" />إضافة
            </button>
          </div>
        </div>
      )}

      {/* شبكة الطاولات */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : tables.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-20" />لا توجد طاولات — أضف طاولتك الأولى
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {tables.map(t => {
            const st = STATUS[t.status] || STATUS.available;
            const isOccupied = t.status === 'occupied';
            return (
              <div key={t.id} className={`border-2 ${st.color} rounded-2xl p-4 flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <span className="font-black text-xl">#{t.table_number}</span>
                  <button onClick={() => { if (confirm('حذف الطاولة؟')) deleteTable.mutate(t.id); }}
                    className="text-muted-foreground hover:text-red-500 transition-colors opacity-50 hover:opacity-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-xs opacity-70">
                  <Users className="w-3.5 h-3.5" />{t.seats} مقعد
                </div>
                <div className="text-xs font-medium">{st.label}</div>

                {/* أزرار الإجراءات */}
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    onClick={() => setOrderModal({ table: t })}
                    className="w-full h-8 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <ShoppingCart className="w-3.5 h-3.5" />إضافة طلب
                  </button>
                  {isOccupied && (
                    <button
                      onClick={() => openCheckout(t)}
                      className="w-full h-8 bg-green-600/10 hover:bg-green-600/20 text-green-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                      <CreditCard className="w-3.5 h-3.5" />إغلاق الفاتورة
                    </button>
                  )}
                  {/* تغيير الحالة */}
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(STATUS).filter(([k]) => k !== t.status).map(([k, v]) => (
                      <button key={k} onClick={() => updateStatus.mutate({ id: t.id, status: k })}
                        className="text-xs px-2 py-0.5 bg-white/60 hover:bg-white rounded-lg border transition-colors">
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* مودال إضافة طلب */}
      {orderModal && (
        <OrderModal
          table={orderModal.table}
          products={products}
          onClose={() => setOrderModal(null)}
          onOrderSent={(ord) => {
            setOrderModal(null);
            setCheckModal({ table: orderModal.table, order: ord });
          }}
        />
      )}

      {/* مودال الدفع */}
      {checkModal && (
        <CheckoutModal
          table={checkModal.table}
          order={checkModal.order}
          onClose={() => setCheckModal(null)}
          onDone={() => setCheckModal(null)}
        />
      )}
    </div>
  );
}
