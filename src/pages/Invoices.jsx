/**
 * صفحة الفواتير — مع عرض حالة ZATCA Phase 2 لكل فاتورة
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Search, Loader2, Eye, CheckCircle, Clock,
  XCircle, AlertCircle, Download, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { getZATCAStatusLabel } from '@/lib/zatca';
import ZATCAInvoicePDF from '@/components/invoices/ZATCAInvoicePDF';

// ── حالة ZATCA بالألوان ────────────────────────────────────────────────────
function ZATCABadge({ status }) {
  const conf = {
    reported:  { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50',  label: 'مُبلَّغ' },
    cleared:   { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50',  label: 'مُخلَّص' },
    pending:   { icon: Clock,       color: 'text-yellow-600',bg: 'bg-yellow-50', label: 'قيد الإرسال' },
    rejected:  { icon: XCircle,     color: 'text-red-600',   bg: 'bg-red-50',    label: 'مرفوض' },
    error:     { icon: AlertCircle, color: 'text-red-600',   bg: 'bg-red-50',    label: 'خطأ' },
    cancelled: { icon: XCircle,     color: 'text-gray-500',  bg: 'bg-gray-50',   label: 'ملغي' },
  }[status] || { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', label: status || '—' };

  const Icon = conf.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${conf.bg} ${conf.color}`}>
      <Icon className="w-3 h-3" />{conf.label}
    </span>
  );
}

export default function Invoices() {
  const [search, setSearch]   = useState('');
  const [viewing, setViewing] = useState(null);
  const [tab, setTab]         = useState('all'); // all | zatca

  // ── جلب الطلبات المكتملة ──
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['invoices-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  // ── جلب فواتير ZATCA ──
  const { data: zatcaInvoices = [] } = useQuery({
    queryKey: ['zatca-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zatca_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  // ── جلب بيانات الفرع ──
  const { data: branch } = useQuery({
    queryKey: ['active-branch'],
    queryFn: async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .single();
      return data;
    },
  });

  // Map: orderId → zatcaInvoice
  const zatcaMap = zatcaInvoices.reduce((acc, zi) => {
    if (zi.order_id) acc[zi.order_id] = zi;
    return acc;
  }, {});

  const filtered = orders.filter(o =>
    !search ||
    o.order_number?.includes(search) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredZATCA = tab === 'zatca'
    ? zatcaInvoices.filter(zi =>
        !search ||
        zi.invoice_number?.includes(search) ||
        zi.buyer_name?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const formatSAR = n => `${Number(n || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س`;

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> الفواتير
        </h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-4 h-4 text-primary" />
          <span>{zatcaInvoices.filter(z => ['reported','cleared'].includes(z.zatca_status)).length} فاتورة متوافقة مع ZATCA</span>
        </div>
      </div>

      {/* ── شريط التبويب ── */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: 'all',   label: `جميع الفواتير (${orders.length})` },
          { id: 'zatca', label: `ZATCA (${zatcaInvoices.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── بحث ── */}
      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'zatca' ? "رقم الفاتورة أو المشتري..." : "رقم الطلب أو العميل..."}
          className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : tab === 'all' ? (
        /* ── جدول الطلبات الكاملة ── */
        filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
            لا توجد فواتير مكتملة
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-muted-foreground">رقم الطلب</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">العميل</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">التاريخ</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">الضريبة</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">الإجمالي</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">ZATCA</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(o => {
                  const zi = zatcaMap[o.id];
                  return (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono font-bold">#{o.order_number}</td>
                      <td className="p-3">{o.customer_name || '—'}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(o.created_at).toLocaleString('ar-SA')}
                      </td>
                      <td className="p-3">{formatSAR(o.tax_amount)}</td>
                      <td className="p-3 font-bold text-primary">{formatSAR(o.total)}</td>
                      <td className="p-3">
                        <ZATCABadge status={zi?.zatca_status || o.zatca_status || 'pending'} />
                      </td>
                      <td className="p-3">
                        <button onClick={() => setViewing({ order: o, zatcaInvoice: zi })}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ── جدول فواتير ZATCA ── */
        filteredZATCA.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
            لا توجد فواتير ZATCA
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-muted-foreground">رقم الفاتورة</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">النوع</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">المشتري</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">التاريخ</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">الضريبة</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">الإجمالي</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredZATCA.map(zi => (
                  <tr key={zi.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-xs font-bold">{zi.invoice_number}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${
                        zi.invoice_type === 'simplified' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>
                        {zi.invoice_type === 'simplified' ? 'مبسّطة' : 'معيارية'}
                      </span>
                    </td>
                    <td className="p-3">{zi.buyer_name || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(zi.issue_date).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="p-3">{formatSAR(zi.vat_amount)}</td>
                    <td className="p-3 font-bold text-primary">{formatSAR(zi.total)}</td>
                    <td className="p-3">
                      <ZATCABadge status={zi.zatca_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── عرض PDF الفاتورة ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setViewing(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-background rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
            <ZATCAInvoicePDF
              order={viewing.order}
              branch={branch}
              zatcaInvoice={viewing.zatcaInvoice}
              onClose={() => setViewing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
