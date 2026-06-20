// ══════════════════════════════════════════════════════════════════
// felsy — إدارة الجلسة الآمنة
// لا يُخزَّن شيء حساس في plaintext
// ══════════════════════════════════════════════════════════════════

import { encryptAES, decryptAES, secureToken } from './crypto';

// مفتاح تشفير الجلسة — يُولَّد مرة في بداية كل tab ويختفي عند الإغلاق
const SESSION_KEY = secureToken(24);

export interface SessionData {
  unlocked: boolean;
  role: string;
  empId: string;
  empName: string;
  perms: Record<string, boolean>;
  branchId: string;
  issuedAt: number;
  expiresAt: number;
}

const SESSION_STORAGE_KEY = '_fs';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ساعات

export async function saveSession(role: string, emp?: any): Promise<void> {
  const data: SessionData = {
    unlocked:  true,
    role,
    empId:     emp?.id ?? '',
    empName:   emp?.name ?? emp?.full_name ?? '',
    perms:     emp?.permissions ?? {},
    branchId:  emp?.branch_id ?? '',
    issuedAt:  Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  try {
    const encrypted = await encryptAES(JSON.stringify(data), SESSION_KEY);
    sessionStorage.setItem(SESSION_STORAGE_KEY, encrypted);
  } catch (err) {
    // إذا فشل التشفير (بيئة غير مدعومة) → fallback آمن برفض الجلسة
    console.error('[Felsy] فشل تشفير الجلسة:', err);
    throw err;
  }
}

export async function loadSession(): Promise<SessionData | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const json = await decryptAES(raw, SESSION_KEY);
    const data: SessionData = JSON.parse(json);
    // التحقق من انتهاء الجلسة
    if (!data.unlocked || Date.now() > data.expiresAt) {
      clearSession();
      return null;
    }
    return data;
  } catch {
    // أي تلاعب بالبيانات → مسح فوري
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  // إزالة بقايا الجلسة القديمة (plaintext) إن وُجدت
  sessionStorage.removeItem('pin_unlocked');
  sessionStorage.removeItem('pin_role');
  sessionStorage.removeItem('pin_employee_id');
  sessionStorage.removeItem('pin_employee_name');
  sessionStorage.removeItem('pin_employee_perms');
  sessionStorage.removeItem('pin_branch_id');
}

// منع الوصول عبر DevTools (console)
export function lockConsole(): void {
  if (import.meta.env.PROD) {
    const noop = () => {};
    (window.console as any) = {
      log: noop, warn: noop, error: noop, info: noop, debug: noop,
      table: noop, trace: noop, dir: noop, group: noop, groupEnd: noop,
    };
  }
}
