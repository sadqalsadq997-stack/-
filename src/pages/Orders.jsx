/**
 * صفحة الطلبات — مع عرض حالة ZATCA وزر إعادة الإرسال
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Receipt, Search, Eye, Loader2, CheckCircle2, Clock,
  XCircle, ChefHat, Shield, RefreshCw, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { submitInvoice } from '@/services/zatcaService';

const STATUS_MAP = {
  pending:    { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  preparing:  { label: 'يُحضَّر',      color: 'bg-blue-100 text-blue-700',   icon: ChefHat },
  ready:      { label: 'جاهز',          color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  completed:  { label: 'مكتمل',         color: 'bg-gray-100 text-gray-600',   icon: CheckCircle2 },
  cancelled:  { label: 'ملغي',          color: 'bg-red-100 text-red-600',     icon: XCircle },
};

const ZATCA_BADGE = {
  reported:  { label: 'ZATCA ✅', color: 'bg-green-100 text-green-700' },
  cleared:   { label: 'مُخلَّص ✅', color: 'bg-green-100 text-green-700' },
  pending:   { label: 'ZATCA ⏳', color: 'bg-yellow-100 text-yellow-700' },
  rejected:  { label: 'مرفوض ❌', color: 'bg-red-100 text-red-700' },
  error:     { label: 'خطأ ⚠️',   color: 'bg-red-100 text-red-700' },
};

export default function Orders() {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [selected, setSelected] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  // جلب إعدادات ZATCA للفرع النشط
  const { data: zatcaActive } = useQuery({
    queryKey: ['zatca-active'],
    queryFn: async () => {
      const { data: branch } = await supabase
        .from('branches')
        .select('id, zatca_enabled')
        .eq('is_active', true)
        .single();
      return branch?.zatca_enabled || false;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('تم تحديث الحالة');
    },
    onError: () => toast.error('فشل التحديث'),
  });

  // إعادة إرسال الفاتورة لـ ZATCA
  async function retryZATCA(order) {
    setRetrying(order.id);
    try {
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('is_active', true)
        .single();

      const result = await submitInvoice({
        branchId: branch.id,
        orderId: order.id,
        invoiceData: {
          invoiceType: 'simplified',
          items: (order.items || []).map((item, idx) => ({
            id: idx + 1,
            name: item.name_ar || item.name || 'منتج',
            quantity: item.quantity || 1,
            unitCode: 'PCE',
            unitPrice: item.unit_price || item.price || 0,
            lineTotal: (item.unit_price || item.price || 0) * (item.quantity || 1),
            vatRate: 15,
            vatAmount: Math.round((item.unit_price || item.price || 0) * (item.quantity || 1) * 0.15 * 100) / 100,
            vatCategory: 'S',
          })),
          subtotal: order.subtotal || order.total / 1.15,
          discountTotal: order.discount_amount || 0,
          vatAmount: order.tax_amount || (order.total * 15 / 115),
          total: order.total,
          paymentMethod: order.payment_method || 'cash',
        },
      });

      if (result.success) {
        toast.success(`✅ تم الإرسال لـ ZATCA: ${result.message}`);
        qc.invalidateQueries({ queryKey: ['orders'] });
      } else {
        toast.error(result.error || 'فشل إرسال الفاتورة');
      }
    } catch (err) {
      toast.error(err.message || 'خطأ غير متوقع');
    }
    setRetrying(null);
  }

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.order_number?.includes(search) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || o.status === filter;
    return matchSearch && matchFilter;
  });

  const formatSAR = n => `${Number(n || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`;

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" />الطلبات
        </h1>
        <div className="flex items-center gap-3">
          {zatcaActive && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-lg font-medium">
              <Shield className="w-3.5 h-3.5" /> ZATCA مفعّل
            </span>
          )}
          <span className="text-sm text-muted-foreground">{filtered.length} طلب</span>
        </div>
      </div>

      {/* ── فلاتر ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="رقم الطلب أو اسم العميل..."
            className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: 'الكل' },
            ...Object.entries(STATUS_MAP).map(([k, v]) => ({ id: k, label: v.label }))
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
                ${filter === f.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:border-primary/30'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── قائمة الطلبات ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
          لا توجد طلبات
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(order => {
              const sm = STATUS_MAP[order.status] || STATUS_MAP.pending;
              const Icon = sm.icon;
              const zb = ZATCA_BADGE[order.zatca_status];
              const needsRetry = zatcaActive && order.status === 'completed' &&
                (!order.zatca_status || ['pending', 'error', 'rejected'].includes(order.zatca_status));

              return (
                <div key={order.id}
                  className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors
                    ${selected?.id === order.id ? 'bg-primary/5' : ''}`}>
                  {/* رقم وحالة */}
                  <div className="min-w-0">
                    <p className="font-bold font-mono text-sm">#{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('ar-SA')}
                    </p>
                  </div>

                  {/* العميل */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{order.customer_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{order.order_type || 'نقطة بيع'}</p>
                  </div>

                  {/* المبلغ */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground">{formatSAR(order.total)}</p>
                    <p className="text-xs text-muted-foreground">{order.payment_method || '—'}</p>
                  </div>

                  {/* حالة الطلب */}
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${sm.color}`}>
                    <Icon className="w-3 h-3" />{sm.label}
                  </span>

                  {/* حالة ZATCA */}
                  {zb && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${zb.color}`}>
                      {zb.label}
                    </span>
                  )}

                  {/* زر إعادة إرسال ZATCA */}
                  {needsRetry && (
                    <button
                      onClick={() => retryZATCA(order)}
                      disabled={retrying === order.id}
                      title="إعادة إرسال لـ ZATCA"
                      className="flex-shrink-0 p-1.5 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors disabled:opacity-50">
                      {retrying === order.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />
                      }
                    </button>
                  )}

                  {/* زر التفاصيل */}
                  <button onClick={() => setSelected(selected?.id === order.id ? null : order)}
                    className="flex-shrink-0 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── تفاصيل الطلب المحدد ── */}
      {selected && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">تفاصيل الطلب #{selected.order_number}</h2>
            <button onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              ['العميل',   selected.customer_name || '—'],
              ['النوع',    selected.order_type    || '—'],
              ['الدفع',    selected.payment_method || '—'],
              ['الطاولة',  selected.table_number  || '—'],
              ['الإجمالي', formatSAR(selected.total)],
              ['الضريبة',  formatSAR(selected.tax_amount)],
              ['ZATCA UUID', selected.invoice_uuid ? selected.invoice_uuid.substring(0, 18) + '...' : '—'],
              ['حالة ZATCA', ZATCA_BADGE[selected.zatca_status]?.label || '—'],
            ].map(([k, v]) => (
              <div key={k} className="bg-muted/30 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">{k}</p>
                <p className="font-medium text-xs break-all">{v}</p>
              </div>
            ))}
          </div>

          {/* بنود الطلب */}
          {Array.isArray(selected.items) && selected.items.length > 0 && (
            <div>
              <p className="text-sm font-bold mb-2">الأصناف</p>
              <div className="space-y-1.5">
                {selected.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm bg-muted/20 rounded-lg px-3 py-2">
                    <span>{item.name_ar || item.name} × {item.quantity}</span>
                    <span className="font-medium">
                      {formatSAR((item.price || item.unit_price || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* تغيير الحالة */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <button key={k}
                onClick={() => updateStatus.mutate({ id: selected.id, status: k })}
                disabled={selected.status === k || updateStatus.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40
                  ${selected.status === k ? v.color : 'bg-muted hover:bg-muted/80'}`}>
                {v.label}
              </button>
            ))}
          </div>

          {/* زر إعادة إرسال لـ ZATCA */}
          {zatcaActive && selected.status === 'completed' &&
           (!selected.zatca_status || ['pending','error','rejected'].includes(selected.zatca_status)) && (
            <button
              onClick={() => retryZATCA(selected)}
              disabled={retrying === selected.id}
              className="flex items-center gap-2 h-9 px-4 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 disabled:opacity-50">
              {retrying === selected.id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Shield className="w-4 h-4" />
              }
              إرسال الفاتورة لـ ZATCA
            </button>
          )}
        </div>
      )}
    </div>
  );
}
