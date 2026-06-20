/**
 * ══════════════════════════════════════════════════════════════════
 * Felsy Accounting Engine
 * نظام محاسبي احترافي مشابه لـ Qoyod و Daftra
 *
 * يشمل:
 *  - Chart of Accounts (دليل الحسابات)
 *  - Journal Entries (القيود اليومية)
 *  - Trial Balance (ميزان المراجعة)
 *  - Income Statement (قائمة الدخل)
 *  - Balance Sheet (الميزانية)
 *  - Cash Flow (التدفقات النقدية)
 *  - Vouchers (السندات)
 *  - Aging Reports
 * ══════════════════════════════════════════════════════════════════
 */

import { supabase } from '@/integrations/supabase/client';

// ── دليل الحسابات الافتراضي ──────────────────────────────────────
export const DEFAULT_COA = [
  // الأصول (Assets)
  { code: '1000', name: 'الأصول',              name_en: 'Assets',             type: 'asset',     parent: null, is_group: true },
  { code: '1100', name: 'النقدية وما في حكمها', name_en: 'Cash & Equivalents', type: 'asset',     parent: '1000' },
  { code: '1110', name: 'الصندوق',              name_en: 'Cash on Hand',        type: 'asset',     parent: '1100' },
  { code: '1120', name: 'البنك',                name_en: 'Bank Account',        type: 'asset',     parent: '1100' },
  { code: '1200', name: 'الذمم المدينة',        name_en: 'Accounts Receivable', type: 'asset',     parent: '1000' },
  { code: '1300', name: 'المخزون',              name_en: 'Inventory',           type: 'asset',     parent: '1000' },
  { code: '1400', name: 'ضريبة قيمة مضافة مدفوعة', name_en: 'VAT Paid',       type: 'asset',     parent: '1000' },
  { code: '1500', name: 'أصول ثابتة',           name_en: 'Fixed Assets',        type: 'asset',     parent: '1000' },

  // الخصوم (Liabilities)
  { code: '2000', name: 'الخصوم',               name_en: 'Liabilities',         type: 'liability', parent: null, is_group: true },
  { code: '2100', name: 'الذمم الدائنة',        name_en: 'Accounts Payable',    type: 'liability', parent: '2000' },
  { code: '2200', name: 'ضريبة قيمة مضافة محصّلة', name_en: 'VAT Payable',     type: 'liability', parent: '2000' },
  { code: '2300', name: 'قروض قصيرة الأجل',     name_en: 'Short-term Loans',    type: 'liability', parent: '2000' },

  // حقوق الملكية (Equity)
  { code: '3000', name: 'حقوق الملكية',         name_en: 'Equity',              type: 'equity',    parent: null, is_group: true },
  { code: '3100', name: 'رأس المال',             name_en: 'Capital',             type: 'equity',    parent: '3000' },
  { code: '3200', name: 'الأرباح المحتجزة',      name_en: 'Retained Earnings',   type: 'equity',    parent: '3000' },

  // الإيرادات (Revenue)
  { code: '4000', name: 'الإيرادات',             name_en: 'Revenue',             type: 'revenue',   parent: null, is_group: true },
  { code: '4100', name: 'إيرادات المبيعات',      name_en: 'Sales Revenue',       type: 'revenue',   parent: '4000' },
  { code: '4200', name: 'إيرادات أخرى',          name_en: 'Other Revenue',       type: 'revenue',   parent: '4000' },

  // المصروفات (Expenses)
  { code: '5000', name: 'المصروفات',             name_en: 'Expenses',            type: 'expense',   parent: null, is_group: true },
  { code: '5100', name: 'تكلفة البضاعة المباعة', name_en: 'COGS',               type: 'expense',   parent: '5000' },
  { code: '5200', name: 'مصروفات تشغيلية',       name_en: 'Operating Expenses',  type: 'expense',   parent: '5000' },
  { code: '5210', name: 'رواتب',                 name_en: 'Salaries',            type: 'expense',   parent: '5200' },
  { code: '5220', name: 'إيجار',                 name_en: 'Rent',                type: 'expense',   parent: '5200' },
  { code: '5230', name: 'مصروفات تسويق',         name_en: 'Marketing',           type: 'expense',   parent: '5200' },
  { code: '5300', name: 'مصروفات مالية',         name_en: 'Finance Expenses',    type: 'expense',   parent: '5000' },
];

// ── Trial Balance ────────────────────────────────────────────────
export async function getTrialBalance(
  branchId?: string,
  fromDate?: string,
  toDate?: string
): Promise<{ accounts: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
  let q = supabase.from('journal_entries').select('debit_account, credit_account, amount');
  if (branchId) q = q.eq('branch_id', branchId);
  if (fromDate) q = q.gte('created_at', fromDate);
  if (toDate)   q = q.lte('created_at', toDate);

  const { data: entries } = await q;
  const map: Record<string, { debit: number; credit: number }> = {};

  for (const e of entries || []) {
    const amt = Number(e.amount) || 0;
    if (!map[e.debit_account])  map[e.debit_account]  = { debit: 0, credit: 0 };
    if (!map[e.credit_account]) map[e.credit_account] = { debit: 0, credit: 0 };
    map[e.debit_account].debit   += amt;
    map[e.credit_account].credit += amt;
  }

  const { data: accounts } = await supabase.from('chart_of_accounts').select('*').eq('is_group', false);
  const rows: TrialBalanceRow[] = (accounts || []).map(a => {
    const { debit = 0, credit = 0 } = map[a.code] || {};
    return { code: a.code, name: a.name, type: a.type, debit, credit, balance: debit - credit };
  }).filter(r => r.debit !== 0 || r.credit !== 0);

  const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { accounts: rows, totalDebit, totalCredit };
}

// ── Income Statement ─────────────────────────────────────────────
export async function getIncomeStatement(
  branchId?: string, fromDate?: string, toDate?: string
): Promise<{ revenue: number; cogs: number; grossProfit: number; expenses: number; netProfit: number }> {
  const { accounts } = await getTrialBalance(branchId, fromDate, toDate);
  const revenue   = accounts.filter(a => a.type === 'revenue').reduce((s, a) => s + a.credit - a.debit, 0);
  const cogs      = accounts.filter(a => a.code.startsWith('51')).reduce((s, a) => s + a.debit - a.credit, 0);
  const expenses  = accounts.filter(a => a.type === 'expense' && !a.code.startsWith('51')).reduce((s, a) => s + a.debit - a.credit, 0);
  return { revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses };
}

// ── Aging Report ─────────────────────────────────────────────────
export async function getAgingReport(
  type: 'receivable' | 'payable'
): Promise<AgingRow[]> {
  const table = type === 'receivable' ? 'customer_balances' : 'supplier_balances';
  const { data } = await supabase.from(table).select('*').gt('balance', 0);
  const now = Date.now();

  return (data || []).map(row => {
    const age = Math.floor((now - new Date(row.last_invoice_date).getTime()) / 86400000);
    return {
      id:    row.id,
      name:  row.name,
      total: row.balance,
      current:    age <= 30  ? row.balance : 0,
      days_30_60: age > 30  && age <= 60  ? row.balance : 0,
      days_60_90: age > 60  && age <= 90  ? row.balance : 0,
      days_90_120:age > 90  && age <= 120 ? row.balance : 0,
      over_120:   age > 120 ? row.balance : 0,
    };
  });
}

// ── Voucher ──────────────────────────────────────────────────────
export async function createVoucher(params: {
  type:        'receipt' | 'payment' | 'journal';
  amount:      number;
  account:     string;
  counterpart: string;
  description: string;
  branchId:    string;
  referenceId?: string;
}) {
  const voucherNo = `V-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase.from('vouchers').insert({
    voucher_no:  voucherNo,
    type:        params.type,
    amount:      params.amount,
    account:     params.account,
    counterpart: params.counterpart,
    description: params.description,
    branch_id:   params.branchId,
    reference_id:params.referenceId || null,
    created_at:  new Date().toISOString(),
  }).select('id').single();

  return { id: data?.id, voucherNo, error };
}

// ── Types ────────────────────────────────────────────────────────
export interface TrialBalanceRow {
  code: string; name: string; type: string;
  debit: number; credit: number; balance: number;
}
export interface AgingRow {
  id: string; name: string; total: number;
  current: number; days_30_60: number; days_60_90: number;
  days_90_120: number; over_120: number;
}
