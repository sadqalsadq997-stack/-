import React, { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Loader2, KeyRound, Link2, Copy, Check, MessageCircle, X, Eye, EyeOff, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════════════════
// المشتركين — لوحة المالك
// كلمات المرور مخزّنة مشفّرة (bcrypt) ولا يمكن لأحد قراءتها — حتى المالك.
// المتاح: تعيين كلمة مرور جديدة وإرسالها للعميل، أو رابط استعادة يغيّرها بنفسه.
// ══════════════════════════════════════════════════════════════════

const PAGE = 50;
const STATUS = {
  active: ['فعّال', 'bg-emerald-100 text-emerald-700'], trialing: ['تجريبي', 'bg-sky-100 text-sky-700'],
  past_due: ['متأخر', 'bg-amber-100 text-amber-700'], suspended: ['موقوف', 'bg-red-100 text-red-700'],
  cancelled: ['ملغي', 'bg-gray-100 text-gray-600'], none: ['بدون اشتراك', 'bg-gray-100 text-gray-500'],
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtSAR = (n) => `${Number(n || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ⃁`;
const intlPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '966');

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(r, x => a[x % a.length]).join('');
}

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title="نسخ" onClick={async () => { try { await navigator.clipboard.writeText(String(value)); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* */ } }}
      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">{ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
  );
}

export default function SubscribersTab({ api }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [res, setRes] = useState({ rows: [], total: 0, stats: null });
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  const load = useCallback(async (search = q, pg = page) => {
    setLoading(true);
    try { setRes(await api('list_subscribers', { search, limit: PAGE, offset: pg * PAGE }) || { rows: [], total: 0 }); }
    catch (e) { toast.error(e.message); }
    setLoading(false);
  }, [api, q, page]);

  useEffect(() => { load(); }, []); // eslint-disable-line
  // بحث بعد التوقف عن الكتابة
  useEffect(() => { const t = setTimeout(() => { setPage(0); load(q, 0); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line

  const s = res.stats;
  const pages = Math.max(1, Math.ceil((res.total || 0) / PAGE));

  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['كل المنشآت', s.tenants], ['اشتراك فعّال', s.active], ['ينتهي خلال 7 أيام', s.expiring_7d], ['ألغوا التجديد', s.cancelling], ['مشتركين جدد (30 يوم)', s.new_30d]].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-2xl font-black text-gray-900">{Number(v || 0).toLocaleString('ar-SA')}</p>
              <p className="text-xs text-gray-500">{l}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث برقم الحساب، الاسم، البريد أو الجوال"
              className="h-10 w-full rounded-xl border border-gray-300 bg-gray-50 pl-3 pr-9 text-sm text-gray-900 focus:border-gray-500 focus:outline-none" />
          </div>
          <span className="text-xs text-gray-500">{(res.total || 0).toLocaleString('ar-SA')} نتيجة</span>
          <button onClick={() => load()} className="rounded-xl p-2 hover:bg-gray-100" aria-label="تحديث"><RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              {['رقم الحساب', 'المنشأة', 'البريد', 'الجوال', 'الباقة', 'الفروع', 'الحالة', 'ينتهي', 'المدفوع', ''].map(h => <th key={h} className="px-3 py-2.5 text-right font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {res.rows.map(r => {
                const live = r.status && ['active', 'trialing'].includes(r.status) && new Date(r.current_period_end) > new Date();
                const [label, cls] = STATUS[live ? r.status : (r.status === 'active' ? 'cancelled' : (r.status || 'none'))] || STATUS.none;
                return (
                  <tr key={r.id} className="border-b border-gray-100 text-gray-800 hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono font-bold" dir="ltr"><span className="flex items-center gap-1">{r.account_number}<CopyBtn value={r.account_number} /></span></td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 font-bold">{r.name}</td>
                    <td className="px-3 py-2.5" dir="ltr"><span className="flex items-center gap-1 text-xs">{r.email || '—'}{r.email && <CopyBtn value={r.email} />}</span></td>
                    <td className="px-3 py-2.5 text-xs" dir="ltr">{r.contact_phone || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{r.plan_name || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{r.branches}{r.max_branches && r.max_branches < 999 ? ` / ${r.max_branches}` : ''}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>{r.cancel_at_period_end && <span className="mr-1 text-[10px] text-amber-600">ألغى التجديد</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtDate(r.current_period_end)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold">{fmtSAR(r.paid_total)}</td>
                    <td className="px-3 py-2.5"><button onClick={() => setSel(r)} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white">إدارة</button></td>
                  </tr>
                );
              })}
              {!loading && res.rows.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-gray-400">لا توجد نتائج</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-gray-200 p-3 text-sm text-gray-600">
            <button disabled={page === 0} onClick={() => { setPage(page - 1); load(q, page - 1); }} className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            صفحة {page + 1} من {pages}
            <button disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); load(q, page + 1); }} className="rounded-lg p-1.5 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {sel && <ManageDialog row={sel} api={api} onClose={() => setSel(null)} onChanged={() => load()} />}
    </div>
  );
}

function ManageDialog({ row, api, onClose, onChanged }) {
  const [pw, setPw] = useState(genPassword);
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [end, setEnd] = useState(row.current_period_end ? row.current_period_end.slice(0, 10) : '');
  const phone = intlPhone(row.contact_phone);

  async function setPassword() {
    setBusy('pw');
    try {
      await api('set_owner_password', { user_id: row.owner_id, password: pw });
      setDoneMsg(`السلام عليكم، هذي بيانات دخولك لنظام فلسي:\nرقم الحساب: ${row.account_number}\nالبريد: ${row.email}\nكلمة المرور الجديدة: ${pw}\nالدخول: https://felsy.org/auth/login\nننصحك تغيّرها بعد الدخول.`);
      toast.success('تم تعيين كلمة المرور الجديدة');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  }
  async function makeLink() {
    setBusy('link');
    try {
      const d = await api('recovery_link', { email: row.email });
      setLink(d.link);
      setDoneMsg(`السلام عليكم، هذا رابط تعيين كلمة مرور جديدة لحسابك في فلسي (رقم الحساب ${row.account_number}):\n${d.link}\nالرابط يُستخدم مرة وحدة.`);
    } catch (e) { toast.error(e.message); }
    setBusy('');
  }
  async function saveEnd() {
    setBusy('end');
    try { await api('set_tenant_period', { tenant_id: row.id, period_end: end }); toast.success('تم تحديث تاريخ الانتهاء'); onChanged(); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div dir="rtl" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-black">{row.name}</h3>
            <p className="text-xs text-gray-500">رقم الحساب <b dir="ltr" className="font-mono">{row.account_number}</b> · {row.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
          🔒 كلمات المرور مشفّرة ولا تُعرض لأحد — حتى لك. إذا نسيها العميل: عيّن له كلمة جديدة وأرسلها، أو أرسل له رابط ليختارها بنفسه.
        </div>

        <section className="mb-4 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4" />كلمة مرور جديدة</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input value={pw} onChange={e => setPw(e.target.value)} type={show ? 'text' : 'password'} dir="ltr"
                className="h-10 w-full rounded-xl border border-gray-300 px-3 pl-9 font-mono text-sm focus:border-gray-600 focus:outline-none" />
              <button type="button" onClick={() => setShow(!show)} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <button onClick={() => setPw(genPassword())} className="h-10 rounded-xl border border-gray-300 px-3 text-xs font-bold">توليد</button>
            <button onClick={setPassword} disabled={!row.owner_id || pw.length < 8 || busy} className="h-10 rounded-xl bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-40">
              {busy === 'pw' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تعيين'}
            </button>
          </div>
        </section>

        <section className="mb-4 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-bold"><Link2 className="h-4 w-4" />أو رابط استعادة (العميل يختار كلمته)</p>
          <button onClick={makeLink} disabled={!row.email || busy} className="h-10 w-full rounded-xl border border-gray-300 text-sm font-bold disabled:opacity-40">
            {busy === 'link' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'إنشاء رابط'}
          </button>
          {link && <div className="flex items-center gap-1 rounded-lg bg-gray-50 p-2"><code dir="ltr" className="flex-1 truncate text-[11px]">{link}</code><CopyBtn value={link} /></div>}
        </section>

        {doneMsg && (
          <div className="mb-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <pre className="whitespace-pre-wrap font-sans text-xs text-emerald-900">{doneMsg}</pre>
            <div className="flex gap-2">
              {phone.length >= 11 && (
                <a href={`https://wa.me/${phone}?text=${encodeURIComponent(doneMsg)}`} target="_blank" rel="noopener"
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"><MessageCircle className="h-4 w-4" />إرسال واتساب</a>
              )}
              <a href={`mailto:${row.email}?subject=${encodeURIComponent('بيانات الدخول — فلسي')}&body=${encodeURIComponent(doneMsg)}`}
                className="flex h-9 items-center rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-800">إرسال بالبريد</a>
            </div>
          </div>
        )}

        <section className="space-y-2 border-t border-gray-200 pt-4">
          <p className="flex items-center gap-1.5 text-sm font-bold"><CalendarPlus className="h-4 w-4" />تاريخ انتهاء الاشتراك (تمديد يدوي)</p>
          <div className="flex gap-2">
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-10 flex-1 rounded-xl border border-gray-300 px-3 text-sm" />
            <button onClick={saveEnd} disabled={!end || busy} className="h-10 rounded-xl bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-40">حفظ</button>
          </div>
        </section>
      </div>
    </div>
  );
}
