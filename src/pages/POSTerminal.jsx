import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'نقداً',   icon: Banknote },
  { id: 'card',   label: 'بطاقة',  icon: CreditCard },
  { id: 'mada',   label: 'مدى',     icon: QrCode },
  { id: 'stcpay', label: 'STC Pay', icon: QrCode },
];

export default function POSTerminal() {
  const [search, setSearch]       = useState('');
  const [cart, setCart]           = useState([]);
  const [category, setCategory]   = useState('all');
  const [payMethod, setPayMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const qc = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, name_ar, base_price, image_url, category_id, barcode, is_active').eq('is_active', true);
      return data || [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name, name_ar').eq('is_active', true);
      return data || [];
    },
  });

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.name_ar?.includes(search) || p.barcode?.includes(search);
    const matchCat = category === 'all' || p.category_id === category;
    return matchSearch && matchCat;
  });

  const addToCart = (product) => {
    const price = product.base_price || 0;
    setCart(prev => {
      const exist = prev.find(i => i.product_id === product.id);
      if (exist) return prev.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name_ar || product.name, price, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => i.product_id === productId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const vat      = subtotal * 0.15;
  const total    = subtotal + vat;

  async function handleCheckout() {
    if (!cart.length) return;
    setProcessing(true);
    try {
      const orderNumber = `ORD-${Date.now()}`;
      const branchId = (() => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}').id || null; } catch { return null; } })();
      const { error } = await supabase.from('orders').insert({
        order_number: orderNumber,
        status: 'completed',
        payment_method: payMethod,
        items: cart.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.qty })),
        subtotal,
        tax_amount: vat,
        total,
        branch_id: branchId,
      });
      if (error) throw error;
      toast.success('✅ تم إتمام الطلب بنجاح!');
      setCart([]);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard-orders'] });
    } catch (err) {
      toast.error('خطأ: ' + err.message);
    }
    setProcessing(false);
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]" dir="rtl">
      {/* المنتجات */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن منتج أو باركود..."
              className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button onClick={() => setCategory('all')}
            className={`flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium transition-colors ${category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            الكل
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium transition-colors ${category === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {c.name_ar || c.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(p => {
              const inCart = cart.find(i => i.product_id === p.id);
              return (
                <button key={p.id} onClick={() => addToCart(p)}
                  className={`bg-card border rounded-2xl p-3 text-right transition-all hover:shadow-md hover:border-primary/50 active:scale-95 relative ${inCart ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                  {inCart && (
                    <span className="absolute top-2 left-2 w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs font-bold flex items-center justify-center">
                      {inCart.qty}
                    </span>
                  )}
                  <div className="w-full aspect-square bg-muted/30 rounded-xl mb-2 flex items-center justify-center text-2xl overflow-hidden">
                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover rounded-xl" alt="" /> : '🛍️'}
                  </div>
                  <p className="font-bold text-sm text-foreground truncate">{p.name_ar || p.name}</p>
                  <p className="text-primary font-black text-sm mt-0.5">{p.base_price} ر.س</p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" />
                لا توجد منتجات
              </div>
            )}
          </div>
        </div>
      </div>

      {/* الكارت */}
      <div className="w-80 flex-shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />الطلب الحالي
          </h3>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-20" />
              أضف منتجات للطلب
            </div>
          ) : cart.map(item => (
            <div key={item.product_id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                <p className="text-xs text-primary font-bold">{(item.price * item.qty).toFixed(2)} ر.س</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.product_id, -1)}
                  className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                <button onClick={() => updateQty(item.product_id, 1)}
                  className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>المجموع</span><span>{subtotal.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>ضريبة 15%</span><span>{vat.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between font-black text-foreground text-base pt-1 border-t border-border">
              <span>الإجمالي</span><span className="text-primary">{total.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m.id} onClick={() => setPayMethod(m.id)}
                className={`flex items-center gap-1.5 justify-center h-9 rounded-xl text-xs font-medium transition-colors ${payMethod === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                <m.icon className="w-3.5 h-3.5" />{m.label}
              </button>
            ))}
          </div>

          <button onClick={handleCheckout} disabled={!cart.length || processing}
            className="w-full h-11 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CreditCard className="w-4 h-4" />}
            إتمام الدفع • {total.toFixed(2)} ر.س
          </button>
        </div>
      </div>
    </div>
  );
}
