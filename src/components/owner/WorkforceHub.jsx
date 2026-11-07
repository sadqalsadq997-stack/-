import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, ShieldCheck, ClipboardList, Wallet, RefreshCw, Lock, Plus, CheckCircle2, Clock3, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const DEPARTMENTS = [
  ['operations','العمليات'],['technical_support','الدعم الفني'],['software_development','البرمجة والتطوير'],
  ['quality_assurance','اختبار الجودة'],['sales','المبيعات'],['marketing','التسويق'],['finance','المالية'],['hr','الموارد البشرية']
];
const ROLES = [['support','دعم فني'],['admin','إدارة'],['finance','مالية'],['developer','مطوّر'],['hr','موارد بشرية'],['marketing','تسويق'],['operations','عمليات']];
const STATUSES = [['active','نشط'],['probation','تجربة'],['leave','إجازة'],['suspended','موقوف'],['terminated','منتهي الخدمة']];
const money = n => Number(n || 0).toLocaleString('ar-SA',{maximumFractionDigits:2});

function Field({label,children}) { return <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{label}</span>{children}</label>; }
const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500";

export default function WorkforceHub({ api }) {
  const [tab,setTab] = useState('employees');
  const [members,setMembers] = useState([]);
  const [tasks,setTasks] = useState([]);
  const [payroll,setPayroll] = useState([]);
  const [busy,setBusy] = useState(false);
  const [showCreate,setShowCreate] = useState(false);
  const [showTask,setShowTask] = useState(false);
  const [showPayroll,setShowPayroll] = useState(false);
  const [createdCredential,setCreatedCredential] = useState(null);
  const [employee,setEmployee] = useState({full_name:'',email:'',phone:'',department:'operations',job_title:'',role:'support',employment_type:'full_time',hire_date:'',password:'',permissions:[]});
  const [task,setTask] = useState({title:'',description:'',assigned_to:'',priority:'medium',due_at:''});
  const [pay,setPay] = useState({member_id:'',pay_period:new Date().toISOString().slice(0,7)+'-01',base_salary:'',allowances:'0',deductions:'0',bonus:'0',status:'draft',notes:''});

  async function load() {
    setBusy(true);
    try {
      const [m,t,p] = await Promise.all([api('list_workforce_members'),api('list_team_tasks'),api('list_payroll_records')]);
      setMembers(m||[]); setTasks(t||[]); setPayroll(p||[]);
    } catch(e) { toast.error(e.message || 'تعذر تحميل بيانات الموارد البشرية'); }
    finally { setBusy(false); }
  }
  useEffect(()=>{load();},[]);
  const active = members.filter(m=>m.is_active).length;
  const openTasks = tasks.filter(t=>!['completed','cancelled'].includes(t.status)).length;
  const payrollTotal = payroll.filter(p=>p.status!=='cancelled').reduce((s,p)=>s+Number(p.base_salary||0)+Number(p.allowances||0)+Number(p.bonus||0)-Number(p.deductions||0),0);

  async function createEmployee(e) {
    e.preventDefault();
    if(employee.password.length<12) return toast.error('كلمة المرور المؤقتة يجب أن تكون 12 حرفًا على الأقل');
    setBusy(true);
    try {
      const result=await api('create_workforce_member',employee);
      setCreatedCredential({email:employee.email,password:result.temporary_password});
      setShowCreate(false);
      setEmployee({full_name:'',email:'',phone:'',department:'operations',job_title:'',role:'support',employment_type:'full_time',hire_date:'',password:'',permissions:[]});
      await load();
      toast.success('تم إنشاء سجل الموظف وحساب الدخول');
    } catch(e) { toast.error(e.message||'تعذر إنشاء الموظف'); }
    finally { setBusy(false); }
  }
  async function updateStatus(m,status) {
    try { await api('update_workforce_member',{id:m.id,updates:{employment_status:status}}); await load(); toast.success('تم تحديث الحالة'); }
    catch(e) { toast.error(e.message); }
  }
  async function createTask(e) {
    e.preventDefault();
    if(!task.assigned_to) return toast.error('اختر الموظف المسؤول');
    try { await api('save_team_task',task); setTask({title:'',description:'',assigned_to:'',priority:'medium',due_at:''}); setShowTask(false); await load(); toast.success('تم إنشاء المهمة'); }
    catch(e) { toast.error(e.message); }
  }
  async function changeTaskStatus(t,status) {
    try { await api('update_team_task_status',{id:t.id,status}); await load(); }
    catch(e) { toast.error(e.message); }
  }
  async function savePayroll(e) {
    e.preventDefault();
    try { await api('save_payroll_record',pay); setShowPayroll(false); await load(); toast.success('تم حفظ مسير الراتب'); }
    catch(e) { toast.error(e.message); }
  }

  return <div className="space-y-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold tracking-widest text-amber-700">FELSY PEOPLE OPERATIONS</p><h2 className="mt-1 text-2xl font-black text-slate-900">الموارد البشرية وفريق المنصة</h2><p className="mt-1 text-sm text-slate-500">ملفات الموظفين، الحسابات، المهام، الرواتب وسجل العمليات الإدارية</p></div>
      <button onClick={load} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold"><RefreshCw className="h-4 w-4"/> تحديث البيانات</button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric icon={Users} label="إجمالي الموظفين" value={members.length}/>
      <Metric icon={CheckCircle2} label="الموظفون النشطون" value={active}/>
      <Metric icon={ClipboardList} label="المهام المفتوحة" value={openTasks}/>
      <Metric icon={Wallet} label="إجمالي الرواتب المعروضة" value={money(payrollTotal)+' ر.س'}/>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {[['employees','الموظفون',Users],['tasks','المهام',ClipboardList],['payroll','الرواتب',Wallet]].map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab===id?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}><Icon className="h-4 w-4"/>{label}</button>)}
      <span className="mr-auto inline-flex items-center gap-1 text-[11px] text-emerald-700"><ShieldCheck className="h-4 w-4"/> بيانات الإدارة عبر واجهة المالك فقط</span>
    </div>
    {tab==='employees' && <section className="space-y-4">
      <div className="flex items-center justify-between"><div><h3 className="font-black">دليل الموظفين</h3><p className="text-xs text-slate-500">الحسابات الفردية والحالة الوظيفية والأقسام</p></div><button onClick={()=>setShowCreate(v=>!v)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"><UserPlus className="h-4 w-4"/> إضافة موظف</button></div>
      {showCreate && <form onSubmit={createEmployee} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="الاسم الكامل"><input required className={input} value={employee.full_name} onChange={e=>setEmployee({...employee,full_name:e.target.value})}/></Field>
        <Field label="البريد الإلكتروني (اسم الدخول)"><input required type="email" className={input} value={employee.email} onChange={e=>setEmployee({...employee,email:e.target.value})}/></Field>
        <Field label="رقم الجوال"><input className={input} value={employee.phone} onChange={e=>setEmployee({...employee,phone:e.target.value})}/></Field>
        <Field label="القسم"><select className={input} value={employee.department} onChange={e=>setEmployee({...employee,department:e.target.value})}>{DEPARTMENTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="المسمى الوظيفي"><input className={input} value={employee.job_title} onChange={e=>setEmployee({...employee,job_title:e.target.value})}/></Field>
        <Field label="الدور"><select className={input} value={employee.role} onChange={e=>setEmployee({...employee,role:e.target.value})}>{ROLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="نوع العقد"><select className={input} value={employee.employment_type} onChange={e=>setEmployee({...employee,employment_type:e.target.value})}><option value="full_time">دوام كامل</option><option value="part_time">دوام جزئي</option><option value="contract">عقد</option><option value="freelance">مستقل</option><option value="intern">تدريب</option></select></Field>
        <Field label="تاريخ المباشرة"><input type="date" className={input} value={employee.hire_date} onChange={e=>setEmployee({...employee,hire_date:e.target.value})}/></Field>
        <Field label="كلمة مرور مؤقتة (12 حرفًا فأكثر)"><input required minLength={12} type="password" autoComplete="new-password" className={input} value={employee.password} onChange={e=>setEmployee({...employee,password:e.target.value})}/></Field>
        <div className="flex items-center gap-2 md:col-span-2 xl:col-span-3"><button disabled={busy} className="h-11 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white disabled:opacity-50">إنشاء الموظف وحساب الدخول</button><button type="button" onClick={()=>setShowCreate(false)} className="h-11 rounded-xl border px-5 text-sm font-bold">إلغاء</button></div>
        <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-3">يتم إنشاء هوية دخول منفصلة في Supabase Auth. لا تشارك كلمة المرور إلا عبر قناة آمنة، وسيتم فرض تغييرها عند أول دخول بعد استكمال بوابة الموظفين.</p>
      </form>}
      {createdCredential && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center gap-2 font-black text-amber-900"><Lock className="h-4 w-4"/> بيانات الدخول المؤقتة — تظهر مرة واحدة</div><p className="mt-2 text-sm">البريد: <b dir="ltr">{createdCredential.email}</b></p><p className="text-sm">كلمة المرور: <b dir="ltr">{createdCredential.password}</b></p><button onClick={()=>setCreatedCredential(null)} className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">إخفاء بيانات الدخول</button></div>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">الموظف</th><th className="p-3">القسم / المسمى</th><th className="p-3">الحساب</th><th className="p-3">المهام</th><th className="p-3">الحالة</th><th className="p-3">الإجراء</th></tr></thead><tbody>{members.map(m=><tr key={m.id} className="border-t border-slate-100"><td className="p-3"><b>{m.full_name}</b><div className="text-xs text-slate-500">{m.email}</div></td><td className="p-3">{DEPARTMENTS.find(d=>d[0]===m.department)?.[1]||m.department}<div className="text-xs text-slate-500">{m.job_title||'—'}</div></td><td className="p-3">{m.auth_user_id?<span className="text-emerald-700">حساب مرتبط</span>:<span className="text-amber-700">سجل فقط</span>}</td><td className="p-3">{m.open_task_count||0} مفتوحة / {m.task_count||0} إجمالي</td><td className="p-3">{STATUSES.find(s=>s[0]===m.employment_status)?.[1]||(m.is_active?'نشط':'موقوف')}</td><td className="p-3"><select className="h-9 rounded-lg border px-2 text-xs" value={m.employment_status||'active'} onChange={e=>updateStatus(m,e.target.value)}>{STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td></tr>)}</tbody></table>{!members.length&&!busy&&<p className="p-8 text-center text-sm text-slate-500">لا يوجد موظفون بعد</p>}</div>
    </section>}
    {tab==='tasks' && <section className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-black">إدارة المهام والتكليفات</h3><p className="text-xs text-slate-500">توزيع ومتابعة الأعمال حسب الموظف والأولوية والموعد</p></div><button onClick={()=>setShowTask(v=>!v)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4"/> مهمة جديدة</button></div>
      {showTask&&<form onSubmit={createTask} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2"><Field label="عنوان المهمة"><input required className={input} value={task.title} onChange={e=>setTask({...task,title:e.target.value})}/></Field><Field label="الموظف المسؤول"><select required className={input} value={task.assigned_to} onChange={e=>setTask({...task,assigned_to:e.target.value})}><option value="">اختر الموظف</option>{members.filter(m=>m.is_active).map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field><Field label="الأولوية"><select className={input} value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></Field><Field label="الموعد النهائي"><input type="datetime-local" className={input} value={task.due_at} onChange={e=>setTask({...task,due_at:e.target.value?new Date(e.target.value).toISOString():''})}/></Field><Field label="التفاصيل"><textarea className={input+' h-24 py-2'} value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/></Field><div className="flex items-end"><button className="h-11 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white">حفظ المهمة</button></div></form>}
      <div className="grid gap-3 lg:grid-cols-2">{tasks.map(t=><article key={t.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-black">{t.title}</h4><p className="mt-1 text-xs text-slate-500">{t.platform_team_members?.full_name||'موظف'} · {t.due_at?new Date(t.due_at).toLocaleString('ar-SA'):'دون موعد'}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{({urgent:'عاجلة',high:'عالية',medium:'متوسطة',low:'منخفضة'})[t.priority]}</span></div>{t.description&&<p className="mt-3 text-sm text-slate-600">{t.description}</p>}<div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{({new:'جديدة',in_progress:'قيد التنفيذ',blocked:'متوقفة',completed:'مكتملة',cancelled:'ملغاة'})[t.status]}</span><select className="h-9 rounded-lg border px-2 text-xs" value={t.status} onChange={e=>changeTaskStatus(t,e.target.value)}><option value="new">جديدة</option><option value="in_progress">قيد التنفيذ</option><option value="blocked">متوقفة</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option></select></div></article>)}</div>{!tasks.length&&<p className="py-8 text-center text-sm text-slate-500">لا توجد مهام مسجلة</p>}</section>}
    {tab==='payroll' && <section className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-black">الرواتب ومسيرات الصرف</h3><p className="text-xs text-slate-500">بيانات مالية خاصة بمالك المنصة والمخولين فقط</p></div><button onClick={()=>setShowPayroll(v=>!v)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4"/> إضافة مسير راتب</button></div>
      {showPayroll&&<form onSubmit={savePayroll} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3"><Field label="الموظف"><select required className={input} value={pay.member_id} onChange={e=>setPay({...pay,member_id:e.target.value})}><option value="">اختر الموظف</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field><Field label="تاريخ المسير"><input required type="date" className={input} value={pay.pay_period} onChange={e=>setPay({...pay,pay_period:e.target.value})}/></Field><Field label="الراتب الأساسي"><input required type="number" min="0" className={input} value={pay.base_salary} onChange={e=>setPay({...pay,base_salary:e.target.value})}/></Field><Field label="البدلات"><input type="number" min="0" className={input} value={pay.allowances} onChange={e=>setPay({...pay,allowances:e.target.value})}/></Field><Field label="الخصومات"><input type="number" min="0" className={input} value={pay.deductions} onChange={e=>setPay({...pay,deductions:e.target.value})}/></Field><Field label="المكافآت"><input type="number" min="0" className={input} value={pay.bonus} onChange={e=>setPay({...pay,bonus:e.target.value})}/></Field><Field label="الحالة"><select className={input} value={pay.status} onChange={e=>setPay({...pay,status:e.target.value})}><option value="draft">مسودة</option><option value="approved">معتمد</option><option value="paid">مدفوع</option><option value="cancelled">ملغي</option></select></Field><Field label="ملاحظات"><input className={input} value={pay.notes} onChange={e=>setPay({...pay,notes:e.target.value})}/></Field><div className="flex items-end"><button className="h-11 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white">حفظ المسير</button></div></form>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[680px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">الموظف</th><th className="p-3">الفترة</th><th className="p-3">الأساسي</th><th className="p-3">البدلات والمكافآت</th><th className="p-3">الخصومات</th><th className="p-3">الصافي</th><th className="p-3">الحالة</th></tr></thead><tbody>{payroll.map(p=><tr key={p.id} className="border-t border-slate-100"><td className="p-3 font-bold">{p.platform_team_members?.full_name||'—'}</td><td className="p-3">{p.pay_period}</td><td className="p-3">{money(p.base_salary)}</td><td className="p-3">{money(Number(p.allowances||0)+Number(p.bonus||0))}</td><td className="p-3">{money(p.deductions)}</td><td className="p-3 font-black">{money(Number(p.base_salary||0)+Number(p.allowances||0)+Number(p.bonus||0)-Number(p.deductions||0))} ر.س</td><td className="p-3">{({draft:'مسودة',approved:'معتمد',paid:'مدفوع',cancelled:'ملغي'})[p.status]}</td></tr>)}</tbody></table>{!payroll.length&&<p className="p-8 text-center text-sm text-slate-500">لا توجد مسيرات رواتب</p>}</div>
    </section>}
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>حقول الهوية والعنوان والحساب البنكي والطوارئ والعقود لا تُفعّل في هذه النسخة قبل تهيئة مفتاح تشفير الخادم، وبوابة دخول الموظف والتحقق من صلاحياته. لا تحفظ هذه المعلومات الحساسة في الملاحظات النصية.</div>
  </div>;
}
function Metric({icon:Icon,label,value}) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4"/>{label}</div><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div>; }
