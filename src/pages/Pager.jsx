import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BellRing, Plus, QrCode, Check, X, Loader2, Eye, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PagerTicketDialog, printPagerTicket } from '@/components/pager/PagerTicket';

// ══════════════════════════════════════════════════════════════════
// البيجر الإلكتروني — شاشة الموظف
// ══════════════════════════════════════════════════════════════════

const COLUMNS = [
  { key: 'waiting', title: 'بانتظار التحضير', tone: 'bg-amber-50 border-amber-200' },
  { key: 'preparing', title: 'قيد التحضير', tone: 'bg-blue-50 border-blue-200' },
  { key: 'ready', title: 'جاهز — العميل يتم تنبيهه', tone: 'bg-emerald-50 border-emerald-200' },
];

function minutesSince(d) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? 'الآن' : `قبل ${m} د`;
}

export default function Pager() {
  const [pagers, setPagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [show, setShow] = useState(null);
  const [business, setBusiness] = useState('');
  const [, tick] = useState(0);

  const branchId = (() => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}').id || null; } catch { return null; } })();

  async function load() {
    const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('order_pagers').select('*')
      .gte('created_at', since).in('status', ['waiting', 'preparing', 'ready'])
      .order('created_at', { ascending: true });
    if (error) toast.error('تعذر تحميل البيجرات — تأكد من تشغيل ملف 020 في قاعدة البيانات');
    setPagers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    supabase.rpc('my_billing_status').then(({ data }) => setBusiness((Array.isArray(data) ? data[0] : data)?.tenant_name || ''));
    const ch = supabase.channel('pagers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_pagers' }, () => load())
      .subscribe();
    const t = setInterval(() => tick(x => x + 1), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  async function create(e) {
    e?.preventDefault();
    setCreating(true);
    const { data, error } = await supabase.rpc('create_pager', { p_order_id: null, p_branch_id: branchId, p_label: label || null });
    setCreating(false);
    if (error) return toast.error(error.message);
    setLabel('');
    setShow(data);
    load();
  }

  async function setStatus(p, status) {
    setPagers(list => list.map(x => (x.id === p.id ? { ...x, status } : x)).filter(x => !['collected', 'cancelled'].includes(x.status)));
    const { error } = await supabase.from('order_pagers').update({ status }).eq('id', p.id);
    if (error) { toast.error(error.message); load(); return; }
    if (status === 'ready') toast.success(`تم تنبيه العميل — طلب ${p.display_number}`);
  }

  const grouped = useMemo(() => Object.fromEntries(COLUMNS.map(c => [c.key, pagers.filter(p => p.status === c.key)])), [pagers]);

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><BellRing className="h-6 w-6 text-primary" /> البيجر الإلكتروني</h1>
          <p className="mt-1 text-sm text-muted-foreground">العميل يمسح الباركود، وأول ما تضغط "جاهز" يرن جواله ويوصله إشعار.</p>
        </div>
        <form onSubmit={create} className="flex gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={40} placeholder="اسم العميل (اختياري)"
            className="h-11 w-48 rounded-xl border border-border bg-card px-3 text-sm focus:border-primary focus:outline-none" />
          <button disabled={creating} className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} بيجر جديد
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map(col => (
            <section key={col.key} className={`rounded-2xl border p-3 ${col.tone} dark:bg-card`}>
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-bold">
                {col.title}<span className="rounded-full bg-white/70 px-2 py-0.5 text-xs dark:bg-muted">{grouped[col.key].length}</span>
              </h2>
              <div className="space-y-2">
                {grouped[col.key].length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">لا يوجد</p>}
                {grouped[col.key].map(p => (
                  <article key={p.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-3xl font-black leading-none">{p.display_number}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{p.label || 'بدون اسم'} · {minutesSince(p.created_at)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setShow(p)} title="عرض الباركود" className="rounded-lg p-2 hover:bg-muted"><QrCode className="h-4 w-4" /></button>
                        <button onClick={() => printPagerTicket(p, business)} title="طباعة" className="rounded-lg p-2 hover:bg-muted"><Printer className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {p.status === 'ready' && (
                      <p className={`mt-2 flex items-center gap-1 text-xs font-bold ${p.acknowledged_at ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <Eye className="h-3.5 w-3.5" /> {p.acknowledged_at ? 'العميل شاف التنبيه' : 'الجوال يرن الآن...'}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      {p.status === 'waiting' && <button onClick={() => setStatus(p, 'preparing')} className="h-9 rounded-lg bg-blue-600 text-sm font-bold text-white">بدأ التحضير</button>}
                      {p.status === 'preparing' && <button onClick={() => setStatus(p, 'ready')} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-bold text-white"><BellRing className="h-4 w-4" /> جاهز — نبّه العميل</button>}
                      {p.status === 'ready' && <button onClick={() => setStatus(p, 'collected')} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-800 text-sm font-bold text-white"><Check className="h-4 w-4" /> تم الاستلام</button>}
                      <button onClick={() => setStatus(p, 'cancelled')} title="إلغاء" className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    </div>
                    {p.status === 'waiting' && (
                      <button onClick={() => setStatus(p, 'ready')} className="mt-2 w-full text-xs font-bold text-emerald-700 hover:underline">جاهز مباشرة</button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PagerTicketDialog pager={show} businessName={business} onClose={() => setShow(null)} />
    </div>
  );
}
