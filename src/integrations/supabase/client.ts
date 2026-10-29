import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ══════════════════════════════════════════════════════════════════
// الاتصال بقاعدة البيانات يمر من وكيل الموقع نفسه (/api/db)
// → رابط Supabase ومفتاحه غير موجودين في كود المتصفح إطلاقاً.
// المفتاح الحقيقي يضيفه الوكيل في السيرفر (api/db.js).
// ══════════════════════════════════════════════════════════════════

const PROXY_PATH = '/api/db';
const SITE = 'https://felsy.org';

const baseUrl = typeof window !== 'undefined'
  ? `${window.location.origin}${PROXY_PATH}`
  : `${SITE}${PROXY_PATH}`;

// يبقى للتوافق مع الصفحات القديمة — الإعداد صار في السيرفر
export const isMissingEnv = false;

const client = createClient<Database>(baseUrl, 'felsy-public', {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'felsy-auth',
    persistSession: true,
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 0 } },
});

// ══════════════════════════════════════════════════════════════════
// التحديث اللحظي عبر "سحب دوري" بدل WebSocket
// (الـ WebSocket يحتاج رابط Supabase المباشر — وهذا اللي نخفيه)
// الواجهة نفسها: supabase.channel(name).on('postgres_changes', cfg, cb).subscribe()
// ══════════════════════════════════════════════════════════════════
type ChangeCfg = { event?: string; schema?: string; table: string; filter?: string };
type Listener = { cfg: ChangeCfg; cb: (payload: any) => void; seen: Map<string, string> | null };

// فحص خفيف: نجيب (id + وقت آخر تعديل) فقط — بضع بايتات بدل صفوف كاملة.
// الصفوف الكاملة تُجلب فقط للسجلات اللي تغيرت فعلاً.
// الإيقاع: كل 4 ثوانٍ أثناء النشاط، ويتباطأ تدريجياً لين 15 ثانية إذا ما فيه تغييرات،
// ويتوقف تماماً والصفحة مخفية ⇒ ضغط أقل بكثير على القاعدة مع آلاف المنشآت.
const POLL_MIN = 4000;
const POLL_MAX = 15000;
const VERSION_COL: Record<string, string> = { orders: 'updated_at', order_pagers: 'updated_at' };

class PollingChannel {
  private listeners: Listener[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private delay = POLL_MIN;
  private stopped = false;
  private onVisible = () => { if (document.visibilityState === 'visible') { this.delay = POLL_MIN; this.poll(); } };

  constructor(public topic: string) {}

  on(_type: string, cfg: ChangeCfg, cb: (payload: any) => void) {
    if (cfg?.table) this.listeners.push({ cfg, cb, seen: null });
    return this;
  }

  subscribe(statusCb?: (status: string) => void) {
    if (typeof window === 'undefined') return this;
    this.stopped = false;
    this.loop();
    document.addEventListener('visibilitychange', this.onVisible);
    statusCb?.('SUBSCRIBED');
    return this;
  }

  unsubscribe() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    return Promise.resolve('ok');
  }

  private async loop() {
    if (this.stopped) return;
    if (document.visibilityState === 'visible') {
      const changed = await this.poll();
      this.delay = changed ? POLL_MIN : Math.min(POLL_MAX, Math.round(this.delay * 1.25));
    }
    if (!this.stopped) this.timer = setTimeout(() => this.loop(), this.delay);
  }

  private async poll(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    let changed = false;
    try {
      for (const l of this.listeners) changed = (await this.pollOne(l)) || changed;
    } finally {
      this.busy = false;
    }
    return changed;
  }

  private async pollOne(l: Listener): Promise<boolean> {
    const ver = VERSION_COL[l.cfg.table] || 'created_at';
    const m = /^([a-z_]+)=eq\.(.+)$/i.exec(l.cfg.filter || '');
    const base = () => {
      let q: any = (client as any).from(l.cfg.table);
      return q;
    };
    let probe: any = base().select(`id, ${ver}`);
    if (m) probe = probe.eq(m[1], m[2]);
    const { data, error } = await probe.order(ver, { ascending: false }).limit(60);
    if (error || !Array.isArray(data)) return false;

    const next = new Map<string, string>();
    for (const row of data) next.set(String(row.id), String(row[ver]));
    const first = l.seen === null;
    const changedIds = first ? [] : [...next].filter(([id, v]) => l.seen!.get(id) !== v).map(([id]) => id);
    const prev = l.seen;
    l.seen = next;
    if (first || changedIds.length === 0) return false;

    const { data: rows } = await base().select('*').in('id', changedIds.slice(0, 60));
    const want = (l.cfg.event || '*').toUpperCase();
    for (const row of (rows || []).reverse()) {
      const type = prev!.has(String(row.id)) ? 'UPDATE' : 'INSERT';
      if (want === '*' || want === type) {
        l.cb({ eventType: type, schema: 'public', table: l.cfg.table, new: row, old: {} });
      }
    }
    return true;
  }
}

const channels = new Set<PollingChannel>();
(client as any).channel = (topic: string) => {
  const ch = new PollingChannel(topic);
  channels.add(ch);
  return ch;
};
(client as any).removeChannel = (ch: PollingChannel) => {
  channels.delete(ch);
  return ch?.unsubscribe?.() ?? Promise.resolve('ok');
};
(client as any).removeAllChannels = () => {
  channels.forEach((c) => c.unsubscribe());
  channels.clear();
  return Promise.resolve([]);
};

export const supabase = client;

// ══════════════════════════════════════════════════════════════════
// معرّف الجهاز — عشوائي، محفوظ محلياً، يُستخدم لحد المحاولات (10 لكل جهاز)
// ══════════════════════════════════════════════════════════════════
export function getDeviceId(): string {
  const KEY = 'felsy_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'no-storage-device';
  }
}
