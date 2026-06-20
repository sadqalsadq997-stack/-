import React from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function OfflineIndicator() {
  const { isOnline, pending } = useOfflineSync();

  if (isOnline && pending === 0) return null;

  return (
    <div className={cn(
      'fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shadow-lg border transition-all',
      isOnline
        ? 'bg-amber-500/10 text-amber-700 border-amber-500/30'
        : 'bg-red-500/10 text-red-700 border-red-500/30'
    )}>
      {isOnline
        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> مزامنة {pending} عملية...</>
        : <><WifiOff className="w-3.5 h-3.5" /> وضع بدون إنترنت — البيانات محفوظة محلياً</>}
    </div>
  );
}
