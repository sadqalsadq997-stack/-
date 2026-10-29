import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ShoppingCart, TrendingUp, Users, Package,
  Clock, ArrowUpRight, ArrowDownRight,
  ChevronRight, AlertTriangle, Shield, CheckCircle, XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AccountNumber from '@/components/AccountNumber';

function StatCard({ icon: Icon, label, value, change, color = 'text-primary', bg = 'bg-primary/10' }) {
  const positive = change >= 0;
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {change !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
            {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-black text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── بانر الفوترة الإلكترونية في لوحة التحكم ─────────────────────────
function ZATCAStatusBanner() {
  const { data: st } = useQuery({
    queryKey: ['zatca-dashboard-status'],
    queryFn: async () => {
      let br = null; try { br = JSON.parse(localStorage.getItem('activeBranch') || '{}').id; } catch { /* */ }
      if (!br) return null;
      return (await supabase.rpc('zatca_branch_status', { p_branch: br })).data;
    },
    staleTime: 60_000, refetchInterval: 120_000,
  });
  if (!st) return null;

  if (st.status !== 'active') {
    return (
      <Link to="/settings?tab=zatca" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 hover:bg-amber-100">
        <Shield className="h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">اربط فرعك بمنصة فاتورة (المرحلة الثانية)</p>
          <p className="text-xs text-amber-800">إلزامية لكل منشأة مسجلة بالضريبة دخلت موجتها — الربط من الإعدادات بدقيقتين برمز OTP</p>
        </div>
        <span className="text-xs font-medium text-amber-800">ربط ←</span>
      </Link>
    );
  }
  const days = st.cert_expires_at ? Math.ceil((new Date(st.cert_expires_at) - new Date()) / 864e5) : null;
  if (st.overdue > 0 || st.rejected > 0) {
    return (
      <Link to="/zatca-admin" className="flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-3.5 hover:bg-red-100">
        <XCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
        <div className="flex-1">
          <p className="text-sm font-bold text-red-800">{st.overdue > 0 ? `${st.overdue} فاتورة متأخرة عن الإرسال للهيئة` : `${st.rejected} فاتورة مرفوضة من الهيئة`}</p>
          <p className="text-xs text-red-700">المهلة النظامية للفاتورة المبسطة 24 ساعة — افتح مركز الفوترة للمعالجة</p>
        </div>
        <span className="text-xs font-medium text-red-700">معالجة ←</span>
      </Link>
    );
  }
  if (days !== null && days <= 30) {
    return (
      <Link to="/settings?tab=zatca" className="flex items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-3.5 hover:bg-yellow-100">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-600" />
        <div className="flex-1">
          <p className="text-sm font-bold text-yellow-800">شهادة الربط تنتهي خلال {days} يوم</p>
          <p className="text-xs text-yellow-700">أعد الربط برمز OTP جديد قبل الانتهاء</p>
        </div>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-3">
      <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />
      <div className="flex-1">
        <p className="text-sm font-bold text-green-800">الفوترة الإلكترونية شغالة ✓</p>
        <p className="text-xs text-green-700">{st.reported_24h} فاتورة انرسلت للهيئة آخر 24 ساعة{st.pending ? ` · ${st.pending} بالطريق` : ''}</p>
      </div>
      <Link to="/zatca-admin" className="text-xs font-medium text-green-700 hover:underline">التفاصيل ←</Link>
    </div>
  );
}

export default function Dashboard() {
  const today = new Date().toISOString().split('T')[0];

  const { data: orders = [] } = useQuery({
    queryKey: ['dashboard-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('id, order_number, total, status, created_at, customer_name').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, stock_quantity, min_stock_alert, track_inventory');
      return data || [];
    },
  });

  const { data: customersCount } = useQuery({
    queryKey: ['dashboard-customers-count'],
    queryFn: async () => {
      const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true });
      return count || 0;
    },
  });

  const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => ['pending', 'preparing'].includes(o.status));
  const lowStock = products.filter(p => p.track_inventory && (p.stock_quantity || 0) <= (p.min_stock_alert || 5));

  const formatSAR = (n) => `${Number(n || 0).toLocaleString('ar')} ⃁`;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">لوحة التحكم</h1>
          <AccountNumber showName className="mt-1" />
          <p className="text-muted-foreground text-sm">{new Date().toLocaleDateString('ar', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl px-3 py-1.5 text-sm font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          مفتوح
        </div>
      </div>

      {/* ── بانر ZATCA ── */}
      <ZATCAStatusBanner />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp}   label="مبيعات اليوم"    value={formatSAR(todayRevenue)}  change={12} color="text-emerald-500" bg="bg-emerald-500/10" />
        <StatCard icon={ShoppingCart} label="طلبات اليوم"    value={todayOrders.length}        change={5}  color="text-sage-500"    bg="bg-sage-500/10" />
        <StatCard icon={Users}        label="إجمالي العملاء" value={customersCount ?? '…'}      change={3}  color="text-peach-500"  bg="bg-peach-500/10" />
        <StatCard icon={Package}      label="المنتجات"       value={products.length}                        color="text-amber-500"   bg="bg-amber-500/10" />
      </div>

      {(pendingOrders.length > 0 || lowStock.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pendingOrders.length > 0 && (
            <Link to="/orders" className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 hover:bg-amber-500/20 transition-colors">
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-foreground">{pendingOrders.length} طلب قيد التنفيذ</p>
                <p className="text-xs text-muted-foreground">اضغط للمتابعة</p>
              </div>
            </Link>
          )}
          {lowStock.length > 0 && (
            <Link to="/inventory" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 hover:bg-red-500/20 transition-colors">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-foreground">{lowStock.length} منتج مخزونه منخفض</p>
                <p className="text-xs text-muted-foreground">اضغط للمخزون</p>
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-foreground">آخر الطلبات</h3>
          <Link to="/orders" className="text-sm text-primary hover:underline flex items-center gap-1">
            عرض الكل <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
            لا توجد طلبات بعد
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">طلب #{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{o.customer_name || new Date(o.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm text-foreground">{formatSAR(o.total)}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    o.status === 'completed' ? 'bg-emerald-500/15 text-emerald-600'
                    : o.status === 'pending'   ? 'bg-amber-500/15 text-amber-600'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {o.status === 'completed' ? 'مكتمل' : o.status === 'pending' ? 'معلق' : o.status === 'preparing' ? 'قيد التحضير' : o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
