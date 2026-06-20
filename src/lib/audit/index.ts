/**
 * ══════════════════════════════════════════════════════════════════
 * Felsy Audit Log — Enterprise Activity Tracking
 * يسجل كل عملية مع: User, Branch, Device, IP, DateTime
 * ══════════════════════════════════════════════════════════════════
 */

import { supabase } from '@/integrations/supabase/client';
import { loadSession } from '@/lib/security/session';

export type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'session_expired'
  | 'create' | 'update' | 'delete' | 'view' | 'export'
  | 'refund' | 'invoice_cancel' | 'invoice_approve'
  | 'inventory_adjust' | 'stock_transfer'
  | 'permission_change' | 'role_change'
  | 'payment' | 'subscription_change'
  | 'zatca_submit' | 'zatca_error'
  | 'pos_sale' | 'order_complete' | 'order_cancel'
  | 'accounting_entry' | 'voucher_create'
  | 'branch_action' | 'settings_change';

export interface AuditEntry {
  action:      AuditAction;
  resource:    string;
  resource_id?: string;
  old_value?:  unknown;
  new_value?:  unknown;
  meta?:       Record<string, unknown>;
}

// Device fingerprint (بسيط — يمكن تعزيزه لاحقاً)
function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  const mobile = /Mobile|Android|iPhone/i.test(ua);
  const screen = `${window.screen.width}x${window.screen.height}`;
  return `${mobile ? 'mobile' : 'desktop'} | ${screen}`;
}

// IP من خدمة خارجية (cached per session)
let _cachedIP: string | null = null;
async function getClientIP(): Promise<string> {
  if (_cachedIP) return _cachedIP;
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
    const d = await r.json();
    _cachedIP = d.ip || 'unknown';
  } catch { _cachedIP = 'unknown'; }
  return _cachedIP!;
}

/**
 * تسجيل حدث في سجل المراقبة
 * استخدام: await audit({ action: 'create', resource: 'products', resource_id: id, new_value: data })
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const [session, ip] = await Promise.all([loadSession(), getClientIP()]);
    const logEntry = {
      action:       entry.action,
      resource:     entry.resource,
      resource_id:  entry.resource_id || null,
      old_value:    entry.old_value    ? JSON.stringify(entry.old_value)  : null,
      new_value:    entry.new_value    ? JSON.stringify(entry.new_value)  : null,
      meta:         entry.meta         ? JSON.stringify(entry.meta)       : null,
      user_id:      session?.empId     || null,
      user_name:    session?.empName   || 'نظام',
      user_role:    session?.role      || null,
      branch_id:    session?.branchId  || null,
      device_info:  getDeviceInfo(),
      ip_address:   ip,
      user_agent:   navigator.userAgent.slice(0, 200),
      created_at:   new Date().toISOString(),
    };
    // Non-blocking: لا تنتظر إذا فشل
    supabase.from('audit_logs').insert(logEntry).then(({ error }) => {
      if (error) console.warn('[Felsy Audit] فشل تسجيل الحدث:', error.message);
    });
  } catch (e) {
    console.warn('[Felsy Audit] خطأ:', e);
  }
}

/**
 * مساعد سريع لتسجيل العمليات الشائعة
 */
export const AuditHelper = {
  login:       (userId: string, name: string) => audit({ action: 'login',       resource: 'auth',         meta: { userId, name } }),
  logout:      ()                             => audit({ action: 'logout',      resource: 'auth'          }),
  loginFailed: (reason: string)               => audit({ action: 'login_failed', resource: 'auth',        meta: { reason } }),
  create:      (r: string, id: string, d: unknown) => audit({ action: 'create', resource: r, resource_id: id, new_value: d }),
  update:      (r: string, id: string, o: unknown, n: unknown) => audit({ action: 'update', resource: r, resource_id: id, old_value: o, new_value: n }),
  delete:      (r: string, id: string, d: unknown) => audit({ action: 'delete', resource: r, resource_id: id, old_value: d }),
  export:      (r: string, filters?: unknown)       => audit({ action: 'export', resource: r, meta: { filters } }),
  posSale:     (invoiceId: string, total: number)   => audit({ action: 'pos_sale', resource: 'invoices', resource_id: invoiceId, meta: { total } }),
  refund:      (invoiceId: string, amount: number)  => audit({ action: 'refund',   resource: 'invoices', resource_id: invoiceId, meta: { amount } }),
  zatcaSubmit: (invoiceId: string, status: string)  => audit({ action: 'zatca_submit', resource: 'zatca', resource_id: invoiceId, meta: { status } }),
  stockAdjust: (productId: string, qty: number, reason: string) => audit({ action: 'inventory_adjust', resource: 'inventory', resource_id: productId, meta: { qty, reason } }),
  accountingEntry: (entryId: string, amount: number) => audit({ action: 'accounting_entry', resource: 'accounting', resource_id: entryId, meta: { amount } }),
};
