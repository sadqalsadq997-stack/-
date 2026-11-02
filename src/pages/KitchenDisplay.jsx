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
      .select('id, order_number, daily_order_number, status, items, created_at, source, order_type, table_number, notes')
      .in('status', ['pending', 'preparing'])
      .order('created_at').limit(80);
    const list = data || [];
    const cards = list.flatMap(order => {
      const groups = new Map();
      (order.items || []).forEach(item => {
        const status = item.round_status || order.status;
        if (!['pending', 'preparing'].includes(status)) return;
        const roundId = item.round_id || null;
        const key = roundId || 'legacy';
        if (!groups.has(key)) groups.set(key, {
          order, roundId, roundNumber: item.round_number || 1, status,
          items: [], notes: item.round_notes || order.notes,
          addedAt: item.round_added_at || order.created_at,
        });
        groups.get(key).items.push(item);
      });
      // الطلبات القديمة التي لم تحمل بيانات جولات تبقى ظاهرة كجولة واحدة.
      return [...groups.values()];
    });
    const keys = new Set(cards.map(card => `${card.order.id}:${card.roundId || 'legacy'}`));
    if (known.current && [...keys].some(key => !known.current.has(key)) && soundRef.current) chime();
    known.current = keys;
    setOrders(cards);
    if (list.length) {
      const orderIds = [...new Set(list.map(o => o.id))];
      const { data: pg } = await supabase.from('order_pagers').select('order_id, display_number').in('order_id', orderIds);
      setPagers(Object.fromEntries((pg || []).map(p => [p.order_id, p.display_number])));
    } else setPagers({});
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('kitchen').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const setStatus = async (card, status) => {
    const result = card.order.order_type === 'dine_in'
      ? await supabase.rpc('set_table_order_round_status', {
          p_order_id: card.order.id,
          p_round_id: card.roundId,
          p_status: status,
        })
      : await supabase.from('orders').update({ status }).eq('id', card.order.id);
    if (result.error) { toast.error(result.error.message || 'تعذر تحديث حالة الطلب'); return; }
    if (status === 'ready' && pagers[card.order.id]) {
      toast.success(`تم تجهيز الجولة ${card.roundNumber} · بيجر رقم ${pagers[card.order.id]}`);
    }
    await load();
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
          الطلبات المعتمدة مالياً فقط
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-500">
            <ChefHat className="mx-auto mb-3 h-16 w-16 opacity-20" />
            <p>لا توجد طلبات حالياً</p>
          </div>
        ) : orders.map(card => {
          const o = card.order;
          const pn = pagers[o.id];
          const mins = Math.floor((Date.now() - new Date(card.addedAt || o.created_at)) / 60000);
          return (
            <div key={`${o.id}:${card.roundId || 'legacy'}`} className={`flex flex-col rounded-2xl border-2 bg-slate-800 p-4 ${card.status === 'pending' ? 'border-amber-500' : 'border-sky-500'}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  {pn ? (
                    <p className="flex items-center gap-1.5 text-4xl font-black leading-none text-white"><BellRing className="h-6 w-6 text-amber-400" />{pn}</p>
                  ) : (
                    <p className="text-lg font-black text-white">#{o.daily_order_number ?? o.order_number?.slice(-4) ?? o.id.slice(-4)}</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {o.table_number ? `طاولة ${o.table_number}` : o.order_type === 'dine_in' ? 'محلي' : 'سفري'}
                    {o.table_number && ` · الجولة ${card.roundNumber}`}
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
                {(card.items || []).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-xs font-bold text-white">{qtyOf(item)}×</span>
                    {item.name}
                  </div>
                ))}
                {card.notes && <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">📝 {card.notes}</p>}
              </div>

              <div className="space-y-2">
                {card.status === 'pending' && (
                  <button onClick={() => setStatus(card, 'preparing')} className="h-10 w-full rounded-xl bg-sky-600 text-sm font-bold text-white hover:bg-sky-700">
                    بدء التحضير
                  </button>
                )}
                {card.status === 'preparing' && (
                  <button onClick={() => setStatus(card, 'ready')}
                    className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-base font-black text-white hover:bg-emerald-600">
                    <CheckCircle2 className="h-5 w-5" /> جاهز {pn && <BellRing className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
