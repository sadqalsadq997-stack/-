import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, Search, Loader2, ChefHat, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS = {
  pending:   { label: 'ينتظر', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  preparing: { label: 'يُحضَّر', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ready:     { label: 'جاهز للتسليم', color: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'تم التسليم', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-600 border-red-200' },
};

export default function CarOrders() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['car-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('order_type', 'car').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const updates = { status };
      if (status === 'ready') updates.car_status = 'ready';
      const { error } = await supabase.from('orders').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['car-orders'] }); toast.success('تم التحديث'); },
  });

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_number?.includes(search) || o.plate_number?.toLowerCase().includes(search.toLowerCase()) || o.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'active' ? ['pending','preparing','ready'].includes(o.status) : o.status === filter);
    return matchSearch && matchFilter;
  });

  const formatSAR = n => `${Number(n||0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Car className="w-6 h-6 text-primary" />طلبات السيارات
        </h1>
        <span className="text-sm text-muted-foreground">{filtered.length} طلب</span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم اللوحة أو العميل..."
            className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="h-10 bg-card border border-border rounded-xl px-3 text-sm focus:outline-none">
          <option value="active">النشطة</option>
          <option value="all">الكل</option>
          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-20" />لا توجد طلبات سيارات
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(order => {
            const st = STATUS[order.status] || STATUS.pending;
            return (
              <div key={order.id} className={`bg-card border-2 ${st.color} rounded-2xl p-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Car className="w-5 h-5" />
                      <span className="font-black text-lg">{order.plate_number || '—'}</span>
                      <span className="font-bold text-muted-foreground">#{order.order_number}</span>
                    </div>
                    {order.customer_name && <p className="text-sm text-muted-foreground mb-1">{order.customer_name}</p>}
                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {order.items.map((item, i) => (
                          <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {item.name_ar || item.name} ×{item.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString('ar')}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-xl text-primary">{formatSAR(order.total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {Object.entries(STATUS).filter(([k]) => k !== order.status).slice(0,4).map(([k,v]) => (
                    <button key={k} onClick={() => updateStatus.mutate({ id: order.id, status: k })}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80 ${v.color}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
