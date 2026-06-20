import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ShoppingCart, TrendingUp, Users, Package,
  Clock, ArrowUpRight, ArrowDownRight,
  ChevronRight, AlertTriangle, Shield, CheckCircle, XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

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

// ── بانر حالة ZATCA في لوحة التحكم ───────────────────────────────────────
function ZATCAStatusBanner() {
  const { data: config } = useQuery({
    queryKey: ['zatca-dashboard-status'],
    queryFn: async () => {
      const { data: branch } = await supabase
        .from('branches')
        .select('id, zatca_enabled, zatca_status')
        .eq('is_active', true)
        .single();
      if (!branch) return null;

      const { data: zc } = await supabase
        .from('zatca_config')
        .select('onboarding_status, environment, pcsid_expires_at, invoice_counter, onboarding_error')
        .eq('branch_id', branch.id)
        .single();

      return { branch, zc };
    },
    staleTime: 60000,
  });

  if (!config) return null;
  const { branch, zc } = config;

  // لا نُظهر البانر إذا لم يُبدأ التسجيل
  if (!zc || zc.onboarding_status === 'not_started') {
    return (
      <Link to="/settings" className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3.5 hover:bg-primary/10 transition-colors">
        <Shield className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">ابدأ ربط ZATCA Phase 2</p>
          <p className="text-xs text-muted-foreground">أصدر فواتير إلكترونية متوافقة مع هيئة الزكاة — اضغط للإعداد</p>
        </div>
        <span className="text-xs text-primary font-medium">إعداد ←</span>
      </Link>
    );
  }

  if (zc.onboarding_status === 'active') {
    // تحقق من انتهاء صلاحية الشهادة
    const daysLeft = zc.pcsid_expires_at
      ? Math.ceil((new Date(zc.pcsid_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
      : null;

    if (daysLeft !== null && daysLeft <= 30) {
      return (
        <Link to="/settings" className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-3.5 hover:bg-yellow-100 transition-colors">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-800">شهادة ZATCA تنتهي خلال {daysLeft} يوم</p>
            <p className="text-xs text-yellow-700">يُنصح بتجديد الشهادة قبل انتهائها لاستمرار إصدار الفواتير</p>
          </div>
          <span className="text-xs text-yellow-700 font-medium">تجديد ←</span>
        </Link>
      );
    }

    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-3">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-green-800">ZATCA Phase 2 مفعّل ✅</p>
          <p className="text-xs text-green-700">
            الفواتير تُرسَل تلقائياً — {zc.invoice_counter} فاتورة حتى الآن — بيئة: {zc.environment}
          </p>
        </div>
        <Link to="/zatca-admin" className="text-xs text-green-700 font-medium hover:underline">
          مراقبة ←
        </Link>
      </div>
    );
  }

  if (zc.onboarding_status === 'failed') {
    return (
      <Link to="/settings" className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3.5 hover:bg-red-100 transition-colors">
        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-red-800">فشل تسجيل ZATCA</p>
          <p className="text-xs text-red-700 truncate">{zc.onboarding_error || 'اضغط لمراجعة الإعدادات'}</p>
        </div>
        <span className="text-xs text-red-700 font-medium">إصلاح ←</span>
      </Link>
    );
  }

  // قيد التسجيل
  return (
    <Link to="/settings" className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 hover:bg-blue-100 transition-colors">
      <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold text-blue-800">التسجيل مع ZATCA جارٍ...</p>
        <p className="text-xs text-blue-700">أكمل خطوات الربط للبدء في إصدار الفواتير الإلكترونية</p>
      </div>
      <span className="text-xs text-blue-700 font-medium">متابعة ←</span>
    </Link>
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

  const formatSAR = (n) => `${Number(n || 0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">لوحة التحكم</h1>
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
        <StatCard icon={ShoppingCart} label="طلبات اليوم"    value={todayOrders.length}        change={5}  color="text-blue-500"    bg="bg-blue-500/10" />
        <StatCard icon={Users}        label="إجمالي العملاء" value={customersCount ?? '…'}      change={3}  color="text-violet-500"  bg="bg-violet-500/10" />
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
