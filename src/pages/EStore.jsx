import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingBag, ToggleLeft, ToggleRight, Loader2, Globe, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function EStore() {
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['store-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: storeOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['store-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_orders').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const toggleStore = useMutation({
    mutationFn: async ({ id, show_in_store }) => {
      const { error } = await supabase.from('products').update({ show_in_store: !show_in_store }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store-products'] }),
  });

  const toggleMenu = useMutation({
    mutationFn: async ({ id, show_in_menu }) => {
      const { error } = await supabase.from('products').update({ show_in_menu: !show_in_menu }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store-products'] }),
  });

  const inStore = products.filter(p => p.show_in_store).length;
  const inMenu = products.filter(p => p.show_in_menu).length;
  const formatSAR = n => `${Number(n||0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" />المتجر الإلكتروني
        </h1>
        <a href="/menu" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline">
          <Globe className="w-4 h-4" />عرض المتجر
        </a>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'منتجات في المتجر', value: inStore, color: 'bg-blue-50 text-blue-700' },
          { label: 'منتجات في القائمة', value: inMenu, color: 'bg-green-50 text-green-700' },
          { label: 'طلبات متجر', value: storeOrders.length, color: 'bg-purple-50 text-purple-700' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-2xl p-4`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-bold flex items-center gap-2"><Package className="w-4 h-4" />المنتجات</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
        ) : (
          <div className="divide-y divide-border">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-3 hover:bg-muted/20 transition-colors">
                {p.image_url ? <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                  : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.name_ar || p.name}</p>
                  <p className="text-xs text-primary font-bold">{formatSAR(p.base_price)}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <button onClick={() => toggleMenu.mutate({ id: p.id, show_in_menu: p.show_in_menu })}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      {p.show_in_menu ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <span className="text-muted-foreground">القائمة</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <button onClick={() => toggleStore.mutate({ id: p.id, show_in_store: p.show_in_store })}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      {p.show_in_store ? <ToggleRight className="w-5 h-5 text-blue-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <span className="text-muted-foreground">المتجر</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {storeOrders.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border"><h2 className="font-bold">طلبات المتجر الأخيرة</h2></div>
          <div className="divide-y divide-border">
            {storeOrders.slice(0, 10).map(o => (
              <div key={o.id} className="flex items-center gap-4 p-3 hover:bg-muted/20 transition-colors text-sm">
                <div className="flex-1">
                  <p className="font-medium">{o.customer_name || 'عميل'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('ar')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {o.status === 'completed' ? 'مكتمل' : 'قيد المعالجة'}
                </span>
                <span className="font-bold text-primary">{formatSAR(o.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
