import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Package, Plus, Search, Trash2, Edit3, Loader2, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ProductForm from '@/components/products/ProductForm';

export default function Products() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*, categories(name_ar, name)').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('تم حذف المنتج'); },
    onError: () => toast.error('فشل الحذف'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabase.from('products').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.name_ar?.includes(search) || p.barcode?.includes(search)
  );

  const formatSAR = n => `${Number(n || 0).toLocaleString('ar')} ر.س`;

  if (showForm || editing) {
    return <ProductForm product={editing} onClose={() => { setShowForm(false); setEditing(null); qc.invalidateQueries({ queryKey: ['products'] }); }} />;
  }

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          المنتجات
        </h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> إضافة منتج
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم المنتج أو الباركود..."
          className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
          لا توجد منتجات
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(p => (
              <div key={p.id} className={`flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-cover bg-muted" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{p.name_ar || p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.categories && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{p.categories.name_ar || p.categories.name}</span>}
                    {p.barcode && <span className="text-xs text-muted-foreground">{p.barcode}</span>}
                    {p.track_inventory && p.min_stock_alert != null && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" />تنبيه المخزون: {p.min_stock_alert}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{formatSAR(p.base_price)}</p>
                  {p.cost_price != null && <p className="text-xs text-muted-foreground">التكلفة: {formatSAR(p.cost_price)}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive.mutate({ id: p.id, is_active: p.is_active })}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                    {p.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setEditing(p)} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm('حذف المنتج؟')) deleteProduct.mutate(p.id); }}
                    className="p-2 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
