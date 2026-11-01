/**
 * صفحة الطلبات — مع عرض حالة ZATCA وزر إعادة الإرسال
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Receipt, Search, Eye, Loader2, CheckCircle2, Clock,
  XCircle, ChefHat, Shield, RefreshCw, AlertCircle, Printer, Undo2
} from 'lucide-react';
import ReturnDialog from '@/components/orders/ReturnDialog';
import { printReceipt, loadSeller, PAY, TYPES } from '@/lib/receipt';
import { toast } from 'sonner';
import { issueEinvoice } from '@/lib/einvoice';
import { ZATCA_STATUS } from '@/pages/ZatcaCenter';

const STATUS_MAP = {
  awaiting_payment: { label: 'بانتظار اعتماد الدفع', color: 'bg-orange-100 text-orange-700', icon: Clock },
  pending:    { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  preparing:  { label: 'يُحضَّر',      color: 'bg-sage-100 text-sage-700',   icon: ChefHat },
  ready:      { label: 'جاهز',          color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  completed:  { label: 'مكتمل',         color: 'bg-gray-100 text-gray-600',   icon: CheckCircle2 },
  cancelled:  { label: 'ملغي',          color: 'bg-red-100 text-red-600',     icon: XCircle },
};

const ZATCA_BADGE = Object.fromEntries(Object.entries(ZATCA_STATUS).map(([k, v]) => [k, { label: v.label, color: v.cls }]));

export default function Orders() {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [selected, setSelected] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [returning, setReturning] = useState(null);
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
      let br = null; try { br = JSON.parse(localStorage.getItem('activeBranch') || '{}').id; } catch { /* */ }
      if (!br) return false;
      const { data } = await supabase.rpc('zatca_branch_status', { p_branch: br });
      return data?.status === 'active';
    },
    staleTime: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { data, error } = await supabase.from('orders').update({ status }).eq('id', id).select('id, invoice_no, zatca_status').single();
      if (error) throw error;
      // الإكمال قد يُصدر الفاتورة (طلبات الأونلاين) ⇒ نوقّعها ونرسلها للهيئة
      if (data?.invoice_no && (!data.zatca_status || data.zatca_status === 'pending')) issueEinvoice('invoice', id).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('تم تحديث الحالة');
    },
    onError: (e) => toast.error(e?.message || 'فشل التحديث'),
  });

  // توقيع/إعادة إرسال الفاتورة للهيئة (نفس البصمة — بدون رقم جديد في السلسلة)
  async function retryZATCA(order) {
    setRetrying(order.id);
    const r = await issueEinvoice('invoice', order.id, { timeoutMs: 15000 });
    setRetrying(null);
    if (r.status === 'not_onboarded') toast.error('الفرع غير مربوط بالهيئة — الإعدادات ← الفوترة');
    else if (r.qr) toast.success(ZATCA_STATUS[r.status]?.label || 'تم');
    else toast.error('تعذر الإرسال الآن — يعاد تلقائياً خلال دقائق');
    qc.invalidateQueries({ queryKey: ['orders'] });
  }

  const filtered = orders.filter(o => {
    const matchSearch = !search ||
      o.order_number?.includes(search) || o.invoice_no?.includes(search) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || o.status === filter;
    return matchSearch && matchFilter;
  });

  const formatSAR = n => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁`;

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
              const needsRetry = zatcaActive && order.invoice_no && ['pending', 'signed', 'error'].includes(order.zatca_status);

              return (
                <div key={order.id}
                  className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors
                    ${selected?.id === order.id ? 'bg-primary/5' : ''}`}>
                  {/* رقم وحالة */}
                  <div className="min-w-0">
                    <p className="font-bold font-mono text-sm">{order.invoice_no || `#${order.order_number}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>

                  {/* العميل */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{order.customer_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{TYPES[order.order_type] || order.order_type || 'نقطة بيع'}</p>
                  </div>

                  {/* المبلغ */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground">{formatSAR(order.total)}</p>
                    <p className="text-xs text-muted-foreground">{PAY[order.payment_method] || order.payment_method || '—'}</p>
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
              ['النوع',    TYPES[selected.order_type] || selected.order_type || '—'],
              ['الدفع',    PAY[selected.payment_method] || selected.payment_method || '—'],
              ['الطاولة',  selected.table_number  || '—'],
              ['الإجمالي', formatSAR(selected.total)],
              ['الضريبة',  formatSAR(selected.tax_amount)],
              ['رقم الفاتورة', selected.invoice_no || 'لم تصدر بعد'],
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

          {/* طباعة + مرتجع */}
          <div className="flex flex-wrap gap-2">
            <button onClick={async () => {
                // فاتورة الشركات في المرحلة الثانية: ما تُسلَّم قبل اعتماد الهيئة
                if (selected.is_b2b && zatcaActive && !String(selected.zatca_status || '').startsWith('cleared')) {
                  toast.error('فاتورة الشركة ما اعتمدتها الهيئة بعد — اضغط "إعادة الإرسال" وانتظر الاعتماد ثم اطبع');
                  return;
                }
                printReceipt(selected, await loadSeller(supabase));
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-muted px-4 text-sm font-bold hover:bg-muted/80">
              <Printer className="h-4 w-4" /> طباعة الفاتورة
            </button>
            {['completed', 'ready'].includes(selected.status) && (
              <button onClick={() => setReturning(selected)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-500/10 px-4 text-sm font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400">
                <Undo2 className="h-4 w-4" /> مرتجع (إشعار دائن)
              </button>
            )}
          </div>

          {/* لا يصل طلب الأونلاين للمطبخ إلا بعد اعتماد الكاشير استلام المبلغ فعلياً */}
          {selected.source === 'online' && selected.status === 'awaiting_payment' && (
            <button
              onClick={async () => {
                if (!window.confirm('تأكيد أنك استلمت كامل قيمة الطلب نقداً؟ بعد الاعتماد سيظهر الطلب للمطبخ.')) return;
                const { error } = await supabase.from('orders').update({
                  status: 'pending', payment_method: 'cash', amount_paid: selected.total,
                  change_due: 0, cashier_name: sessionStorage.getItem('pin_employee_name') || 'كاشير',
                }).eq('id', selected.id).eq('status', 'awaiting_payment');
                if (error) { toast.error(error.message || 'تعذر اعتماد الدفع'); return; }
                toast.success('تم اعتماد استلام الدفع وإرسال الطلب للمطبخ');
                setSelected({ ...selected, status: 'pending', payment_method: 'cash', amount_paid: selected.total });
                qc.invalidateQueries({ queryKey: ['orders'] });
              }}
              className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
            >تأكيد استلام الدفع نقداً وإرسال للمطبخ</button>
          )}

          {/* تغيير الحالة */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_MAP).filter(([k]) => !(k === 'cancelled' && selected.invoice_no)).map(([k, v]) => (
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
          {zatcaActive && selected.invoice_no && ['pending', 'signed', 'error'].includes(selected.zatca_status) && (
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
      {returning && <ReturnDialog order={returning} onClose={() => setReturning(null)} onDone={() => qc.invalidateQueries({ queryKey: ['orders'] })} />}
    </div>
  );
}
