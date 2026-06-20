import { supabase } from '@/integrations/supabase/client';
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, X, AlertTriangle, TrendingUp, Package, Clock, ShoppingBag, ChevronDown } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

export default function SmartNotifications() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissed_notifs') || '[]'); } catch { return []; }
  });

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => { const { data } = await supabase.from('products').select('id, name, name_ar, stock_quantity, min_stock_alert, track_inventory').eq('is_active', true); return data || []; } });
  const { data: stockItems = [] } = useQuery({ queryKey: ['stockItems'], queryFn: async () => [] });
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: async () => { const { data } = await supabase.from('orders').select('id, status, total, created_at').order('created_at', { ascending: false }).limit(50); return data || []; } });
  const { data: storeOrders = [] } = useQuery({ queryKey: ['storeOrders'], queryFn: async () => { const { data } = await supabase.from('store_orders').select('*').order('created_at', { ascending: false }).limit(20); return data || []; } });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: async () => { const { data } = await supabase.from('suppliers').select('id, name, balance_due, next_payment_date'); return data || []; } });

  const buildNotifications = () => {
    const notifs = [];

    // Low stock
    stockItems.forEach(s => {
      const prod = products.find(p => p.id === s.product_id);
      if (prod && s.quantity <= (prod.min_stock_alert || 5) && s.quantity > 0) {
        notifs.push({ id: `lowstock-${s.id}`, type: 'warning', icon: Package, title: 'مخزون منخفض', body: `${s.product_name}: ${s.quantity} وحدة متبقية`, color: 'text-amber-600' });
      }
      if (prod && s.quantity === 0) {
        notifs.push({ id: `nostock-${s.id}`, type: 'danger', icon: Package, title: 'نفاذ المخزون!', body: `${s.product_name}: انتهى المخزون تماماً`, color: 'text-destructive' });
      }
    });

    // Expiry alerts
    products.filter(p => p.expiry_date).forEach(p => {
      const days = differenceInDays(new Date(p.expiry_date), new Date());
      if (days >= 0 && days <= 30) {
        notifs.push({ id: `expiry-${p.id}`, type: 'danger', icon: AlertTriangle, title: 'انتهاء صلاحية قريب', body: `${p.name_ar || p.name}: ${days} يوم متبقي`, color: 'text-destructive' });
      } else if (days > 30 && days <= 60) {
        notifs.push({ id: `expiry-${p.id}`, type: 'warning', icon: AlertTriangle, title: 'تنبيه صلاحية', body: `${p.name_ar || p.name}: ${days} يوم`, color: 'text-amber-600' });
      }
    });

    // New store orders
    const newStoreOrders = storeOrders.filter(o => o.status === 'new');
    if (newStoreOrders.length > 0) {
      notifs.push({ id: 'store-new', type: 'info', icon: ShoppingBag, title: 'طلبات متجر جديدة', body: `${newStoreOrders.length} طلب ينتظر التأكيد`, color: 'text-blue-600' });
    }

    // Pending POS orders
    const pendingOrders = orders.filter(o => o.status === 'preparing' || o.status === 'pending');
    if (pendingOrders.length > 0) {
      notifs.push({ id: 'pending-orders', type: 'info', icon: Clock, title: 'طلبات قيد التنفيذ', body: `${pendingOrders.length} طلب قيد التنفيذ الآن`, color: 'text-blue-600' });
    }

    // Supplier balances
    suppliers.filter(s => (s.balance_due || 0) > 5000).forEach(s => {
      notifs.push({ id: `supplier-${s.id}`, type: 'warning', icon: TrendingUp, title: 'رصيد مورد مستحق', body: `${s.name}: ${s.balance_due?.toFixed(0)} ﷼ مستحقة`, color: 'text-amber-600' });
    });

    return notifs.filter(n => !dismissed.includes(n.id));
  };

  const notifications = buildNotifications();
  const count = notifications.length;

  const dismiss = (id) => {
    const newDismissed = [...dismissed, id];
    setDismissed(newDismissed);
    localStorage.setItem('dismissed_notifs', JSON.stringify(newDismissed));
  };

  const dismissAll = () => {
    const allIds = notifications.map(n => n.id);
    const newDismissed = [...dismissed, ...allIds];
    setDismissed(newDismissed);
    localStorage.setItem('dismissed_notifs', JSON.stringify(newDismissed));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 w-80 bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <span className="font-bold text-sm">التنبيهات الذكية</span>
              <div className="flex items-center gap-2">
                {count > 0 && <button onClick={dismissAll} className="text-xs text-muted-foreground hover:text-foreground">مسح الكل</button>}
                <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>لا توجد تنبيهات جديدة</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 border-b border-border/50">
                    <n.icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', n.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    </div>
                    <button onClick={() => dismiss(n.id)} className="text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}