import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, TrendingUp, ShoppingCart, Users, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#3b82f6','#22c55e','#f97316','#eab308'];

export default function Analytics() {
  const [period, setPeriod] = useState('7');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['analytics-orders', period],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - Number(period));
      const { data, error } = await supabase.from('orders')
        .select('*').eq('status', 'completed').gte('created_at', since.toISOString()).order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['analytics-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('name_ar, name, base_price, cost_price').limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const totalTax = orders.reduce((s, o) => s + (o.tax_amount || 0), 0);
    const avgOrder = orders.length ? totalRevenue / orders.length : 0;

    // daily revenue chart
    const byDay = {};
    orders.forEach(o => {
      const d = o.created_at?.split('T')[0];
      if (d) byDay[d] = (byDay[d] || 0) + (o.total || 0);
    });
    const dailyChart = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).map(([date, total]) => ({
      date: new Date(date).toLocaleDateString('ar', { month: 'short', day: 'numeric' }),
      total: Math.round(total),
    }));

    // payment methods
    const byMethod = {};
    orders.forEach(o => { if (o.payment_method) byMethod[o.payment_method] = (byMethod[o.payment_method] || 0) + 1; });
    const methodChart = Object.entries(byMethod).map(([name, value]) => ({ name, value }));

    // top products from items
    const prodCount = {};
    orders.forEach(o => {
      if (Array.isArray(o.items)) o.items.forEach(item => {
        const key = item.name_ar || item.name;
        if (key) prodCount[key] = (prodCount[key] || 0) + (item.quantity || 1);
      });
    });
    const topProducts = Object.entries(prodCount).sort(([,a],[,b]) => b - a).slice(0,5).map(([name, count]) => ({ name, count }));

    return { totalRevenue, totalTax, avgOrder, dailyChart, methodChart, topProducts };
  }, [orders]);

  const formatSAR = n => `${Number(n || 0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />التحليلات
        </h1>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          className="h-10 bg-card border border-border rounded-xl px-3 text-sm focus:outline-none">
          <option value="7">آخر 7 أيام</option>
          <option value="30">آخر 30 يوم</option>
          <option value="90">آخر 90 يوم</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إجمالي المبيعات', value: formatSAR(stats.totalRevenue), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'عدد الطلبات', value: orders.length, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'متوسط الطلب', value: formatSAR(stats.avgOrder), icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'إجمالي الضريبة', value: formatSAR(stats.totalTax), icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-xl font-black text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {stats.dailyChart.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-bold mb-4">المبيعات اليومية</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.dailyChart}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => [formatSAR(v), 'المبيعات']} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.methodChart.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-bold mb-4">طرق الدفع</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={stats.methodChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({name, percent}) => `${name} ${Math.round(percent*100)}%`}>
                      {stats.methodChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {stats.topProducts.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-bold mb-4">الأصناف الأكثر مبيعاً</h2>
                <div className="space-y-2">
                  {stats.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{i+1}</span>
                      <span className="flex-1 text-sm truncate">{p.name}</span>
                      <span className="text-sm font-bold">{p.count} وحدة</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
