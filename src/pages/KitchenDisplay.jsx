import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChefHat, Clock, CheckCircle2, BellRing, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════════════════
// شاشة المطبخ
//  • "جاهز" ⇒ الطلب يصير ready ⇒ البيجر يرن عند العميل تلقائياً
//    (التريجر في القاعدة sync_pager_from_order — بدون تدخل الكاشير)
//  • رقم البيجر ظاهر بخط كبير على كل طلب
//  • تنبيه صوتي عند وصول طلب جديد
// ══════════════════════════════════════════════════════════════════

let ctx;
function chime() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.15);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.16);
    });
  } catch { /* */ }
}

const qtyOf = (it) => it.quantity ?? it.qty ?? 1;

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [pagers, setPagers] = useState({}); // order_id → display_number
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('felsy_kds_sound') !== '0'; } catch { return true; } });
  const known = useRef(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const load = useCallback(async () => {
    const { data } = await supabase.from('orders')
      .select('id, order_number, status, items, created_at, source, order_type, table_number, notes')
      .in('status', ['pending', 'preparing'])
      .order('created_at').limit(80);
    const list = data || [];
    // صوت لطلب جديد (ليس عند أول تحميل)
    const ids = new Set(list.map(o => o.id));
    if (known.current && list.some(o => !known.current.has(o.id)) && soundRef.current) chime();
    known.current = ids;
    setOrders(list);
    if (list.length) {
      const { data: pg } = await supabase.from('order_pagers').select('order_id, display_number').in('order_id', list.map(o => o.id));
      setPagers(Object.fromEntries((pg || []).map(p => [p.order_id, p.display_number])));
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('kitchen').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const setStatus = async (o, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', o.id);
    if (error) { toast.error('تعذر التحديث'); return; }
    if (status === 'ready') {
      setOrders(prev => prev.filter(x => x.id !== o.id));
      if (pagers[o.id]) toast.success(`🔔 رنّ بيجر رقم ${pagers[o.id]} عند العميل`);
    } else setOrders(prev => prev.map(x => (x.id === o.id ? { ...x, status } : x)));
  };

  const toggleSound = () => setSound(v => { try { localStorage.setItem('felsy_kds_sound', v ? '0' : '1'); } catch { /* */ } if (!v) chime(); return !v; });

  return (
    <div className="min-h-screen rounded-2xl bg-slate-900 p-4" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ChefHat className="h-8 w-8 text-amber-400" />
        <h1 className="text-2xl font-black text-white">شاشة المطبخ</h1>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-bold text-amber-400">{orders.length} طلب</span>
        <button onClick={toggleSound} className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white">
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {sound ? 'صوت الطلبات مفعّل' : 'الصوت مقفل'}
        </button>
        <div className="mr-auto flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          "جاهز" يرنّ بيجر العميل تلقائياً
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-500">
            <ChefHat className="mx-auto mb-3 h-16 w-16 opacity-20" />
            <p>لا توجد طلبات حالياً</p>
          </div>
        ) : orders.map(o => {
          const pn = pagers[o.id];
          const mins = Math.floor((Date.now() - new Date(o.created_at)) / 60000);
          return (
            <div key={o.id} className={`flex flex-col rounded-2xl border-2 bg-slate-800 p-4 ${o.status === 'pending' ? 'border-amber-500' : 'border-sky-500'}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  {pn ? (
                    <p className="flex items-center gap-1.5 text-4xl font-black leading-none text-white"><BellRing className="h-6 w-6 text-amber-400" />{pn}</p>
                  ) : (
                    <p className="text-lg font-black text-white">#{o.order_number?.slice(-4) || o.id.slice(-4)}</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {o.table_number ? `طاولة ${o.table_number}` : o.order_type === 'dine_in' ? 'محلي' : 'سفري'}
                    {pn && ` · ${o.order_number?.slice(-4)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`flex items-center gap-1 text-xs ${mins >= 15 ? 'font-bold text-red-400' : 'text-slate-400'}`}>
                    <Clock className="h-3.5 w-3.5" />{mins} د
                  </span>
                  {o.source === 'kiosk' && <span className="flex items-center gap-0.5 rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300"><Smartphone className="h-3 w-3" /> كشك</span>}
                  {o.source === 'online' && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">أونلاين</span>}
                </div>
              </div>

              <div className="mb-4 min-h-[60px] flex-1 space-y-1.5">
                {(o.items || []).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-xs font-bold text-white">{qtyOf(item)}×</span>
                    {item.name}
                  </div>
                ))}
                {o.notes && <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">📝 {o.notes}</p>}
              </div>

              <div className="space-y-2">
                {o.status === 'pending' && (
                  <button onClick={() => setStatus(o, 'preparing')} className="h-10 w-full rounded-xl bg-sky-600 text-sm font-bold text-white hover:bg-sky-700">
                    بدء التحضير
                  </button>
                )}
                <button onClick={() => setStatus(o, 'ready')}
                  className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-base font-black text-white hover:bg-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> جاهز {pn && <BellRing className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
