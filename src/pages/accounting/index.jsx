import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTrialBalance, getIncomeStatement, getAgingReport, createVoucher, DEFAULT_COA } from '@/lib/accounting';
import { AuditHelper } from '@/lib/audit';
import { exportToExcel } from '@/lib/exportExcel';
import { toast } from 'sonner';
import {
  BookOpen, TrendingUp, BarChart3, FileText, Scale,
  DollarSign, AlertCircle, Plus, Download, RefreshCw,
  ChevronRight, Loader2, CheckCircle2, Clock
} from 'lucide-react';

const fmt    = n => Number(n||0).toLocaleString('ar-SA', { minimumFractionDigits: 2 });
const fmtSAR = n => `${fmt(n)} ر.س`;

// ── تبويب دليل الحسابات ──────────────────────────────────────────
function COATab() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['coa'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('*').order('code');
      return data || DEFAULT_COA;
    },
  });

  const TYPE_COLORS = {
    asset:     'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    liability: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    equity:    'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    revenue:   'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    expense:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  };
  const TYPE_LABELS = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              {['الرمز','الحساب','الاسم الإنجليزي','النوع'].map(h => (
                <th key={h} className="text-right px-4 py-3 text-xs font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(accounts||[]).map(a => (
              <tr key={a.code} className={`border-b border-border/50 hover:bg-muted/20 ${a.is_group ? 'bg-muted/10' : ''}`}>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.code}</td>
                <td className="px-4 py-2.5 font-medium text-foreground" style={{ paddingRight: a.parent ? '2rem' : '1rem' }}>
                  {a.is_group ? <strong>{a.name}</strong> : a.name}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{a.name_en}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[a.type]||''}`}>
                    {TYPE_LABELS[a.type]||a.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── تبويب ميزان المراجعة ─────────────────────────────────────────
function TrialBalanceTab() {
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);

  async function load() {
    setLoading(true);
    const result = await getTrialBalance(undefined, fromDate||undefined, toDate||undefined);
    setData(result);
    setLoading(false);
    AuditHelper.export('accounting', { type: 'trial_balance', fromDate, toDate });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div><label className="text-xs text-muted-foreground block mb-1">من تاريخ</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="h-9 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="h-9 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          تحديث
        </button>
        {data && (
          <button onClick={() => exportToExcel(
              data.accounts.map(a => ({ 'الرمز': a.code, 'اسم الحساب': a.name, 'مدين': a.debit, 'دائن': a.credit, 'الرصيد': a.balance })),
              'ميزان المراجعة', `trial-balance-${fromDate||'all'}-${toDate||'all'}`
            )}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700">
            <Download className="w-4 h-4" /> تصدير Excel
          </button>
        )}
      </div>
      {data && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  {['الرمز','اسم الحساب','مدين','دائن','الرصيد'].map(h => (
                    <th key={h} className="text-right px-4 py-3 text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.accounts.map(a => (
                  <tr key={a.code} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.code}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-2.5 text-blue-600">{a.debit > 0 ? fmtSAR(a.debit) : '—'}</td>
                    <td className="px-4 py-2.5 text-green-600">{a.credit > 0 ? fmtSAR(a.credit) : '—'}</td>
                    <td className={`px-4 py-2.5 font-bold ${a.balance > 0 ? 'text-green-600' : a.balance < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {fmtSAR(Math.abs(a.balance))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/20 font-bold">
                  <td className="px-4 py-3" colSpan={2}>الإجمالي</td>
                  <td className="px-4 py-3 text-blue-600">{fmtSAR(data.totalDebit)}</td>
                  <td className="px-4 py-3 text-green-600">{fmtSAR(data.totalCredit)}</td>
                  <td className={`px-4 py-3 ${Math.abs(data.totalDebit - data.totalCredit) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                    {Math.abs(data.totalDebit - data.totalCredit) < 0.01 ? (
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> متوازن</span>
                    ) : fmtSAR(Math.abs(data.totalDebit - data.totalCredit))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── تبويب قائمة الدخل ───────────────────────────────────────────
function IncomeStatementTab() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const result = await getIncomeStatement();
    setData(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const rows = data ? [
    { label: 'إجمالي الإيرادات',        value: data.revenue,     color: 'text-green-600', bold: true },
    { label: 'تكلفة البضاعة المباعة',  value: -data.cogs,       color: 'text-red-500' },
    { label: 'إجمالي الربح',            value: data.grossProfit, color: 'text-blue-600', bold: true, border: true },
    { label: 'المصروفات التشغيلية',     value: -data.expenses,   color: 'text-orange-500' },
    { label: 'صافي الربح',              value: data.netProfit,   color: data.netProfit >= 0 ? 'text-green-600' : 'text-red-500', bold: true, border: true },
  ] : [];

  return (
    <div className="max-w-lg">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : data ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">قائمة الدخل</h3>
            </div>
            <button onClick={() => exportToExcel(
                rows.map(r => ({ 'البند': r.label, 'القيمة': r.value })),
                'قائمة الدخل', 'income-statement'
              )}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700">
              <Download className="w-3.5 h-3.5" /> تصدير Excel
            </button>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-5 py-3 ${r.border ? 'bg-muted/20' : ''}`}>
                <span className={`text-sm ${r.bold ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{r.label}</span>
                <span className={`font-bold ${r.color}`}>{fmtSAR(Math.abs(r.value))}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button onClick={load} className="mt-3 flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-sm">
        <RefreshCw className="w-3 h-3" /> تحديث
      </button>
    </div>
  );
}

// ── تبويب سندات ─────────────────────────────────────────────────
function VouchersTab() {
  const [type,    setType]    = useState('receipt');
  const [amount,  setAmount]  = useState('');
  const [desc,    setDesc]    = useState('');
  const [saving,  setSaving]  = useState(false);

  async function save() {
    if (!amount || !desc) return toast.error('أدخل المبلغ والوصف');
    setSaving(true);
    const { voucherNo, error } = await createVoucher({
      type, amount: Number(amount), account: '1110', counterpart: '4100',
      description: desc, branchId: 'default',
    });
    setSaving(false);
    if (error) { toast.error('فشل إنشاء السند'); return; }
    toast.success(`تم إنشاء السند ${voucherNo}`);
    setAmount(''); setDesc('');
  }

  const VOUCHER_TYPES = [
    { id: 'receipt', label: 'سند قبض',  color: 'text-green-600' },
    { id: 'payment', label: 'سند صرف',  color: 'text-red-500' },
    { id: 'journal', label: 'سند قيد',  color: 'text-blue-600' },
  ];

  return (
    <div className="max-w-md space-y-4">
      <div className="flex gap-2">
        {VOUCHER_TYPES.map(t => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
              type === t.id ? 'border-primary bg-primary/10 ' + t.color : 'border-border text-muted-foreground hover:border-primary/50'
            }`}>{t.label}</button>
        ))}
      </div>
      <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">البيان</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
        </div>
        <button onClick={save} disabled={saving}
          className="w-full flex items-center justify-center gap-2 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إنشاء السند
        </button>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────────
export default function Accounting() {
  const [tab, setTab] = useState('coa');

  const TABS = [
    { id: 'coa',      label: 'دليل الحسابات',    icon: BookOpen    },
    { id: 'trial',    label: 'ميزان المراجعة',   icon: Scale       },
    { id: 'income',   label: 'قائمة الدخل',      icon: TrendingUp  },
    { id: 'vouchers', label: 'السندات',           icon: FileText    },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" /> المحاسبة
        </h1>
      </div>

      <div className="flex gap-1 bg-muted p-1 rounded-2xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'coa'      && <COATab />}
      {tab === 'trial'    && <TrialBalanceTab />}
      {tab === 'income'   && <IncomeStatementTab />}
      {tab === 'vouchers' && <VouchersTab />}
    </div>
  );
}
