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

export async function flushQueue(): Promise<void> {
  try {
    const d = await openDB();
    const tx = d.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all: Record<string, unknown>[] = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej([]);
    });

    for (const op of all) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        if (op.action === 'insert') {
          await sb.from(op.table).insert(op.payload);
        } else if (op.action === 'update') {
          await sb.from(op.table).update(op.payload).eq('id', (op.payload as Record<string,unknown>).id);
        } else if (op.action === 'delete') {
          await sb.from(op.table).delete().eq('id', (op.payload as Record<string,unknown>).id);
        }
        store.delete(op.id as IDBValidKey);
      } catch { /* skip failed ops */ }
    }
  } catch { /* offline */ }
}

export function startSyncListener(onSync?: () => void): () => void {
  const handler = async () => {
    if (navigator.onLine) {
      await flushQueue();
      if (onSync) onSync();
    }
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
