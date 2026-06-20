/**
 * src/pages/KitchenDisplay.jsx  (نسخة محدّثة)
 *
 * التغييرات عن النسخة الأصلية:
 *  - زر "جاهز" يغيّر status → 'ready'
 *  - KioskOrderFlow يستمع على هذا التغيير ويطلق البيجر تلقائياً
 *  - عرض مميز لطلبات الكشك
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChefHat, Clock, CheckCircle2, Bell, Smartphone } from 'lucide-react';
import { KioskOrderFlow } from '@/lib/kioskOrderFlow';
import { toast } from 'sonner';

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const flowRef   = useRef(null);
  const serialRef = useRef(null); // Web Serial port

  // ── تهيئة KioskOrderFlow مع دالة رنين البيجر ──────────────
  useEffect(() => {
    // دالة رنين تستخدم منفذ USB المفتوح مسبقاً (إن وُجد)
    const ringFn = async (pagerNumber) => {
      const port = serialRef.current;
      if (!port?.writable) {
        toast.warning('⚠️ البيجر غير متصل');
        return false;
      }
      try {
        const writer = port.writable.getWriter();
        await writer.write(new Uint8Array([0xFF, pagerNumber & 0xFF, 0x00]));
        writer.releaseLock();
        toast.success(`🔔 تم إرسال إشارة للبيجر رقم ${pagerNumber}`);
        return true;
      } catch (e) {
        toast.error(`فشل البيجر: ${e.message}`);
        return false;
      }
    };

    flowRef.current = new KioskOrderFlow(supabase, ringFn).startListening();
    return () => flowRef.current?.destroy();
  }, []);

  // ── تحميل الطلبات المعلّقة ─────────────────────────────────
  useEffect(() => {
    const fetch = () =>
      supabase.from('orders')
        .select('*')
        .in('status', ['pending', 'preparing'])
        .order('created_at')
        .then(({ data }) => setOrders(data || []));

    fetch();

    const ch = supabase.channel('kitchen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetch)
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  // ── "جاهز" → تغيير الحالة (KioskOrderFlow يطلق البيجر) ────
  const markReady = async (id) => {
    await supabase.from('orders').update({ status: 'ready' }).eq('id', id);
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  // ── "بدء التحضير" ──────────────────────────────────────────
  const markPreparing = async (id) => {
    await supabase.from('orders').update({ status: 'preparing' }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'preparing' } : o));
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <ChefHat className="w-8 h-8 text-amber-400" />
        <h1 className="text-2xl font-black text-white">شاشة المطبخ</h1>
        <span className="bg-amber-500/20 text-amber-400 rounded-full px-3 py-1 text-sm font-bold">
          {orders.length} طلب
        </span>
        <div className="mr-auto flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          البيجر يعمل تلقائياً عند الضغط على "جاهز"
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-full text-center py-20 text-slate-500">
            <ChefHat className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p>لا توجد طلبات حالياً</p>
          </div>
        ) : orders.map(o => (
          <div
            key={o.id}
            className={`bg-slate-800 border-2 rounded-2xl p-4 flex flex-col ${
              o.status === 'pending'   ? 'border-amber-500' :
              o.status === 'preparing' ? 'border-blue-500'  : 'border-emerald-500'
            }`}
          >
            {/* رأس البطاقة */}
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-white text-lg">
                #{o.order_number?.slice(-4) || o.id?.slice(-4)}
              </span>
              <div className="flex items-center gap-2">
                {/* شارة الكشك */}
                {o.source === 'kiosk' && (
                  <span className="flex items-center gap-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full px-2 py-0.5">
                    <Smartphone className="w-3 h-3" /> كشك
                  </span>
                )}
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(o.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* قائمة الأصناف */}
            <div className="space-y-1.5 mb-4 min-h-[60px] flex-1">
              {(o.items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="bg-slate-700 text-white rounded-md px-1.5 py-0.5 text-xs font-bold">
                    {item.qty}×
                  </span>
                  {item.name}
                </div>
              ))}
            </div>

            {/* أزرار العمل */}
            <div className="space-y-2">
              {o.status === 'pending' && (
                <button
                  onClick={() => markPreparing(o.id)}
                  className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors"
                >
                  بدء التحضير
                </button>
              )}
              <button
                onClick={() => markReady(o.id)}
                className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                جاهز
                {o.source === 'kiosk' && <Bell className="w-3.5 h-3.5 mr-1" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
