// ══════════════════════════════════════════════════════════════════
// felsy — حماية الخصوصية وتنظيف البيانات
// ══════════════════════════════════════════════════════════════════

// ── 1. تنظيف البيانات الحساسة من الذاكرة عند الخروج ─────────────
export function setupPrivacyCleanup(): void {
  // مسح عند إغلاق التبويب
  window.addEventListener('beforeunload', () => {
    sessionStorage.clear();
  });

  // مسح عند انتهاء الجلسة (visibility API)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // لا نمسح — فقط نسجّل آخر نشاط
      sessionStorage.setItem('_last_active', Date.now().toString());
    }
  });
}

// ── 2. auto-lock بعد فترة خمول ──────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 دقيقة
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lockCallback: (() => void) | null = null;

export function setupIdleLock(onLock: () => void): void {
  lockCallback = onLock;
  resetIdleTimer();
  ['mousemove','keydown','click','touchstart','scroll'].forEach(evt =>
    document.addEventListener(evt, resetIdleTimer, { passive: true })
  );
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    sessionStorage.clear();
    lockCallback?.();
  }, IDLE_TIMEOUT_MS);
}

export function clearIdleLock(): void {
  if (idleTimer) clearTimeout(idleTimer);
  lockCallback = null;
}

// ── 3. إخفاء الشاشة عند الضغط على screenshot (iOS/Android) ─────
export function setupScreenProtection(): void {
  // iOS screenshot detection (limited)
  document.addEventListener('visibilitychange', () => {
    const overlay = document.getElementById('_privacy_overlay');
    if (overlay) overlay.style.display = document.hidden ? 'flex' : 'none';
  });
}

export function injectPrivacyOverlay(): void {
  if (document.getElementById('_privacy_overlay')) return;
  const el = document.createElement('div');
  el.id = '_privacy_overlay';
  el.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:99999',
    'background:#000', 'align-items:center', 'justify-content:center',
    'color:#fff', 'font-size:24px', 'font-family:sans-serif',
  ].join(';');
  el.textContent = '🔒 محمي';
  document.body.appendChild(el);
}

// ── 4. تنقية المدخلات من XSS ────────────────────────────────────
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ── 5. إخفاء جزئي للبيانات الحساسة في الواجهة ───────────────────
export const privacy = {
  phone: (p: string) => p ? p.slice(0, 4) + '****' + p.slice(-2) : '—',
  vat:   (v: string) => v ? v.slice(0, 6) + '***' + v.slice(-3) : '—',
  name:  (n: string) => {
    const parts = n?.split(' ');
    return parts?.length > 1 ? parts[0] + ' ' + parts[1][0] + '.' : n;
  },
  email: (e: string) => {
    if (!e) return '—';
    const [u, d] = e.split('@');
    return u.slice(0,2) + '***@' + d;
  },
};

// ── 6. منع الـ autocomplete على الحقول الحساسة ──────────────────
export function disableAutocomplete(formEl: HTMLElement): void {
  formEl.querySelectorAll('input').forEach(inp => {
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('spellcheck', 'false');
  });
}

// ── 7. تسجيل عمليات حساسة (Audit Log) ──────────────────────────
interface AuditEntry {
  action: string;
  userId?: string;
  branchId?: string;
  meta?: Record<string, unknown>;
  ts: number;
}

const auditBuffer: AuditEntry[] = [];

export function auditLog(action: string, meta?: Record<string, unknown>): void {
  auditBuffer.push({ action, meta, ts: Date.now() });
  // في production يُرسَل لـ Supabase
  if (auditBuffer.length >= 10 || import.meta.env.PROD) {
    flushAudit();
  }
}

async function flushAudit(): Promise<void> {
  if (!auditBuffer.length) return;
  const batch = auditBuffer.splice(0);
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('audit_log').insert(batch);
  } catch { /* silent */ }
}
