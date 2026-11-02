import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadSession } from '@/lib/security/session';
import { ChefHat, Clock, CheckCircle2, BellRing, Volume2, VolumeX, UserRound, Layers3 } from 'lucide-react';
import { toast } from 'sonner';

let ctx;
function chime() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.15);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.16);
    });
  } catch { /* الصوت اختياري */ }
}

const qtyOf = item => item.quantity ?? item.qty ?? 1;
const canManageAll = session => !session?.empId || ['admin','owner','manager','branch_manager'].includes(session.role);

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [pagers, setPagers] = useState({});
  const [session, setSession] = useState(null);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('felsy_kds_sound') !== '0'; } catch { return true; } });
  const known = useRef(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => { loadSession().then(setSession).catch(() => setSession(null)); }, []);

  const load = useCallback(async () => {
    const { data: taskRows, error: taskError } = await supabase.from('kitchen_tasks')
      .select('*').in('status', ['pending','preparing']).order('created_at').limit(150);
    if (taskError) {
      toast.error('تعذر تحميل مهام المطبخ: ' + taskError.message);
      return;
    }

    const tasks = taskRows || [];
    const orderIds = [...new Set(tasks.map(task => task.order_id))];
    const sectionIds = [...new Set(tasks.map(task => task.section_id))];
    const employeeIds = [...new Set(tasks.map(task => task.assigned_employee_id).filter(Boolean))];

    const [orderResult, sectionResult, employeeResult] = await Promise.all([
      orderIds.length ? supabase.from('orders').select('id,order_number,status,created_at,source,order_type,table_number,notes,items').in('id',orderIds) : Promise.resolve({data:[]}),
      sectionIds.length ? supabase.from('kitchen_sections').select('id,name,assigned_employee_id').in('id',sectionIds) : Promise.resolve({data:[]}),
      employeeIds.length ? supabase.from('employee_profiles').select('id,name,full_name').in('id',employeeIds) : Promise.resolve({data:[]}),
    ]);
    const orderMap = Object.fromEntries((orderResult.data || []).map(order => [order.id,order]));
    const sectionMap = Object.fromEntries((sectionResult.data || []).map(section => [section.id,section]));
    const employeeMap = Object.fromEntries((employeeResult.data || []).map(employee => [employee.id,employee]));

    const cards = tasks.map(task => ({
      taskId: task.id,
      order: orderMap[task.order_id],
      roundId: task.round_id,
      roundNumber: task.round_number || 1,
      status: task.status,
      items: task.items || [],
      notes: task.notes,
      addedAt: task.assigned_at || task.created_at,
      sectionId: task.section_id,
      sectionName: sectionMap[task.section_id]?.name || 'المطبخ',
      assignedEmployeeId: task.assigned_employee_id,
      assignedEmployeeName: employeeMap[task.assigned_employee_id]?.full_name || employeeMap[task.assigned_employee_id]?.name || null,
    })).filter(card => card.order);

    // الطلبات القديمة التي لم تُنشأ لها مهام أقسام تبقى ظاهرة حتى تنتهي.
    const { data: legacyOrders } = await supabase.from('orders')
      .select('id,order_number,status,items,created_at,source,order_type,table_number,notes')
      .in('status',['pending','preparing']).order('created_at').limit(80);
    const taskOrderIds = new Set(tasks.map(task => task.order_id));
    (legacyOrders || []).filter(order => !taskOrderIds.has(order.id)).forEach(order => {
      const groups = new Map();
      (order.items || []).forEach(item => {
        const status = item.round_status || order.status;
        if (!['pending','preparing'].includes(status)) return;
        const roundId = item.round_id || null;
        const key = roundId || 'legacy';
        if (!groups.has(key)) groups.set(key,{taskId:null,order,roundId,roundNumber:item.round_number||1,status,items:[],notes:item.round_notes||order.notes,addedAt:item.round_added_at||order.created_at,sectionName:'عام',assignedEmployeeId:null,assignedEmployeeName:null});
        groups.get(key).items.push(item);
      });
      cards.push(...groups.values());
    });

    const visibleCards = cards.filter(card =>
      canManageAll(session) || !card.assignedEmployeeId || card.assignedEmployeeId === session?.empId
    );
    const keys = new Set(visibleCards.map(card => card.taskId || `${card.order.id}:${card.roundId || 'legacy'}`));
    if (known.current && [...keys].some(key => !known.current.has(key)) && soundRef.current) chime();
    known.current = keys;
    setOrders(visibleCards);

    if (orderIds.length) {
      const { data: pg } = await supabase.from('order_pagers').select('order_id,display_number').in('order_id',orderIds);
      setPagers(Object.fromEntries((pg || []).map(p => [p.order_id,p.display_number])));
    } else setPagers({});
  }, [session]);

  useEffect(() => {
    load();
    const channel = supabase.channel('kitchen-tasks-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'kitchen_tasks'},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'kitchen_sections'},load)
      .subscribe();
    const timer = setInterval(load,10000);
    return () => { supabase.removeChannel(channel); clearInterval(timer); };
  }, [load]);

  const setStatus = async (card,status) => {
    let result;
    if (card.taskId) {
      result = await supabase.rpc('set_kitchen_task_status',{
        p_task_id:card.taskId,p_status:status,p_employee_id:session?.empId || null,
      });
    } else if (card.order.order_type === 'dine_in') {
      result = await supabase.rpc('set_table_order_round_status',{
        p_order_id:card.order.id,p_round_id:card.roundId,p_status:status,
      });
    } else {
      result = await supabase.from('orders').update({status}).eq('id',card.order.id);
    }
    if (result.error) { toast.error(result.error.message || 'تعذر تحديث حالة المهمة'); return; }
    if (status === 'ready' && pagers[card.order.id]) {
      toast.success(`تم تجهيز الجولة ${card.roundNumber} · بيجر رقم ${pagers[card.order.id]}`);
    } else if (status === 'ready') {
      toast.success(`تم إنجاز قسم ${card.sectionName}`);
    }
    await load();
  };

  const toggleSound = () => setSound(value => {
    try { localStorage.setItem('felsy_kds_sound',value?'0':'1'); } catch { /* */ }
    if (!value) chime();
    return !value;
  });

  return (
    <div className="min-h-screen rounded-2xl bg-slate-900 p-4" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ChefHat className="h-8 w-8 text-amber-400" />
        <h1 className="text-2xl font-black text-white">شاشة المطبخ</h1>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-bold text-amber-400">{orders.length} مهمة</span>
        {session?.empName && <span className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"><UserRound className="h-3.5 w-3.5" />{session.empName}</span>}
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
            <p>لا توجد مهام حالياً</p>
          </div>
        ) : orders.map(card => {
          const order = card.order;
          const pager = pagers[order.id];
          const minutes = Math.floor((Date.now()-new Date(card.addedAt||order.created_at))/60000);
          return (
            <article key={card.taskId || `${order.id}:${card.roundId||'legacy'}`}
              className={`flex flex-col rounded-2xl border-2 bg-slate-800 p-4 ${card.status==='pending'?'border-amber-500':'border-sky-500'}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  {pager ? <p className="flex items-center gap-1.5 text-4xl font-black leading-none text-white"><BellRing className="h-6 w-6 text-amber-400" />{pager}</p>
                    : <p className="text-lg font-black text-white">#{order.order_number?.slice(-4)||order.id.slice(-4)}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {order.table_number ? `طاولة ${order.table_number}` : order.order_type==='dine_in'?'محلي':'سفري'}
                    {order.table_number && ` · الجولة ${card.roundNumber}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`flex items-center gap-1 text-xs ${minutes>=15?'font-bold text-red-400':'text-slate-400'}`}><Clock className="h-3.5 w-3.5" />{minutes} د</span>
                  <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-200"><Layers3 className="h-3 w-3" />{card.sectionName}</span>
                </div>
              </div>
              {card.assignedEmployeeName && <p className="mb-2 flex items-center gap-1 text-[11px] text-amber-300"><UserRound className="h-3 w-3" />مسند إلى: {card.assignedEmployeeName}</p>}
              <div className="mb-4 min-h-[60px] flex-1 space-y-1.5">
                {(card.items||[]).map((item,index)=>(
                  <div key={index} className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-xs font-bold text-white">{qtyOf(item)}×</span>
                    {item.name_ar || item.name}
                  </div>
                ))}
                {card.notes && <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">ملاحظة: {card.notes}</p>}
              </div>
              <div className="space-y-2">
                {card.status==='pending' && <button onClick={()=>setStatus(card,'preparing')} className="h-10 w-full rounded-xl bg-sky-600 text-sm font-bold text-white hover:bg-sky-700">بدء التحضير</button>}
                {card.status==='preparing' && <button onClick={()=>setStatus(card,'ready')} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-base font-black text-white hover:bg-emerald-600"><CheckCircle2 className="h-5 w-5" />جاهز {pager&&<BellRing className="h-4 w-4" />}</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
