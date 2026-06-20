/**
 * ══════════════════════════════════════════════════════════════════
 * Felsy Business Logic — Core ERP Engine
 *
 * يعالج:
 *  1. العروض والباقات (Bundles & Promotions)
 *  2. إدارة المخزون متعدد المستودعات
 *  3. القيود المحاسبية التلقائية (Auto Journal Entries)
 *  4. توليد فواتير ZATCA Phase 2
 *
 * تصميم: Event-Driven + Plugin-Ready
 * لإضافة تكامل جديد (سلة، زد) أضف فقط plugin في INTEGRATION_HOOKS
 * ══════════════════════════════════════════════════════════════════
 */

import Decimal from 'decimal.js'; // Fixed-Point Arithmetic — تجنب أخطاء الهلل
import { supabase } from '@/integrations/supabase/client';
import { audit, AuditHelper } from '@/lib/audit';
import { generateZATCAQR } from '@/lib/zatca';

// ── Fixed-Point Arithmetic Setup ────────────────────────────────
Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });
const SAR = (n: number | string) => new Decimal(n);

// ── Integration Plugin System ────────────────────────────────────
// لإضافة تكامل جديد: أضف hook بدون تعديل هذا الكود
type SaleEvent   = { invoice: Invoice; items: OrderItem[]; total: number };
type RefundEvent = { invoiceId: string; amount: number; reason: string };

const INTEGRATION_HOOKS: {
  onSaleComplete?: (e: SaleEvent)   => Promise<void>;
  onRefund?:       (e: RefundEvent) => Promise<void>;
  onStockLow?:     (productId: string, qty: number) => Promise<void>;
}[] = [];

export function registerIntegrationPlugin(plugin: typeof INTEGRATION_HOOKS[0]) {
  INTEGRATION_HOOKS.push(plugin);
}

// ── Types ────────────────────────────────────────────────────────
interface OrderItem {
  product_id:    string;
  product_name:  string;
  quantity:      number;
  unit_price:    number;
  discount?:     number;
  bundle_id?:    string;
  warehouse_id?: string;
  cost_price?:   number;
}

interface Bundle {
  id:         string;
  name:       string;
  price:      number;
  items:      { product_id: string; quantity: number }[];
  tax_included: boolean;
}

interface Invoice {
  id:           string;
  invoice_type: 'B2C' | 'B2B';
  uuid:         string;
  branch_id:    string;
  customer_id?: string;
  items:        OrderItem[];
  subtotal:     number;
  discount:     number;
  vat_amount:   number;
  total:        number;
  qr_code:      string;
  zatca_status: 'pending' | 'submitted' | 'accepted' | 'error';
  created_at:   string;
}

// ── ١. Bundle & Promotion Engine ────────────────────────────────
export async function validateBundle(
  bundle: Bundle,
  quantity: number,
  warehouseId: string
): Promise<{ valid: boolean; error?: string; stockMap?: Record<string, number> }> {
  const needed: Record<string, number> = {};
  for (const item of bundle.items) {
    needed[item.product_id] = (needed[item.product_id] || 0) + item.quantity * quantity;
  }

  const { data: stocks, error } = await supabase
    .from('inventory_items')
    .select('product_id, quantity')
    .in('product_id', Object.keys(needed))
    .eq('warehouse_id', warehouseId);

  if (error) return { valid: false, error: 'خطأ في التحقق من المخزون' };

  const stockMap: Record<string, number> = {};
  for (const s of stocks || []) stockMap[s.product_id] = s.quantity;

  for (const [pid, qty] of Object.entries(needed)) {
    const available = stockMap[pid] || 0;
    if (available < qty) {
      return { valid: false, error: `المخزون غير كافٍ للمنتج ${pid} — متاح: ${available}, مطلوب: ${qty}` };
    }
  }
  return { valid: true, stockMap };
}

// ── ٢. Checkout Engine ──────────────────────────────────────────
export async function processCheckout(params: {
  branchId:    string;
  warehouseId: string;
  items:       OrderItem[];
  customerId?: string;
  invoiceType: 'B2C' | 'B2B';
  paymentMethod: string;
  settings:    Record<string, unknown>;
}): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {

  const { branchId, warehouseId, items, customerId, invoiceType, paymentMethod, settings } = params;

  // ── التحقق من المخزون لكل منتج ──────────────────────────────
  const stockCheck = await checkStockForItems(items, warehouseId);
  if (!stockCheck.valid) return { success: false, error: stockCheck.error };

  // ── حساب المبالغ بـ Fixed-Point ─────────────────────────────
  const vatRate   = SAR(settings.vat_rate as number || 15);
  let   subtotal  = SAR(0);
  let   vatAmount = SAR(0);

  for (const item of items) {
    const lineSubtotal = SAR(item.unit_price).mul(item.quantity).minus(item.discount || 0);
    const lineVAT      = lineSubtotal.mul(vatRate).div(100);
    subtotal  = subtotal.plus(lineSubtotal);
    vatAmount = vatAmount.plus(lineVAT);
  }

  const discount = SAR(0); // يمكن تطبيق كوبون هنا
  const total     = subtotal.plus(vatAmount).minus(discount);

  // ── توليد UUID + QR ZATCA ───────────────────────────────────
  const uuid  = crypto.randomUUID();
  const qrCode = generateZATCAQR({
    sellerName:   settings.company_name as string || 'فلسي',
    vatNumber:    settings.vat_number as string   || '',
    invoiceDate:  new Date().toISOString(),
    invoiceTotal: total.toString(),
    vatAmount:    vatAmount.toString(),
  });

  // ── إنشاء الفاتورة في قاعدة البيانات (Transaction) ─────────
  const invoiceData = {
    uuid,
    invoice_type:   invoiceType,
    branch_id:      branchId,
    customer_id:    customerId || null,
    items:          JSON.stringify(items),
    subtotal:       subtotal.toNumber(),
    discount:       discount.toNumber(),
    vat_amount:     vatAmount.toNumber(),
    total:          total.toNumber(),
    qr_code:        qrCode,
    payment_method: paymentMethod,
    zatca_status:   'pending',
    created_at:     new Date().toISOString(),
  };

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert(invoiceData)
    .select()
    .single();

  if (invError) return { success: false, error: 'فشل إنشاء الفاتورة: ' + invError.message };

  // ── خصم المخزون ──────────────────────────────────────────────
  await deductStock(items, warehouseId, invoice.id);

  // ── إنشاء القيد المحاسبي تلقائياً ────────────────────────────
  await createAccountingEntry({
    invoiceId:  invoice.id,
    subtotal:   subtotal.toNumber(),
    vatAmount:  vatAmount.toNumber(),
    total:      total.toNumber(),
    items,
    branchId,
  });

  // ── تسجيل في Audit Log ───────────────────────────────────────
  AuditHelper.posSale(invoice.id, total.toNumber());

  // ── إطلاق Integration Hooks ──────────────────────────────────
  for (const plugin of INTEGRATION_HOOKS) {
    plugin.onSaleComplete?.({ invoice: invoice as unknown as Invoice, items, total: total.toNumber() })
      .catch(e => console.warn('[Plugin Error]', e));
  }

  return { success: true, invoice: invoice as unknown as Invoice };
}

// ── ٣. Multi-Warehouse Stock Check ──────────────────────────────
async function checkStockForItems(
  items: OrderItem[],
  warehouseId: string
): Promise<{ valid: boolean; error?: string }> {
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: stocks, error } = await supabase
    .from('inventory_items')
    .select('product_id, quantity')
    .in('product_id', productIds)
    .eq('warehouse_id', warehouseId);

  if (error) return { valid: false, error: 'خطأ في التحقق من المخزون' };

  const stockMap: Record<string, number> = {};
  for (const s of stocks || []) stockMap[s.product_id] = s.quantity;

  const needed: Record<string, number> = {};
  for (const item of items) {
    needed[item.product_id] = (needed[item.product_id] || 0) + item.quantity;
  }

  for (const [pid, qty] of Object.entries(needed)) {
    if ((stockMap[pid] || 0) < qty) {
      return { valid: false, error: `المخزون غير كافٍ — المنتج: ${pid}` };
    }
  }
  return { valid: true };
}

async function deductStock(items: OrderItem[], warehouseId: string, invoiceId: string) {
  for (const item of items) {
    await supabase.rpc('deduct_stock', {
      p_product_id:   item.product_id,
      p_warehouse_id: warehouseId,
      p_quantity:     item.quantity,
      p_invoice_id:   invoiceId,
    });
    // تسجيل حركة المخزون
    AuditHelper.stockAdjust(item.product_id, -item.quantity, `بيع — فاتورة ${invoiceId}`);
  }
}

// ── ٤. Auto Journal Entry (قيد محاسبي تلقائي) ─────────────────
export async function createAccountingEntry(params: {
  invoiceId: string;
  subtotal:  number;
  vatAmount: number;
  total:     number;
  items:     OrderItem[];
  branchId:  string;
  isRefund?: boolean;
}) {
  const { invoiceId, subtotal, vatAmount, total, items, branchId, isRefund } = params;
  const sign = isRefund ? -1 : 1;

  // Chart of Accounts (COA) — يُفترض وجود مسبق
  // DR: النقدية / ذمم مدينة
  // CR: المبيعات + ضريبة القيمة المضافة
  // DR: تكلفة البضاعة المباعة (COGS)
  // CR: المخزون

  const cogs = items.reduce((s, item) => s + ((item.cost_price || 0) * item.quantity), 0);

  const entries = [
    // ١. قيد المبيعات
    {
      invoice_id:    invoiceId,
      branch_id:     branchId,
      entry_type:    'auto',
      debit_account: '1100', // النقدية / ذمم مدينة
      credit_account:'4100', // إيرادات المبيعات
      amount:        SAR(subtotal).mul(sign).toNumber(),
      description:   `${isRefund ? 'استرجاع' : 'مبيعات'} — فاتورة ${invoiceId}`,
      created_at:    new Date().toISOString(),
    },
    // ٢. قيد ضريبة القيمة المضافة
    {
      invoice_id:    invoiceId,
      branch_id:     branchId,
      entry_type:    'auto',
      debit_account: isRefund ? '2200' : '1100', // VAT مستحق/نقد
      credit_account:isRefund ? '1100' : '2200', // ضريبة القيمة المضافة
      amount:        SAR(vatAmount).toNumber(),
      description:   `VAT 15% — فاتورة ${invoiceId}`,
      created_at:    new Date().toISOString(),
    },
  ];

  // قيد COGS إذا توفرت أسعار التكلفة
  if (cogs > 0) {
    entries.push({
      invoice_id:    invoiceId,
      branch_id:     branchId,
      entry_type:    'auto',
      debit_account: '5100',  // تكلفة البضاعة المباعة COGS
      credit_account:'1500',  // المخزون
      amount:        SAR(cogs).mul(sign).toNumber(),
      description:   `COGS — فاتورة ${invoiceId}`,
      created_at:    new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.from('journal_entries').insert(entries).select('id').single();
  if (!error && data) {
    AuditHelper.accountingEntry(data.id, total);
  }
}

// ── ٥. Refund Engine ─────────────────────────────────────────────
export async function processRefund(params: {
  originalInvoiceId: string;
  refundItems:       OrderItem[];
  reason:            string;
  refundType:        'full' | 'partial';
  warehouseId:       string;
  branchId:          string;
}): Promise<{ success: boolean; creditNoteId?: string; error?: string }> {

  const { originalInvoiceId, refundItems, reason, warehouseId, branchId } = params;

  // إنشاء Credit Note متوافق مع ZATCA
  const refundTotal = refundItems.reduce((s, i) =>
    SAR(s).plus(SAR(i.unit_price).mul(i.quantity)).toNumber(), 0);
  const vatAmount   = SAR(refundTotal).mul(15).div(100).toNumber();

  const { data: creditNote, error } = await supabase
    .from('invoices')
    .insert({
      invoice_type:       'credit_note',
      original_invoice_id: originalInvoiceId,
      branch_id:          branchId,
      uuid:               crypto.randomUUID(),
      items:              JSON.stringify(refundItems),
      subtotal:           SAR(refundTotal).toNumber(),
      vat_amount:         SAR(vatAmount).toNumber(),
      total:              SAR(refundTotal).plus(vatAmount).toNumber(),
      reason,
      zatca_status:       'pending',
      created_at:         new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: 'فشل إنشاء إشعار دائن: ' + error.message };

  // إعادة المخزون
  for (const item of refundItems) {
    await supabase.rpc('add_stock', {
      p_product_id:   item.product_id,
      p_warehouse_id: warehouseId,
      p_quantity:     item.quantity,
      p_invoice_id:   creditNote.id,
    });
  }

  // قيد محاسبي عكسي
  await createAccountingEntry({
    invoiceId: creditNote.id,
    subtotal:  refundTotal,
    vatAmount,
    total:     refundTotal + vatAmount,
    items:     refundItems,
    branchId,
    isRefund:  true,
  });

  AuditHelper.refund(originalInvoiceId, refundTotal);

  // Integration Hooks
  for (const plugin of INTEGRATION_HOOKS) {
    plugin.onRefund?.({ invoiceId: originalInvoiceId, amount: refundTotal, reason })
      .catch(e => console.warn('[Plugin Error]', e));
  }

  return { success: true, creditNoteId: creditNote.id };
}
