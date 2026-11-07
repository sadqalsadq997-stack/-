import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ClipboardList, Database, RefreshCw, Server, ShieldCheck, Users, ExternalLink } from 'lucide-react';

const number = value => Number(value || 0).toLocaleString('ar-SA');
const STATUS = { open: 'مفتوح', in_progress: 'قيد المعالجة', investigating: 'قيد الفحص', resolved: 'تم الحل', closed: 'مغلق', completed: 'مكتمل', pending: 'بانتظار التنفيذ' };

function Metric({ icon: Icon, label, value, hint, tone = 'slate' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700', blue: 'bg-blue-50 text-blue-700' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5"/></div><p className="text-2xl font-black text-slate-900">{number(value)}</p><p className="mt-1 text-sm font-bold text-slate-700">{label}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>;
}

export default function OperationsCenter({ api }) {
  const [data, setData] = useState({ branches: [], subscriptions: [], tickets: [], incidents: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const actions = ['list_branches','list_subscriptions','list_support_tickets','list_platform_incidents','list_team_tasks'];
    const results = await Promise.allSettled(actions.map(action => api(action)));
    const next = {};
    actions.forEach((action, i) => { next[{list_branches:'branches',list_subscriptions:'subscriptions',list_support_tickets:'tickets',list_platform_incidents:'incidents',list_team_tasks:'tasks'}[action]] = results[i].status === 'fulfilled' ? (results[i].value || []) : []; });
    if (results.every(x => x.status === 'rejected')) setError('تعذر تحميل بيانات مركز العمليات من واجهة مالك النظام.');
    else if (results.some(x => x.status === 'rejected')) setError('بعض مصادر البيانات لم تستجب؛ الأرقام المعروضة تخص المصادر التي تم تحميلها فقط.');
    setData(next); setLoading(false);
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  const openIncidents = data.incidents.filter(x => !['resolved','closed','completed'].includes(String(x.status || '').toLowerCase()));
  const openTasks = data.tasks.filter(x => !['completed','cancelled'].includes(String(x.status || '').toLowerCase()));
  const activeSubs = data.subscriptions.filter(x => ['active','trialing'].includes(String(x.status || '').toLowerCase()));
  const activeBranches = data.branches.filter(x => x.is_active !== false);

  return <div className="space-y-6" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-widest text-amber-700">FELSY / OPERATIONS</p><h2 className="mt-1 text-2xl font-black text-slate-900">مركز العمليات الذكية</h2><p className="mt-1 text-sm text-slate-500">لوحة متابعة تشغيلية للمنصة — بدون تنفيذ تغييرات تلقائية على بيانات المنشآت.</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/> تحديث البيانات</button></div>
    {error && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Users} label="المنشآت" value={data.subscriptions.length} hint={`${number(activeSubs.length)} اشتراك نشط أو تجريبي`} tone="blue"/>
      <Metric icon={Server} label="الفروع" value={data.branches.length} hint={`${number(activeBranches.length)} فرع مفعّل حسب السجل`} tone="green"/>
      <Metric icon={AlertTriangle} label="الحوادث المفتوحة" value={openIncidents.length} hint="من سجل حوادث المنصة" tone={openIncidents.length?'red':'green'}/>
      <Metric icon={ClipboardList} label="المهام غير المكتملة" value={openTasks.length} hint="مهام فريق التشغيل" tone="amber"/>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-700"/><h3 className="font-black">الحوادث التقنية الأخيرة</h3></div>{loading?<p className="py-6 text-center text-sm text-slate-400">جارٍ التحميل…</p>:data.incidents.length===0?<p className="py-6 text-center text-sm text-slate-500">لا توجد حوادث مسجلة في المصدر المتاح.</p>:<div className="space-y-2">{data.incidents.slice(0,6).map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.title || item.summary || item.incident_type || 'حادث تقني'}</p><p className="mt-1 text-xs text-slate-500">{item.severity || '—'} · {item.created_at?new Date(item.created_at).toLocaleString('ar-SA'):'—'}</p></div><span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-600">{STATUS[item.status] || item.status || 'غير محدد'}</span></div>)}</div>}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-blue-700"/><h3 className="font-black">مهام فريق التشغيل</h3></div>{loading?<p className="py-6 text-center text-sm text-slate-400">جارٍ التحميل…</p>:data.tasks.length===0?<p className="py-6 text-center text-sm text-slate-500">لا توجد مهام مسجلة في المصدر المتاح.</p>:<div className="space-y-2">{data.tasks.slice(0,6).map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.title || item.task_title || 'مهمة تشغيلية'}</p><p className="mt-1 text-xs text-slate-500">{item.platform_team_members?.full_name || 'غير معيّن'}</p></div><span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-600">{STATUS[item.status] || item.status || 'غير محدد'}</span></div>)}</div>}</section>
    </div>
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-slate-600"/><div><h3 className="font-black">سلامة البيانات وربط الوحدات</h3><p className="mt-1 text-sm leading-7 text-slate-600">تم رصد مخطط قاعدة البيانات والعلاقات المرجعية على مستوى PostgreSQL. مرحلة الفحص التالية ستتحقق من السجلات اليتيمة وتعارض tenant_id بين السجلات المرتبطة، ثم تعرض النتائج للمراجعة قبل أي إصلاح. لم تُحذف أو تُدمج أو تُعدّل سجلات منشآت في هذه المرحلة.</p><div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4"/> وضع القراءة والمتابعة فقط</div></div></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-900">مساحة العمل والتكاملات</h3><p className="mt-1 text-xs text-slate-500">روابط مباشرة للمصادر المعتمدة. فتحها يتيح تعديل المهام والوثائق في أنظمتها الأصلية.</p></div><ExternalLink className="h-5 w-5 text-slate-500"/></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <a href="https://app.notion.com/p/40d1ba2592f081bcb38bd611eb10597c" target="_blank" rel="noreferrer" className="rounded-xl border p-4 hover:bg-slate-50"><p className="font-bold">Notion</p><p className="mt-1 text-xs text-slate-500">وثائق التشغيل والقرارات — قابلة للتحرير في Notion</p><span className="mt-3 inline-block text-xs font-bold text-blue-700">فتح الوثيقة ↗</span></a>
        <a href="https://linear.app/felsy/project/felsy-owner-console-english-ux-and-reliability-f7c7b32ac2a7" target="_blank" rel="noreferrer" className="rounded-xl border p-4 hover:bg-slate-50"><p className="font-bold">Linear</p><p className="mt-1 text-xs text-slate-500">المشروع والمهام والأولويات — تعديل مباشر في Linear</p><span className="mt-3 inline-block text-xs font-bold text-blue-700">فتح المشروع ↗</span></a>
        <a href="https://github.com/sadqalsadq997-stack/-/pull/14" target="_blank" rel="noreferrer" className="rounded-xl border p-4 hover:bg-slate-50"><p className="font-bold">GitHub · PR #14</p><p className="mt-1 text-xs text-slate-500">مراجعة تغييرات الكود ومتابعة الفروع</p><span className="mt-3 inline-block text-xs font-bold text-blue-700">فتح طلب الدمج ↗</span></a>
        <a href="https://vercel.com/felsy/sa" target="_blank" rel="noreferrer" className="rounded-xl border p-4 hover:bg-slate-50"><p className="font-bold">Vercel</p><p className="mt-1 text-xs text-slate-500">معاينات البناء وسجل النشر</p><span className="mt-3 inline-block text-xs font-bold text-blue-700">فتح النشر ↗</span></a>
      </div>
      <p className="mt-3 text-[11px] text-amber-700">ملاحظة: هذه روابط إلى أنظمة العمل الأصلية وليست مزامنة API داخلية بعد. لا تعرض الشاشة حالة اتصال أو مزامنة غير متحقق منها.</p>
    </section>
    <p className="text-[11px] text-slate-400">المؤشرات مصدرها سجلات المنصة الحالية، وليست فحصًا حيًا لصحة جميع خدمات الإنتاج أو اتصال كل منشأة.</p>
  </div>;
}
