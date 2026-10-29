import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PLANS } from '@/lib/pricingPlans';
import { sha256, maskSensitive } from '@/lib/security/crypto';
import { callFunction } from '@/lib/api';
import {
  Users, Globe, BarChart3, DollarSign, Calendar,
  Shield, Bell, Search, RefreshCw, Loader2, CheckCircle2,
  XCircle, AlertTriangle, MessageSquare, Eye, EyeOff, Lock,
  LogOut, FileText, Activity, Server, Database, Pencil, Trash2,
  Send, Plus, Settings, Tag, BadgeDollarSign, Megaphone,
  Wifi, WifiOff, AlertCircle, Newspaper, Bot, Check, X,
  CreditCard, Sparkles, TrendingUp, Copy, UserCog, Landmark, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { LogoMark } from '@/components/brand/Logo';
import SubscribersTab from '@/components/owner/SubscribersTab';
import BlogManager from '@/components/owner/BlogManager';

const fmt    = (n) => Number(n || 0).toLocaleString('ar-SA');
const fmtSAR = (n) => `${fmt(n)} ⃁`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-SA') : '—';

// ── اسم مساعد الدعم الذكي — قابل للتغيير من المدير ────────────
const DEFAULT_AI_NAME = 'فلسي مساعد';

const SESSION_KEY  = '_sa_tok';
const SESSION_MAX  = 4 * 60 * 60 * 1000;

// ── استدعاء دالة owner-admin-api — تتجاوز RLS بأمان فقط لجلسة صاحب
// النظام الموثَّقة (لا تتأثر بعزل tenant_id الخاص بالعملاء العاديين) ──
async function callOwnerApi(action, payload) {
  let ownerToken = '';
  try {
    const raw = JSON.parse(atob(sessionStorage.getItem(SESSION_KEY) || ''));
    ownerToken = raw?.token || '';
  } catch { /* لا توجد جلسة صالحة */ }
  const { data, error, status } = await callFunction('owner-admin-api', { ownerToken, action, payload });
  if (status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }
  if (error) throw new Error(error);
  return data?.data;
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-green-700 font-bold mt-1">{sub}</p>}
    </div>
  );
}

// ── شاشة تسجيل الدخول ──────────────────────────────────────────
function OwnerLogin({ onLogin }) {
  const [pin, setPin]       = useState('');
  const [show, setShow]     = useState(false);
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // المحاولات تُحسب في السيرفر: 10 خاطئة لكل جهاز ثم قفل 30 دقيقة
  async function handleLogin() {
    if (isLocked || loading || !pin) return;
    setLoading(true); setErr('');
    const hash = await sha256(pin + ':felsy-owner');
    const { data, error, status } = await callFunction('verify-owner-pin', { hash });
    if (!error && data?.token) {
      sessionStorage.setItem(SESSION_KEY, btoa(JSON.stringify({ token: data.token, exp: Date.now() + SESSION_MAX })));
      setPin('');
      setLoading(false);
      onLogin();
      return;
    }
    if (status === 429) setIsLocked(true);
    setErr(data?.code === 'invalid' ? `رمز خاطئ — باقي ${data.remaining} محاولة من هذا الجهاز` : (error || 'تعذر الدخول'));
    setPin('');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4" dir="rtl">
      <div className="bg-white border border-gray-200 rounded-3xl p-10 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><LogoMark size={64} /></div>
          <h1 className="text-2xl font-black text-gray-900">لوحة مالك النظام</h1>
          <p className="text-gray-400 text-sm mt-1">فلسي — الداخلية</p>
        </div>
        {isLocked ? (
          <div className="text-center py-6">
            <Lock className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-700 font-bold">الحساب مقفول</p>
            <p className="text-gray-400 text-sm mt-1">{err || 'حاول لاحقاً'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={pin} onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="رمز الدخول السري"
                className="w-full h-12 bg-gray-50 border border-gray-300 rounded-xl px-4 pr-10 text-gray-900 placeholder-gray-600 focus:outline-none focus:border-red-500 text-base"
                autoComplete="off" />
              <button onClick={() => setShow(!show)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {err && <p className="text-red-700 text-sm text-center">{err}</p>}
            <button onClick={handleLogin} disabled={loading || !pin}
              className="w-full h-12 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl font-black text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              دخول آمن
            </button>
          </div>
        )}
        <p className="text-center text-gray-700 text-xs mt-6">جميع محاولات الدخول مسجّلة</p>
      </div>
    </div>
  );
}

function checkSession() {
  try {
    const { token, exp } = JSON.parse(atob(sessionStorage.getItem(SESSION_KEY)||''));
    if (!token || Date.now() > exp) { sessionStorage.removeItem(SESSION_KEY); return false; }
    return true;
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════
// ── التبويبات ───────────────────────────────────────────────────

// ── ١. نظرة عامة + مراقبة الفروع ─────────────────────────────
function OverviewTab({ stats, clients }) {
  const active  = clients.filter(c => c.status === 'active');
  const expired = clients.filter(c => c.status !== 'active');
  // محاكاة مراقبة الفروع (يمكن ربطها بـ Edge Function لاحقاً)
  const [branches, setBranches] = useState([]);
  const [loadingB, setLoadingB] = useState(true);

  useEffect(() => {
    callOwnerApi('list_branches').then(data => { setBranches(data||[]); setLoadingB(false); })
      .catch(() => setLoadingB(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* إحصاءات */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}       label="إجمالي العملاء"  value={fmt(stats.totalClients)}   color="bg-blue-100 text-blue-700" />
          <StatCard icon={CheckCircle2}label="نشطون"           value={fmt(stats.activeClients)}  color="bg-green-100 text-green-700" />
          <StatCard icon={DollarSign}  label="الإيرادات"       value={fmtSAR(stats.totalRevenue)}color="bg-amber-100 text-amber-700" />
          <StatCard icon={MessageSquare} label="تذاكر مفتوحة"  value={fmt(stats.openTickets)}   color="bg-red-100 text-red-700" />
        </div>
      )}

      {/* مراقبة الفروع */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-700" />
          <h3 className="font-bold text-gray-900 text-sm">مراقبة الفروع — حالة اليوم</h3>
        </div>
        {loadingB ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="divide-y divide-gray-200">
            {branches.length === 0 && (
              <p className="text-center text-gray-400 py-8">لا توجد فروع مسجّلة</p>
            )}
            {branches.map(b => {
              // نبحث هل لهذا الفرع مالك نشط
              const owner = clients.find(c => c.branch_id === b.id && c.status === 'active');
              const hasIssue = !b.is_active;
              return (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-green-400' : 'bg-red-500 animate-pulse'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.name}</p>
                      <p className="text-xs text-gray-400">
                        {owner ? `المالك: ${owner.client_name||'غير محدد'}` : 'بدون مالك نشط'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasIssue ? (
                      <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg">
                        <AlertCircle className="w-3 h-3" /> خلل مكتشف
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg">
                        <Wifi className="w-3 h-3" /> يعمل
                      </span>
                    )}
                    {owner && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">نشط</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ٢. إدارة الأسعار والخطط ──────────────────────────────────
function PricingTab() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    callOwnerApi('list_subscription_plans')
      .then((data) => { setPlans(data||[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function savePlan(plan) {
    try { await callOwnerApi('save_subscription_plan', plan); }
    catch (e) { toast.error('فشل الحفظ: ' + e.message); return; }
    setPlans(await callOwnerApi('list_subscription_plans') || []);
    setEditing(null);
    toast.success('تم حفظ الخطة');
  }

  async function deletePlan(id) {
    if (!confirm('حذف الخطة؟')) return;
    await callOwnerApi('delete_subscription_plan', { id });
    setPlans(p => p.filter(x => x.id !== id));
    toast.success('تم الحذف');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">خطط الاشتراك</h3>
        <button onClick={() => setEditing({ name:'', price_monthly:0, price_yearly:0, features:[] })}
          className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> خطة جديدة
        </button>
      </div>

      {editing && (
        <PlanForm plan={editing} onSave={savePlan} onCancel={() => setEditing(null)} />
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(p => (
            <div key={p.id} className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-gray-900">{p.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(p)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deletePlan(p.id)} className="p-1.5 hover:bg-red-100 rounded-lg text-gray-500 hover:text-red-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-white rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">شهري</p>
                  <p className="text-lg font-black text-amber-700">{fmtSAR(p.price_monthly)}</p>
                </div>
                <div className="flex-1 bg-white rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">سنوي</p>
                  <p className="text-lg font-black text-green-700">{fmtSAR(p.price_yearly)}</p>
                </div>
              </div>
              {p.features?.length > 0 && (
                <ul className="space-y-1">
                  {p.features.slice(0,4).map((f,i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-500">
                      <Check className="w-3 h-3 text-green-700 flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanForm({ plan, onSave, onCancel }) {
  const [form, setForm] = useState({ ...plan, features: (plan.features||[]).join('\n') });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[['name','اسم الخطة'],['description','وصف قصير']].map(([k,l]) => (
          <div key={k}>
            <label className="text-xs text-gray-500 mb-1 block">{l}</label>
            <input value={form[k]||''} onChange={e => set(k,e.target.value)}
              className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
          </div>
        ))}
        {[['price_monthly','السعر الشهري'],['price_yearly','السعر السنوي']].map(([k,l]) => (
          <div key={k}>
            <label className="text-xs text-gray-500 mb-1 block">{l} (⃁)</label>
            <input type="number" value={form[k]||0} onChange={e => set(k, Number(e.target.value))}
              className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">المميزات (سطر لكل ميزة)</label>
        <textarea value={form.features||''} onChange={e => set('features', e.target.value)} rows={4}
          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">إلغاء</button>
        <button onClick={() => onSave({ ...form, features: form.features?.split('\n').filter(Boolean)||[] })}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">حفظ</button>
      </div>
    </div>
  );
}

// ── ٣. رسائل جماعية للمالكين ─────────────────────────────────
function BroadcastTab({ clients }) {
  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState([]);
  const [target, setTarget]     = useState('all'); // all | active | expired

  const recipients = clients.filter(c =>
    target === 'all' ? true : target === 'active' ? c.status === 'active' : c.status !== 'active'
  );

  async function sendBroadcast() {
    if (!subject || !body) return toast.error('أدخل العنوان والرسالة');
    setSending(true);
    try {
      // إرسال عبر Supabase Edge Function أو تخزين في جدول notifications
      const msgs = recipients.map(c => ({
        recipient_id: c.client_id,
        recipient_name: c.client_name,
        subject, body,
        sent_at: new Date().toISOString(),
        type: 'broadcast',
      }));
      await callOwnerApi('send_owner_notifications', { messages: msgs });
      setSent(msgs);
      toast.success(`تم الإرسال لـ ${msgs.length} مالك`);
      setSubject(''); setBody('');
    } catch (e) {
      toast.error('فشل الإرسال: ' + e.message);
    }
    setSending(false);
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-700" /> إرسال رسالة جماعية
        </h3>
        {/* اختيار المستهدفين */}
        <div className="flex gap-2">
          {[['all','الكل'],['active','النشطون'],['expired','المنتهون']].map(([v,l]) => (
            <button key={v} onClick={() => setTarget(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                target===v ? 'bg-red-600 text-gray-900' : 'bg-gray-50 text-gray-500 hover:text-gray-900'
              }`}>{l} ({v==='all'?clients.length:v==='active'?clients.filter(c=>c.status==='active').length:clients.filter(c=>c.status!=='active').length})</button>
          ))}
        </div>
        <div className="space-y-3">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="عنوان الرسالة"
            className="w-full h-10 bg-gray-50 border border-gray-300 rounded-xl px-4 text-gray-900 text-sm focus:outline-none focus:border-red-500 placeholder-gray-600" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="نص الرسالة..."
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-red-500 placeholder-gray-600 resize-none" />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">سيتم الإرسال لـ <span className="text-gray-900 font-bold">{recipients.length}</span> مالك</p>
          <button onClick={sendBroadcast} disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 rounded-xl text-sm">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            إرسال
          </button>
        </div>
      </div>
      {sent.length > 0 && (
        <div className="bg-green-100 border border-green-800/50 rounded-2xl p-4">
          <p className="text-green-700 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> تم الإرسال لـ {sent.length} مالك بنجاح
          </p>
        </div>
      )}
    </div>
  );
}

// ── ٤. المدونة والأخبار مع SEO ───────────────────────────────
function AISettingsTab() {
  const [name, setName]       = useState('');
  const [persona, setPersona] = useState('');
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callOwnerApi('get_setting', { key: 'ai_assistant' }).catch(() => null)
      .then((value) => {
        if (value) {
          const v = typeof value === 'string' ? JSON.parse(value) : value;
          setName(v.name || DEFAULT_AI_NAME);
          setPersona(v.persona || '');
        } else {
          setName(DEFAULT_AI_NAME);
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    try { await callOwnerApi('save_ai_settings', { name, persona }); }
    catch { toast.error('فشل الحفظ'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast.success('تم حفظ إعدادات المساعد');
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-700" /> إعدادات مساعد الدعم الذكي
        </h3>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">اسم المساعد</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={DEFAULT_AI_NAME}
            className="w-full h-10 bg-gray-50 border border-gray-300 rounded-xl px-4 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
          <p className="text-xs text-gray-500 mt-1">هذا الاسم يظهر للمستخدمين في صفحة الدعم الفني</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">شخصية المساعد وتعليماته</label>
          <textarea value={persona} onChange={e => setPersona(e.target.value)} rows={6}
            placeholder={`مثال:\nأنت مساعد دعم فني لنظام فلسي POS. أجب بالعربية بأسلوب مهني ومختصر. إذا لم تعرف الجواب، وجّه المستخدم للتواصل مع الدعم البشري.`}
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none" />
        </div>
        <button onClick={save} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors ${
          saved ? 'bg-green-600 text-gray-900' : 'bg-red-600 hover:bg-red-700 text-gray-900'
        }`}>
          {saved ? <><CheckCircle2 className="w-4 h-4" /> تم الحفظ</> : <>حفظ الإعدادات</>}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// اللوحة الرئيسية
// ── ٩. الفوترة الدورية الحقيقية (Moyasar) — خطط مرنة + عروض زمنية ──
function NewPlanVersionForm({ planCode, onSaved, onCancel }) {
  const [form, setForm] = useState({ plan_code: planCode || '', name_ar: '', price_monthly: 0, features: '', included_branches: '', extra_branch_price: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.plan_code || !form.name_ar || !form.price_monthly) {
      toast.error('يرجى تعبئة كل الحقول'); return;
    }
    setSaving(true);
    try {
      // نسخة سعر جديدة (السيرفر يعطّل القديمة بدون حذف — المشتركون الحاليون لا يتأثرون)
      const { version: nextVersion } = await callOwnerApi('publish_billing_plan', {
        plan_code: form.plan_code,
        name_ar: form.name_ar,
        price_monthly: Number(form.price_monthly),
        features: form.features.split('\n').filter(Boolean),
        ...(form.included_branches !== '' ? { included_branches: Number(form.included_branches) } : {}),
        ...(form.extra_branch_price !== '' ? { extra_branch_price: Number(form.extra_branch_price) } : {}),
      });
      toast.success(`تم نشر السعر الجديد كنسخة #${nextVersion} — المشتركون الحاليون لن يتأثروا`);
      onSaved?.();
    } catch (err) {
      toast.error('فشل الحفظ: ' + err.message);
    }
    setSaving(false);
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-3">
      <p className="text-xs text-amber-700 bg-amber-950/40 border border-amber-900/50 rounded-xl p-2.5">
        تغيير السعر هنا ينشر نسخة جديدة فقط — لن يؤثر على المشتركين الحاليين بأي شكل، وسيُطبَّق فقط على المشتركين الجدد من الآن فصاعداً.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">رمز الخطة (plan_code)</label>
          <input value={form.plan_code} onChange={e => set('plan_code', e.target.value)}
            placeholder="starter / pro / enterprise"
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">اسم الخطة بالعربي</label>
          <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">السعر الشهري الجديد (⃁)</label>
          <input type="number" value={form.price_monthly} onChange={e => set('price_monthly', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">فروع مشمولة (999 = غير محدود) — فارغ = بدون تغيير</label>
          <input type="number" min={1} value={form.included_branches} onChange={e => set('included_branches', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">سعر الفرع الإضافي شهرياً — فارغ = بدون تغيير</label>
          <input type="number" min={0} value={form.extra_branch_price} onChange={e => set('extra_branch_price', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">المميزات (سطر لكل ميزة)</label>
        <textarea value={form.features} onChange={e => set('features', e.target.value)} rows={3}
          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">إلغاء</button>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 rounded-xl text-sm">
          {saving ? 'جارٍ النشر...' : 'نشر السعر الجديد'}
        </button>
      </div>
    </div>
  );
}

function NewPromotionForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({
    code: '', name_ar: '', plan_code: 'pro', trial_price: 3,
    trial_period_count: 2, trial_period_unit: 'month',
    max_redemptions: '', valid_until: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await callOwnerApi('create_billing_promotion', {
        code: form.code.trim() || null,
        name_ar: form.name_ar,
        plan_code: form.plan_code,
        trial_price: Number(form.trial_price),
        trial_period_count: Number(form.trial_period_count),
        trial_period_unit: form.trial_period_unit,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        valid_until: form.valid_until || null,
        is_active: true,
      });
      toast.success('تم تفعيل العرض الترويجي');
      onSaved?.();
    } catch (err) {
      toast.error('فشل الحفظ: ' + err.message);
    }
    setSaving(false);
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">اسم العرض</label>
          <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)}
            placeholder="مثال: عرض الانطلاقة"
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">كود ترويجي (اختياري — فراغ = تلقائي للجميع)</label>
          <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
            placeholder="WELCOME2"
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الخطة المستهدفة</label>
          <input value={form.plan_code} onChange={e => set('plan_code', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">سعر فترة العرض (⃁)</label>
          <input type="number" step="0.01" value={form.trial_price} onChange={e => set('trial_price', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">عدد الفترات</label>
          <input type="number" value={form.trial_period_count} onChange={e => set('trial_period_count', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">وحدة الفترة</label>
          <select value={form.trial_period_unit} onChange={e => set('trial_period_unit', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500">
            <option value="month">شهر</option>
            <option value="day">يوم</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">حد أقصى لعدد المستفيدين (اختياري)</label>
          <input type="number" value={form.max_redemptions} onChange={e => set('max_redemptions', e.target.value)}
            placeholder="بلا حد"
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">تاريخ انتهاء العرض (اختياري)</label>
          <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)}
            className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">إلغاء</button>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 rounded-xl text-sm">
          {saving ? 'جارٍ التفعيل...' : 'تفعيل العرض'}
        </button>
      </div>
    </div>
  );
}

function BillingTab() {
  const [billingPlans, setBillingPlans]     = useState([]);
  const [promotions, setPromotions]         = useState([]);
  const [subscriptions, setSubscriptions]   = useState([]);
  const [invoices, setInvoices]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showPlanForm, setShowPlanForm]     = useState(false);
  const [showPromoForm, setShowPromoForm]   = useState(false);
  const [subTab, setSubTab]                 = useState('plans'); // plans | promotions | subscriptions

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: plans }, { data: promos }, subs, invs] = await Promise.all([
      callOwnerApi('list_billing_plans').then(data => ({ data })).catch(() => ({ data: [] })),
      callOwnerApi('list_billing_promotions').then(data => ({ data })).catch(() => ({ data: [] })),
      callOwnerApi('list_tenant_subscriptions').catch(() => []),
      callOwnerApi('list_billing_invoices').catch(() => []),
    ]);
    setBillingPlans(plans || []);
    setPromotions(promos || []);
    setSubscriptions(subs || []);
    setInvoices(invs || []);
    setLoading(false);
  }

  async function subAction(action, id) {
    try {
      await callOwnerApi(action, { id });
      toast.success('تم تنفيذ الإجراء بنجاح');
      await loadAll();
    } catch (e) { toast.error('فشل الإجراء: ' + (e?.message || '')); }
  }

  const activePlans = billingPlans.filter(p => p.is_active);
  const totalMRR = subscriptions
    .filter(s => ['active', 'trialing'].includes(s.status))
    .reduce((sum, s) => sum + Number(s.next_charge_amount || 0), 0);

  const statusLabel = { trialing: 'بفترة العرض', active: 'فعّال', past_due: 'متأخر بالدفع', suspended: 'معلّق', cancelled: 'ملغي' };
  const statusColor = {
    trialing: 'bg-blue-950 text-blue-700', active: 'bg-emerald-950 text-emerald-700',
    past_due: 'bg-amber-950 text-amber-700', suspended: 'bg-red-950 text-red-700', cancelled: 'bg-gray-50 text-gray-500',
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">إيراد شهري متكرر متوقع (MRR)</p>
          <p className="text-xl font-black text-emerald-700">{fmtSAR(totalMRR)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">اشتراكات نشطة</p>
          <p className="text-xl font-black text-gray-900">{subscriptions.filter(s => ['active','trialing'].includes(s.status)).length}</p>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">متأخرة/معلّقة</p>
          <p className="text-xl font-black text-amber-700">{subscriptions.filter(s => ['past_due','suspended'].includes(s.status)).length}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-white p-1 rounded-xl w-fit">
        {[
          { id: 'plans', label: 'خطط التسعير' },
          { id: 'promotions', label: 'العروض الترويجية' },
          { id: 'subscriptions', label: 'الاشتراكات' },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              subTab === t.id ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : subTab === 'plans' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">خطط التسعير الحالية (المُطبّقة على المشتركين الجدد)</h3>
            <button onClick={() => setShowPlanForm(s => !s)}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">
              <Plus className="w-4 h-4" /> نسخة سعر جديدة
            </button>
          </div>
          {showPlanForm && (
            <NewPlanVersionForm onSaved={() => { setShowPlanForm(false); loadAll(); }} onCancel={() => setShowPlanForm(false)} />
          )}
          <div className="grid md:grid-cols-3 gap-4">
            {activePlans.map(p => (
              <div key={p.id} className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-gray-900">{p.name_ar}</h4>
                  <span className="text-[10px] text-gray-400">نسخة #{p.version}</span>
                </div>
                <p className="text-2xl font-black text-amber-700 mb-1">{fmtSAR(p.price_monthly)}<span className="text-xs text-gray-400"> / شهر</span></p>
                <p className="text-[11px] text-gray-400 font-mono">{p.plan_code}</p>
              </div>
            ))}
          </div>
          {billingPlans.filter(p => !p.is_active).length > 0 && (
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-700">عرض نسخ الأسعار القديمة ({billingPlans.filter(p => !p.is_active).length})</summary>
              <div className="mt-2 space-y-1">
                {billingPlans.filter(p => !p.is_active).map(p => (
                  <p key={p.id}>{p.plan_code} — نسخة #{p.version} — {fmtSAR(p.price_monthly)} (غير نشطة، يستمر بها المشتركون القدامى فقط)</p>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : subTab === 'promotions' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">العروض الترويجية الزمنية</h3>
            <button onClick={() => setShowPromoForm(s => !s)}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">
              <Sparkles className="w-4 h-4" /> عرض جديد
            </button>
          </div>
          {showPromoForm && (
            <NewPromotionForm onSaved={() => { setShowPromoForm(false); loadAll(); }} onCancel={() => setShowPromoForm(false)} />
          )}
          <div className="space-y-2">
            {promotions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">لا توجد عروض ترويجية حالياً</p>
            ) : promotions.map(p => (
              <div key={p.id} className="bg-gray-50 border border-gray-300 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{p.name_ar} {p.code && <span className="font-mono text-amber-700 text-xs">({p.code})</span>}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.plan_code} — {fmtSAR(p.trial_price)} لأول {p.trial_period_count} {p.trial_period_unit === 'day' ? 'يوم' : 'شهر'}
                    {p.max_redemptions ? ` — ${p.redemptions_count}/${p.max_redemptions} مستخدَم` : ` — ${p.redemptions_count} مستخدَم`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${p.is_active ? 'bg-emerald-950 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {p.is_active ? 'فعّال' : 'متوقف'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 bg-white/50">
                  {['المنشأة','الخطة','الحالة','المبلغ القادم','نهاية الدورة','محاولات فاشلة','إجراءات'].map(h => (
                    <th key={h} className="text-right px-4 py-3 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد اشتراكات بعد</td></tr>
                ) : subscriptions.map(s => (
                  <tr key={s.id} className="border-b border-gray-200/50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.tenant_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-900">{s.billing_plans?.name_ar || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[s.status] || 'bg-gray-100 text-gray-700'}`}>
                        {statusLabel[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-amber-700 font-bold">{fmtSAR(s.next_charge_amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(s.current_period_end)}</td>
                    <td className="px-4 py-3 text-gray-500">{s.failed_attempts || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {s.status !== 'suspended' && (
                          <button onClick={() => subAction('suspend_tenant_subscription', s.id)}
                            className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200">
                            إيقاف
                          </button>
                        )}
                        {s.status === 'suspended' && (
                          <button onClick={() => subAction('reactivate_tenant_subscription', s.id)}
                            className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200">
                            تفعيل
                          </button>
                        )}
                        {s.status !== 'cancelled' && (
                          <button onClick={() => { if (confirm('تأكيد إلغاء الاشتراك نهائياً؟')) subAction('cancel_tenant_subscription', s.id); }}
                            className="text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                            إلغاء
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuperAdmin() {
  const [authed, setAuthed]   = useState(() => checkSession());
  const [stats, setStats]     = useState(null);
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('overview');

  useEffect(() => {
    const iv = setInterval(() => { if (!checkSession()) setAuthed(false); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (authed) loadAll(); }, [authed]);

  async function loadAll() {
    setLoading(true);
    const [subs, tix] = await Promise.all([
      callOwnerApi('list_subscriptions').catch(() => []),
      callOwnerApi('list_support_tickets').catch(() => []),
    ]);
    const pays = [];
    setClients(subs||[]);
    setTickets(tix||[]);
    setPayments(pays||[]);
    const total = (subs||[]).reduce((s,c) => s + (c.amount_paid||0), 0);
    setStats({
      totalClients: (subs||[]).length,
      activeClients: (subs||[]).filter(c => c.status==='active').length,
      totalRevenue: total,
      openTickets: (tix||[]).filter(t => t.status==='open').length,
      unusedCodes: (pays||[]).filter(p => !p.used).length,
    });
    setLoading(false);
  }

  function logout() {
    callOwnerApi('logout').catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
    toast('تم تسجيل الخروج');
  }

  if (!authed) return <OwnerLogin onLogin={() => setAuthed(true)} />;

  const TABS = [
    { id: 'overview',  label: 'نظرة عامة',    icon: BarChart3    },
    { id: 'clients',   label: 'المشتركين',     icon: Users        },
    { id: 'orders',    label: 'طلبات الاشتراك', icon: Landmark     },
    { id: 'tickets',   label: 'التذاكر',       icon: MessageSquare},
    { id: 'pricing',   label: 'أسعار الخطط',   icon: BadgeDollarSign },
    { id: 'billing',   label: 'الفوترة الدورية', icon: CreditCard },
    { id: 'broadcast', label: 'رسائل جماعية',  icon: Megaphone    },
    { id: 'blog',      label: 'المدونة',        icon: Newspaper    },
    { id: 'ai',        label: 'مساعد الذكاء',  icon: Bot          },
    { id: 'team',      label: 'الفريق والمحتوى', icon: UserCog     },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 p-3 text-gray-900 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* رأس */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <h1 className="text-xl font-black text-gray-900">لوحة المالك — فلسي</h1>
              <p className="text-xs text-gray-400">جلسة آمنة · تنتهي خلال 4 ساعات</p>
            </div>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm transition-colors">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>

        {/* تبويبات */}
        <div className="flex gap-1 bg-white p-1 rounded-2xl border border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium transition-all ${
                tab === t.id ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {loading && tab !== 'pricing' && tab !== 'blog' && tab !== 'broadcast' && tab !== 'ai' && tab !== 'billing' ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
        ) : (
          <>
            {tab === 'overview'  && <OverviewTab stats={stats} clients={clients} />}
            {tab === 'orders'    && <OrdersTab />}
            {tab === 'pricing'   && <PricingTab />}
            {tab === 'billing'   && <BillingTab />}
            {tab === 'broadcast' && <BroadcastTab clients={clients} />}
            {tab === 'blog'      && <BlogManager api={callOwnerApi} />}
            {tab === 'ai'        && <AISettingsTab />}

            {tab === 'clients' && <SubscribersTab api={callOwnerApi} />}

            {tab === 'tickets' && <TicketsTab tickets={tickets} onRefresh={loadAll} />}
            {tab === 'team' && <TeamAndContentTab />}
          </>
        )}
      </div>
    </div>
  );
}

// ── تبويب الدعم الفني — شات كامل بين صاحب النظام والعملاء ──────
// ── طلبات الاشتراك + اعتماد التحويلات البنكية ──────────────────────
const ORDER_STATUS = {
  pending_review:   { label: 'بانتظار المراجعة', cls: 'bg-amber-100 text-amber-800' },
  awaiting_payment: { label: 'بانتظار الدفع',    cls: 'bg-gray-100 text-gray-600' },
  paid:             { label: 'مدفوع ومفعّل',      cls: 'bg-green-100 text-green-800' },
  rejected:         { label: 'مرفوض',            cls: 'bg-red-100 text-red-700' },
  cancelled:        { label: 'ملغي',             cls: 'bg-gray-100 text-gray-400' },
};

function OrdersTab() {
  const [status, setStatus] = useState('pending_review');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [terms, setTerms] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await callOwnerApi('list_billing_orders', { status }) || []); } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { callOwnerApi('list_billing_terms').then(t => setTerms(t || [])).catch(() => {}); }, []);

  async function openReceipt(o) {
    try { const url = await callOwnerApi('receipt_url', { id: o.id }); window.open(url, '_blank', 'noopener'); }
    catch (e) { toast.error(e.message); }
  }
  async function approve(o) {
    if (!confirm(`تأكيد استلام ${fmtSAR(o.amount)} وتفعيل اشتراك "${o.tenants?.name || ''}"؟`)) return;
    setBusyId(o.id);
    try { await callOwnerApi('approve_order', { id: o.id }); toast.success('تم تفعيل الاشتراك'); await load(); }
    catch (e) { toast.error(e.message); }
    setBusyId(null);
  }
  async function reject(o) {
    setBusyId(o.id);
    try { await callOwnerApi('reject_order', { id: o.id, note: reason }); toast.success('تم رفض الإيصال وإبلاغ العميل في صفحته'); setRejecting(null); setReason(''); await load(); }
    catch (e) { toast.error(e.message); }
    setBusyId(null);
  }
  async function saveTerm(t, discount) {
    try { await callOwnerApi('save_billing_term', { ...t, discount_pct: Number(discount) }); toast.success('تم الحفظ'); setTerms(await callOwnerApi('list_billing_terms') || []); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {Object.entries(ORDER_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`h-9 px-4 rounded-xl text-sm font-bold ${status === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{v.label}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> : (
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-center text-gray-400 py-10">لا توجد طلبات</p>}
          {orders.map(o => (
            <div key={o.id} className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-gray-900">{o.tenants?.name || '—'} <span className="text-xs font-mono text-gray-400" dir="ltr">{o.order_number}</span></p>
                  <p className="text-xs text-gray-500 mt-1">
                    {o.quote?.plan_name} · {o.quote?.unlimited_branches ? 'فروع غير محدودة' : `${o.branches} فرع`} · {o.months} شهر · {o.method === 'transfer' ? 'تحويل بنكي' : o.method === 'card' ? 'بطاقة' : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1" dir="ltr">{o.tenants?.contact_phone || ''} {o.tenants?.contact_email ? `· ${o.tenants.contact_email}` : ''}</p>
                  {(o.transfer_sender || o.transfer_date || o.transfer_note) && (
                    <p className="text-xs text-gray-600 mt-1">المحوّل: {o.transfer_sender || '—'} · {o.transfer_date || ''} {o.transfer_note ? `· ${o.transfer_note}` : ''}</p>
                  )}
                  {o.review_note && <p className="text-xs text-red-600 mt-1">ملاحظة: {o.review_note}</p>}
                </div>
                <div className="text-left">
                  <p className="text-xl font-black text-gray-900">{fmtSAR(o.amount)}</p>
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS[o.status]?.cls}`}>{ORDER_STATUS[o.status]?.label}</span>
                  <p className="text-[11px] text-gray-400 mt-1">{fmtDate(o.submitted_at || o.created_at)}</p>
                </div>
              </div>
              {o.status === 'pending_review' && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {o.receipt_path && (
                    <button onClick={() => openReceipt(o)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-sm"><ExternalLink className="w-4 h-4" />عرض الإيصال</button>
                  )}
                  <button onClick={() => approve(o)} disabled={busyId === o.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />تأكيد الاستلام وتفعيل</button>
                  <button onClick={() => setRejecting(rejecting === o.id ? null : o.id)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-red-200 text-red-600 text-sm"><XCircle className="w-4 h-4" />رفض</button>
                  {rejecting === o.id && (
                    <div className="flex w-full gap-2">
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الرفض (يظهر للعميل) — مثال: المبلغ ناقص"
                        className="flex-1 h-9 rounded-xl border border-gray-300 px-3 text-sm" />
                      <button onClick={() => reject(o)} disabled={busyId === o.id} className="h-9 px-4 rounded-xl bg-red-600 text-white text-sm font-bold">إرسال</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="font-bold text-gray-900 mb-3">مدد الاشتراك والخصم</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {terms.map(t => (
            <TermEditor key={t.months} term={t} onSave={saveTerm} />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">الضريبة 15% تُضاف تلقائياً. سعر الفرع الإضافي يُضبط من تبويب "الفوترة الدورية" عند نشر نسخة سعر.</p>
      </div>
    </div>
  );
}

function TermEditor({ term, onSave }) {
  const [d, setD] = useState(term.discount_pct);
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <p className="text-sm font-bold">{term.label_ar || `${term.months} شهر`}</p>
      <div className="flex items-center gap-2 mt-2">
        <input type="number" min={0} max={90} value={d} onChange={e => setD(e.target.value)} className="w-20 h-8 rounded-lg border border-gray-300 px-2 text-sm" />
        <span className="text-xs text-gray-500">% خصم</span>
        <button onClick={() => onSave(term, d)} className="ms-auto h-8 px-3 rounded-lg bg-gray-900 text-white text-xs">حفظ</button>
      </div>
    </div>
  );
}

function TicketsTab({ tickets, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply]       = useState('');
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending]   = useState(false);

  async function openTicket(t) {
    setSelected(t);
    setLoadingMsgs(true);
    try {
      const msgs = await callOwnerApi('list_support_messages', { ticket_id: t.id });
      setMessages(msgs || []);
    } catch { setMessages([]); }
    setLoadingMsgs(false);
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      await callOwnerApi('reply_support_ticket', {
        ticket_id: selected.id, content: reply.trim(), status: 'answered',
      });
      setReply('');
      const msgs = await callOwnerApi('list_support_messages', { ticket_id: selected.id });
      setMessages(msgs || []);
      onRefresh?.();
    } catch (e) { alert('فشل إرسال الرد: ' + (e?.message || '')); }
    setSending(false);
  }

  async function closeTicket() {
    if (!selected) return;
    try {
      await callOwnerApi('update_ticket_status', { ticket_id: selected.id, status: 'closed' });
      setSelected(s => ({ ...s, status: 'closed' }));
      onRefresh?.();
    } catch { /* تجاهل */ }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
      {/* قائمة التذاكر */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-y-auto">
        {tickets.length === 0 && <p className="text-gray-400 text-sm p-4 text-center">لا توجد تذاكر دعم حالياً</p>}
        {tickets.map(t => (
          <button key={t.id} onClick={() => openTicket(t)}
            className={`w-full text-right p-4 border-b border-gray-200 hover:bg-gray-50/50 transition-colors ${selected?.id === t.id ? 'bg-gray-50' : ''}`}>
            <div className="flex items-start gap-2">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.status==='open'?'bg-red-500 animate-pulse':t.status==='answered'?'bg-amber-500':'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{t.subject || 'بدون عنوان'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.user_name || t.user_id} • {fmtDate(t.created_at)}</p>
              </div>
              {t.priority === 'high' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">عاجل</span>}
            </div>
          </button>
        ))}
      </div>

      {/* محادثة التذكرة */}
      <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">اختر تذكرة من القائمة لعرض المحادثة</div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-sm">{selected.subject || 'بدون عنوان'}</p>
                <p className="text-xs text-gray-400">{selected.user_name || selected.user_id}</p>
              </div>
              {selected.status !== 'closed' && (
                <button onClick={closeTicket} className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100">إغلاق التذكرة</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <p className="text-gray-400 text-sm text-center">جارٍ التحميل...</p>
              ) : messages.length === 0 ? (
                <p className="text-gray-400 text-sm text-center">لا توجد رسائل بعد</p>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.role === 'agent' ? 'bg-primary text-gray-900 rounded-tl-none' : 'bg-gray-50 text-gray-200 rounded-tr-none'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-200 flex gap-2">
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendReply()}
                placeholder="اكتب ردك هنا..."
                className="flex-1 h-10 bg-gray-50 border border-gray-300 rounded-xl px-3 text-sm text-gray-900 focus:outline-none focus:border-primary" />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="px-4 h-10 bg-primary text-gray-900 rounded-xl text-sm font-bold disabled:opacity-50">
                إرسال
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── تبويب الفريق والمحتوى — تعديل "من نحن" + إدارة حسابات فريق المنصة ──
function TeamAndContentTab() {
  const [dbStats, setDbStats] = useState(null);
  const [loadingDb, setLoadingDb] = useState(true);

  const [aboutContent, setAboutContent] = useState('');
  const [savingAbout, setSavingAbout]   = useState(false);
  const [loadingAbout, setLoadingAbout] = useState(true);

  const [team, setTeam]           = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'support', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    callOwnerApi('get_setting', { key: 'about_us_content' })
      .then((value) => { setAboutContent(value || ''); setLoadingAbout(false); })
      .catch(() => setLoadingAbout(false));
    loadTeam();
    callOwnerApi('db_overview').then(d => { setDbStats(d || {}); setLoadingDb(false); }).catch(() => setLoadingDb(false));
  }, []);

  async function loadTeam() {
    setLoadingTeam(true);
    try { setTeam(await callOwnerApi('list_team_members') || []); }
    catch { setTeam([]); }
    setLoadingTeam(false);
  }

  async function saveAbout() {
    setSavingAbout(true);
    try {
      await callOwnerApi('update_about_content', { content: aboutContent });
      toast.success('تم حفظ محتوى صفحة "من نحن" بنجاح');
    } catch (e) { toast.error('فشل الحفظ: ' + (e?.message || '')); }
    setSavingAbout(false);
  }

  async function addMember() {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      await callOwnerApi('add_team_member', form);
      setForm({ full_name: '', email: '', phone: '', role: 'support', notes: '' });
      await loadTeam();
      toast.success('تمت إضافة العضو بنجاح');
    } catch (e) { toast.error('فشل الإضافة: ' + (e?.message || '')); }
    setSaving(false);
  }

  async function toggleActive(m) {
    try {
      await callOwnerApi('update_team_member', { id: m.id, updates: { is_active: !m.is_active } });
      await loadTeam();
    } catch { /* تجاهل */ }
  }

  async function removeMember(id) {
    if (!confirm('تأكيد حذف هذا العضو؟')) return;
    try { await callOwnerApi('delete_team_member', { id }); await loadTeam(); }
    catch { /* تجاهل */ }
  }

  const ROLE_LABELS = { support: 'دعم فني', admin: 'إدارة', finance: 'مالية', developer: 'مطوّر' };

  return (
    <div className="space-y-8">
      {/* ── نظرة شاملة على قاعدة بيانات Supabase ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-gray-900 font-bold mb-1">نظرة شاملة على قاعدة البيانات</h3>
        <p className="text-gray-400 text-xs mb-4">عدد السجلات الفعلي الحالي في كل جدول رئيسي بالنظام</p>
        {loadingDb ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(dbStats || {}).map(([table, count]) => (
              <div key={table} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-primary">{count}</p>
                <p className="text-gray-400 text-[11px] mt-0.5 truncate" title={table}>{table}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── تعديل صفحة "من نحن" ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-gray-900 font-bold mb-1">محتوى صفحة "من نحن"</h3>
        <p className="text-gray-400 text-xs mb-4">هذا النص يظهر مباشرة في صفحة /about العامة للزوار</p>
        {loadingAbout ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : (
          <>
            <textarea value={aboutContent} onChange={e => setAboutContent(e.target.value)}
              rows={8}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-primary resize-none" />
            <button onClick={saveAbout} disabled={savingAbout}
              className="mt-3 px-5 h-10 bg-primary text-gray-900 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {savingAbout && <Loader2 className="w-4 h-4 animate-spin" />} حفظ المحتوى
            </button>
          </>
        )}
      </div>

      {/* ── إدارة فريق المنصة (إضافة/تعديل/حذف حسابات) ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-900 font-bold">فريق المنصة</h3>
            <p className="text-gray-400 text-xs mt-0.5">حسابات الأشخاص العاملين على منصة فلسي (دعم، إدارة، مطوّرين)</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="الاسم الكامل" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900" />
            <input placeholder="البريد الإلكتروني" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900" />
            <input placeholder="رقم الجوال" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900" />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900">
              <option value="support">دعم فني</option>
              <option value="admin">إدارة</option>
              <option value="finance">مالية</option>
              <option value="developer">مطوّر</option>
            </select>
            <input placeholder="ملاحظات (اختياري)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900 md:col-span-2" />
            <button type="button" onClick={addMember} disabled={saving || !form.full_name.trim()}
              className="h-10 bg-emerald-600 text-gray-900 rounded-lg text-sm font-bold md:col-span-2 disabled:opacity-50">
              {saving ? 'جارٍ الحفظ...' : 'حفظ العضو'}
            </button>
          </div>

        {loadingTeam ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : team.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">لا يوجد أعضاء فريق مُضافين بعد</p>
        ) : (
          <div className="space-y-2">
            {team.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.is_active ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                  <div>
                    <p className="text-gray-900 text-sm font-medium">{m.full_name}</p>
                    <p className="text-gray-400 text-xs">{ROLE_LABELS[m.role] || m.role} {m.email ? `• ${m.email}` : ''} {m.phone ? `• ${m.phone}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(m)} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-600">
                    {m.is_active ? 'إيقاف' : 'تفعيل'}
                  </button>
                  <button onClick={() => removeMember(m.id)} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-100">
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
