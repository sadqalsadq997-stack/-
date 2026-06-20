import { useEffect, useState } from 'react';
import { startSyncListener, getPending } from '@/lib/offlineQueue';
import { toast } from 'sonner';

export function useOfflineSync() {
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [pending,   setPending]   = useState(0);
  const [syncing,   setSyncing]   = useState(false);

  useEffect(() => {
    const updateOnline  = () => setIsOnline(true);
    const updateOffline = () => setIsOnline(false);
    window.addEventListener('online',  updateOnline);
    window.addEventListener('offline', updateOffline);

    // عداد العمليات المعلقة
    const refresh = async () => {
      const q = await getPending().catch(() => []);
      setPending(q.length);
    };
    refresh();
    const interval = setInterval(refresh, 30_000);

    // مستمع المزامنة
    const stop = startSyncListener((result) => {
      setSyncing(false);
      setPending(0);
      if (result.synced > 0) {
        toast.success(`✅ تمت مزامنة ${result.synced} عملية بنجاح`);
      }
    });

    return () => {
      window.removeEventListener('online',  updateOnline);
      window.removeEventListener('offline', updateOffline);
      clearInterval(interval);
      stop();
    };
  }, []);

  return { isOnline, pending, syncing };
}
