import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Boxes, Search, Loader2, AlertTriangle, Plus, ClipboardList, ChefHat, History } from 'lucide-react';
import AddStockDialog from '@/components/inventory/AddStockDialog';
import RecipeManager from '@/components/inventory/RecipeManager';

const LOG_TYPES = {
  sale: 'استهلاك بيع',
  restock: 'توريد',
  adjustment: 'تعديل يدوي',
  wastage: 'هدر / تالف',
  purchase: 'شراء',
  transfer: 'تحويل',
};

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('stock');
  const [addStockProduct, setAddStockProduct] = useState(null);
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('*, categories(name_ar, name), product_recipes(id)')
        .eq('track_inventory', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['inventory-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_logs')
        .select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const hasRecipe = p => Array.isArray(p.product_recipes) ? p.product_recipes.length > 0 : Boolean(p.product_recipes?.id);

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.name_ar?.includes(search);
    if (filter === 'low') return matchSearch && !hasRecipe(p) && (p.stock_quantity || 0) <= (p.min_stock_alert || 5);
    if (filter === 'out') return matchSearch && !hasRecipe(p) && (p.stock_quantity || 0) <= 0;
    return matchSearch;
  });

  const lowCount = products.filter(p => !hasRecipe(p) && (p.stock_quantity || 0) <= (p.min_stock_alert || 5)).length;
  const outCount = products.filter(p => !hasRecipe(p) && (p.stock_quantity || 0) <= 0).length;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-black text-foreground">
          <Boxes className="h-6 w-6 text-primary" /> المخزون والوصفات
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'أصناف تتبع المخزون', value: products.length, color: 'text-sage-600', bg: 'bg-sage-50' },
          { label: 'مخزون منخفض', value: lowCount, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'نفذ المخزون', value: outCount, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className={`text-sm ${s.color}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['stock', Boxes, 'المخزون'],
          ['recipes', ChefHat, 'الوصفات والمقادير'],
          ['history', History, 'حركة المخزون'],
        ].map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'recipes' ? (
        <RecipeManager />
      ) : tab === 'history' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-4 font-bold"><ClipboardList className="h-4 w-4 text-primary" /> آخر 100 حركة مخزون</div>
          {logsLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة بعد</div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map(log => (
                <div key={log.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{log.product_name || 'منتج'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{LOG_TYPES[log.type] || log.type} · {log.reason || log.wastage_reason || '—'}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString('ar-SA')}</p>
                  </div>
                  <div className="text-left">
                    <p className={`font-black tabular-nums ${Number(log.quantity_change) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {Number(log.quantity_change) > 0 ? '+' : ''}{Number(log.quantity_change || 0).toLocaleString('ar-SA')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">قبل {Number(log.previous_stock || 0).toLocaleString('ar-SA')} ← بعد {Number(log.new_stock || 0).toLocaleString('ar-SA')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم المنتج أو المادة الخام..."
                className="h-10 w-full rounded-xl border border-border bg-card pr-9 pl-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none">
              <option value="all">الكل</option>
              <option value="low">مخزون منخفض</option>
              <option value="out">نفذ المخزون</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="divide-y divide-border">
                {filtered.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">لا توجد أصناف مطابقة</p>}
                {filtered.map(p => {
                  const stock = Number(p.stock_quantity || 0);
                  const alert = Number(p.min_stock_alert || 5);
                  const recipeManaged = hasRecipe(p);
                  const isLow = !recipeManaged && stock <= alert;
                  const isOut = !recipeManaged && stock <= 0;
                  return (
                    <div key={p.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/20">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                          {p.name_ar || p.name}
                          {p.is_ingredient && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">مادة خام</span>}
                          {recipeManaged && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">مخزون بالمقادير</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{p.categories?.name_ar || p.categories?.name || p.unit_type || '—'}</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-${recipeManaged ? 'sm' : '2xl'} font-black ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-500'}`}>{recipeManaged ? 'يُخصم بالمقادير' : stock.toLocaleString('ar-SA')}</p>
                        <p className="text-xs text-muted-foreground">{recipeManaged ? 'مكونات الوصفة' : (p.unit_type || 'الوحدة')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">{alert.toLocaleString('ar-SA')}</p>
                        <p className="text-xs text-muted-foreground">حد التنبيه</p>
                      </div>
                      {(isOut || isLow) && <AlertTriangle className={`h-5 w-5 ${isOut ? 'text-red-500' : 'text-amber-500'}`} />}
                      {!recipeManaged && <button onClick={() => setAddStockProduct(p)}
                        className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/20">
                        <Plus className="h-3.5 w-3.5" />تعديل
                      </button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {addStockProduct && (
        <AddStockDialog product={addStockProduct} onClose={() => {
          setAddStockProduct(null);
          qc.invalidateQueries({ queryKey: ['inventory-products'] });
          qc.invalidateQueries({ queryKey: ['inventory-logs'] });
        }} />
      )}
    </div>
  );
}
