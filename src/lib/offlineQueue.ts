// ══════════════════════════════════════════════════════
// طابور المزامنة عبر الإنترنت — IndexedDB
// ══════════════════════════════════════════════════════
import { supabase } from '@/integrations/supabase/client';

const DB_NAME    = 'felsy_offline';
const STORE_NAME = 'pending_ops';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = (e.target as IDBOpenDBRequest).result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { db = (e.target as IDBOpenDBRequest).result; resolve(db!); };
    req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

export async function enqueue(op: { table: string; action: string; payload: any }): Promise<void> {
  try {
    const d = await openDB();
    const tx = d.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ ...op, timestamp: Date.now() });
  } catch { /* fail silently offline */ }
}

export async function getPending(): Promise<number> {
  try {
    const d = await openDB();
    return await new Promise((resolve, reject) => {
      const tx  = d.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(0);
    });
  } catch { return 0; }
}

// يرجع عدد العمليات اللي تمت مزامنتها
export async function flushQueue(): Promise<number> {
  let synced = 0;
  try {
    const d = await openDB();
    // 1) قراءة كل العمليات في معاملة واحدة (المعاملة تنتهي قبل أي طلب شبكة)
    const all: Record<string, unknown>[] = await new Promise((res) => {
      const req = d.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => res([]);
    });

    for (const op of all) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const payload = op.payload as Record<string, unknown>;
      let res: { error?: unknown } | null = null;
      if (op.action === 'insert')      res = await sb.from(op.table).insert(payload);
      else if (op.action === 'update') res = await sb.from(op.table).update(payload).eq('id', payload.id);
      else if (op.action === 'delete') res = await sb.from(op.table).delete().eq('id', payload.id);
      if (!res || res.error) continue; // تبقى في الطابور وتُعاد لاحقاً

      // 2) حذف العملية بعد نجاحها فقط — في معاملة جديدة (يمنع تكرار الإدخال)
      await new Promise<void>((resolve) => {
        const tx = d.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(op.id as IDBValidKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      synced++;
    }
  } catch { /* offline */ }
  return synced;
}

export function startSyncListener(onSync?: (r: { synced: number }) => void): () => void {
  const handler = async () => {
    if (navigator.onLine) {
      const synced = await flushQueue();
      if (onSync) onSync({ synced });
    }
  };
  window.addEventListener('online', handler);
  if (navigator.onLine) setTimeout(handler, 3000); // مزامنة المتبقي عند فتح التطبيق
  return () => window.removeEventListener('online', handler);
}
