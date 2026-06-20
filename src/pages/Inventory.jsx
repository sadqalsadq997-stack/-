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
          { label: 'إجمالي المنتجات', value: products.length, color: 'text-blue-600', bg: 'bg-blue-50' },
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
                    <p className="font-bold text-foreground">{p.name_ar || p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.categories?.name_ar || p.categories?.name}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-black ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-500'}`}>{stock}</p>
                    <p className="text-xs text-muted-foreground">المخزون</p>
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

      {addStockProduct && (
        <AddStockDialog product={addStockProduct} onClose={() => { setAddStockProduct(null); qc.invalidateQueries({ queryKey: ['inventory-products'] }); }} />
      )}
    </div>
  );
}
