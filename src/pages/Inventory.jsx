import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Boxes, Search, Loader2, AlertTriangle, TrendingDown, TrendingUp, Plus } from 'lucide-react';
import { toast } from 'sonner';
import AddStockDialog from '@/components/inventory/AddStockDialog';

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [addStockProduct, setAddStockProduct] = useState(null);
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*, categories(name_ar, name)').eq('track_inventory', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['inventory-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.name_ar?.includes(search);
    if (filter === 'low') return matchSearch && (p.stock_quantity || 0) <= (p.min_stock_alert || 5);
    if (filter === 'out') return matchSearch && (p.stock_quantity || 0) === 0;
    return matchSearch;
  });

  const movementLabel = {
    restock: 'توريد', consumption: 'استهلاك يدوي', wastage: 'هدر / تالف',
    adjustment: 'تسوية', sale: 'استهلاك بيع / وصفة', purchase: 'شراء',
  };
  const lowCount = products.filter(p => (p.stock_quantity || 0) <= (p.min_stock_alert || 5)).length;
  const outCount = products.filter(p => (p.stock_quantity || 0) === 0).length;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary" />المخزون
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي المنتجات', value: products.length, color: 'text-sage-600', bg: 'bg-sage-50' },
          { label: 'مخزون منخفض', value: lowCount, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'نفذ المخزون', value: outCount, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className={`text-sm ${s.color}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
            className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="h-10 bg-card border border-border rounded-xl px-3 text-sm focus:outline-none">
          <option value="all">الكل</option>
          <option value="low">مخزون منخفض</option>
          <option value="out">نفذ المخزون</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(p => {
              const stock = p.stock_quantity || 0;
              const alert = p.min_stock_alert || 5;
              const isLow = stock <= alert;
              const isOut = stock === 0;
              return (
                <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                      {p.name_ar || p.name}
                      {p.is_ingredient && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">مادة خام</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.categories?.name_ar || p.categories?.name} {p.unit_type ? `• الوحدة: ${p.unit_type}` : ''}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-black ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-500'}`}>{Number(stock).toLocaleString('ar-SA',{maximumFractionDigits:3})}</p>
                    <p className="text-xs text-muted-foreground">المخزون {p.unit_type || ''}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">{alert}</p>
                    <p className="text-xs text-muted-foreground">الحد الأدنى</p>
                  </div>
                  {(isOut || isLow) && (
                    <AlertTriangle className={`w-5 h-5 ${isOut ? 'text-red-500' : 'text-amber-500'}`} />
                  )}
                  <button onClick={() => setAddStockProduct(p)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors">
                    <Plus className="w-3.5 h-3.5" />إضافة
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-black">آخر حركات المخزون</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">كل توريد واستهلاك وهدر وخصم مسجل بالتاريخ والكمية</p>
          </div>
          <span className="rounded-lg bg-muted px-2 py-1 text-xs">{logs.length} حركة</span>
        </div>
        {logs.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة بعد</p> : (
          <div className="divide-y divide-border">
            {logs.slice(0,30).map(log => (
              <div key={log.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{log.product_name || 'منتج'}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{log.reason || log.wastage_reason || '—'} • {new Date(log.created_at).toLocaleString('ar-SA')}</p>
                </div>
                <span className="rounded-lg bg-muted px-2 py-1 text-xs">{movementLabel[log.type] || log.type}</span>
                <span className={`min-w-20 text-left font-black tabular-nums ${Number(log.quantity_change) < 0 ? 'text-red-600' : 'text-emerald-600'}`} dir="ltr">
                  {Number(log.quantity_change) > 0 ? '+' : ''}{Number(log.quantity_change).toLocaleString('en-US',{maximumFractionDigits:3})}
                </span>
                <span className="text-[10px] text-muted-foreground" dir="ltr">{Number(log.previous_stock || 0).toLocaleString('en-US',{maximumFractionDigits:2})} → {Number(log.new_stock || 0).toLocaleString('en-US',{maximumFractionDigits:2})}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {addStockProduct && (
        <AddStockDialog product={addStockProduct} onClose={() => { setAddStockProduct(null); qc.invalidateQueries({ queryKey: ['inventory-products'] }); qc.invalidateQueries({ queryKey: ['inventory-logs'] }); }} />
      )}
    </div>
  );
}
