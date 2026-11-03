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

  const NAV_GROUPS = [
    { title: 'الرئيسية', items: [
      { id: 'overview', label: 'الرئيسية', desc: 'إحصائيات المنصة والتنبيهات', icon: BarChart3 },
    ]},
    { title: 'إدارة المنصة', items: [
      { id: 'clients', label: 'المنشآت', desc: 'إدارة الحسابات والاشتراكات', icon: Users },
      { id: 'finance', label: 'المالية', desc: 'الإيرادات والمدفوعات والفواتير', icon: Landmark },
      { id: 'team', label: 'فريق فلسي', desc: 'الأقسام والموظفون', icon: UserCog },
      { id: 'permissions', label: 'الصلاحيات', desc: 'الشاشات والعمليات المسموحة لكل موظف', icon: Shield },
    ]},
    { title: 'التشغيل والتقنية', items: [
      { id: 'tickets', label: 'الدعم الفني', desc: 'التذاكر وتوزيعها على الموظفين', icon: MessageSquare },
      { id: 'development', label: 'مركز المبرمجين', desc: 'الأعطال والبلاغات التقنية والإصلاحات', icon: Server },
    ]},
    { title: 'النمو والتوظيف', items: [
      { id: 'careers', label: 'الوظائف', desc: 'نشر الوظائف ومراجعة المتقدمين', icon: UserCog },
      { id: 'pricing', label: 'الخطط والأسعار', desc: 'التحكم في باقات وأسعار المنصة', icon: BadgeDollarSign },
    ]},
    { title: 'الموقع والظهور الرقمي', items: [
      { id: 'website', label: 'الموقع والمحتوى', desc: 'الصفحات والمحتوى والأسعار التسويقية', icon: Globe },
      { id: 'seo', label: 'SEO وGoogle', desc: 'Sitemap والبيانات المنظمة والفهرسة', icon: Search },
      { id: 'blog', label: 'المدونة والأخبار', desc: 'إدارة المقالات والأخبار', icon: Newspaper },
    ]},
    { title: 'إعدادات المنصة', items: [
      { id: 'settings', label: 'الإعدادات العامة', desc: 'إعدادات المنصة والتشغيل', icon: Settings },
      { id: 'broadcast', label: 'الإشعارات والتواصل', desc: 'التواصل مع المنشآت والعملاء', icon: Megaphone },
      { id: 'ai', label: 'مساعد فلسي الذكي', desc: 'إعدادات المساعد الذكي', icon: Bot },
    ]},
  ];
  const activeItem = NAV_GROUPS.flatMap(g => g.items).find(item => item.id === tab);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] text-slate-900">
      <div className="min-h-screen lg:flex">
        <aside className="w-full shrink-0 bg-[#17191f] text-white lg:sticky lg:top-0 lg:h-screen lg:w-[280px] lg:overflow-y-auto">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white"><LogoMark size={30} /></div>
            <div><p className="text-base font-black tracking-wide">FELSY</p><p className="mt-0.5 text-[10px] font-medium tracking-[.2em] text-slate-400">PLATFORM CONTROL</p></div>
          </div>
          <div className="px-5 py-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold tracking-[.18em] text-slate-400">مساحة العمل</p>
              <p className="mt-2 text-sm font-bold text-white">إدارة منصة فلسي</p>
              <p className="mt-1 text-xs text-slate-400">مالك المنصة · صلاحيات عليا</p>
            </div>
          </div>
          <nav className="space-y-6 px-3 pb-6" aria-label="قائمة إدارة المنصة">
            {NAV_GROUPS.map(group => (
              <section key={group.title}>
                <p className="px-3 pb-2 text-[10px] font-bold tracking-[.16em] text-slate-500">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <button key={item.id} onClick={() => setTab(item.id)}
                      aria-current={tab === item.id ? 'page' : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right transition-all ${tab === item.id ? 'bg-white text-[#17191f] shadow-lg shadow-black/10' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tab === item.id ? 'bg-[#e9e7e1] text-slate-900' : 'bg-white/[0.07] text-slate-300'}`}><item.icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{item.label}</span><span className={`mt-1 block truncate text-[10px] ${tab === item.id ? 'text-slate-500' : 'text-slate-500'}`}>{item.desc}</span></span>
                      {tab === item.id && <span className="h-1.5 w-1.5 rounded-full bg-[#b89b62]" />}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
          <div className="border-t border-white/10 px-5 py-4 text-[10px] text-slate-500">Felsy Platform · Secure owner session</div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-8">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[.18em] text-[#a38b5b]">FELSY / PLATFORM OWNER</p>
                <h1 className="mt-1 truncate text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{activeItem?.label || 'لوحة مالك المنصة'}</h1>
                <p className="mt-1 hidden text-xs text-slate-500 sm:block">{activeItem?.desc || 'مركز التحكم الرئيسي لمنصة فلسي'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 sm:inline-flex">جلسة مالك موثقة</span>
                <button onClick={loadAll} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">تحديث</span></button>
                <button onClick={logout} className="flex h-10 items-center gap-2 rounded-xl bg-[#20232b] px-3 text-xs font-bold text-white hover:bg-black"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">خروج</span></button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7 lg:p-9">
            {tab === 'overview' && stats && (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard icon={Users} label="إجمالي المنشآت" value={fmt(stats.totalClients)} color="bg-slate-100 text-slate-700" />
                <StatCard icon={CheckCircle2} label="المنشآت النشطة" value={fmt(stats.activeClients)} color="bg-emerald-50 text-emerald-700" />
                <StatCard icon={TrendingUp} label="إجمالي الإيرادات" value={fmtSAR(stats.totalRevenue)} color="bg-amber-50 text-amber-700" />
                <StatCard icon={MessageSquare} label="تذاكر مفتوحة" value={fmt(stats.openTickets)} color="bg-rose-50 text-rose-700" />
              </div>
            )}
            {loading && !['pricing','blog','broadcast','ai','billing','careers'].includes(tab) ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : (
              <div className="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_12px_45px_rgba(15,23,42,0.045)] sm:p-7">
                {tab === 'overview' && <OverviewTab stats={stats} clients={clients} />}
                {tab === 'orders' && <OrdersTab />}
                {tab === 'finance' && <BillingTab />}
                {tab === 'permissions' && <PlatformPermissionsTab />}
                {tab === 'development' && <DeveloperIncidentsTab />}
                {tab === 'careers' && <PlatformCareersTab />}
                {tab === 'website' && <PlatformWebsiteTab />}
                {tab === 'seo' && <PlatformSeoTab />}
                {tab === 'settings' && <PlatformSettingsTab />}
                {tab === 'pricing' && <PricingTab />}
                {tab === 'billing' && <BillingTab />}
                {tab === 'broadcast' && <BroadcastTab clients={clients} />}
                {tab === 'blog' && <BlogManager api={callOwnerApi} />}
                {tab === 'ai' && <AISettingsTab />}
                {tab === 'clients' && <SubscribersTab api={callOwnerApi} />}
                {tab === 'tickets' && <TicketsTab tickets={tickets} onRefresh={loadAll} />}
                {tab === 'team' && <TeamAndContentTab />}
              </div>
            )}
            <footer className="pb-4 text-center text-[10px] tracking-wide text-slate-400">© {new Date().getFullYear()} FELSY · PLATFORM MANAGEMENT</footer>
          </div>
        </main>
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
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'support', department: 'technical_support', job_title: '', notes: '' });
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
      setForm({ full_name: '', email: '', phone: '', role: 'support', department: 'technical_support', job_title: '', notes: '' });
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
  const DEPARTMENTS = [{value:'technical_support',label:'الدعم الفني'},{value:'software_development',label:'البرمجة والتطوير'},{value:'quality_assurance',label:'اختبار الجودة'},{value:'sales',label:'المبيعات'},{value:'marketing',label:'التسويق'},{value:'operations',label:'العمليات'},{value:'finance',label:'المالية'},{value:'management',label:'الإدارة'}];

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
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900">
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <input placeholder="المسمى الوظيفي (مثال: مهندس Backend)" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} className="h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900" />
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
                    <p className="text-gray-400 text-xs">{DEPARTMENTS.find(d => d.value === m.department)?.label || m.department || ROLE_LABELS[m.role] || m.role}{m.job_title ? ` • ${m.job_title}` : ''} {m.email ? `• ${m.email}` : ''} {m.phone ? `• ${m.phone}` : ''}</p>
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


const INCIDENT_LABELS = {
  category: { bug: 'خلل برمجي', outage: 'توقف خدمة', performance: 'بطء وأداء', security: 'أمن وحماية', deployment: 'نشر وتحديث', request: 'طلب تقني' },
  severity: { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' },
  status: { open: 'جديدة', triaged: 'تم الفرز', in_progress: 'قيد الإصلاح', blocked: 'متوقفة', resolved: 'تم الحل', closed: 'مغلقة' },
};

function DeveloperIncidentsTab() {
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'bug', severity: 'medium', affected_area: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [incidents, team] = await Promise.all([
        callOwnerApi('list_platform_incidents'),
        callOwnerApi('list_team_members'),
      ]);
      setItems(incidents || []);
      setMembers((team || []).filter(m => m.is_active && ['developer','admin'].includes(m.role)));
    } catch (e) { toast.error('تعذر تحميل سجل الأعطال: ' + (e?.message || '')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.description.trim()) return toast.error('أدخل عنوان المشكلة ووصفها');
    setSaving(true);
    try {
      await callOwnerApi('create_platform_incident', form);
      setForm({ title: '', description: '', category: 'bug', severity: 'medium', affected_area: '' });
      setShowForm(false);
      toast.success('تم تسجيل البلاغ في سجل أعطال المنصة');
      await load();
    } catch (e) { toast.error('تعذر تسجيل البلاغ: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  const update = async (id, updates) => {
    try { await callOwnerApi('update_platform_incident', { id, updates }); await load(); }
    catch (e) { toast.error('تعذر تحديث البلاغ: ' + (e?.message || '')); }
  };

  const counts = ['open','triaged','in_progress','blocked'].map(s => ({ status:s, count:items.filter(i=>i.status===s).length }));
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div><h2 className="text-xl font-black text-slate-900">مركز المبرمجين والأعطال</h2><p className="mt-1 text-sm text-slate-500">سجل مركزي للأخطاء والتوقفات والبلاغات التقنية، مع الأولوية وحالة المعالجة والتكليف</p></div>
      <div className="flex gap-2"><button onClick={load} className="rounded-xl border px-3 py-2 text-sm">تحديث</button><button onClick={()=>setShowForm(v=>!v)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">+ تسجيل مشكلة</button></div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{counts.map(x=><div key={x.status} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-slate-500">{INCIDENT_LABELS.status[x.status]}</p><p className="mt-1 text-2xl font-black">{x.count}</p></div>)}</div>
    {showForm && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <h3 className="font-bold">بلاغ تقني جديد</h3>
      <input className="w-full rounded-xl border bg-white p-3 text-sm" placeholder="عنوان المشكلة" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <textarea className="w-full rounded-xl border bg-white p-3 text-sm" rows={4} placeholder="خطوات إعادة المشكلة، النتيجة المتوقعة، والنتيجة الفعلية" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="rounded-xl border bg-white p-3 text-sm" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(INCIDENT_LABELS.category).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select className="rounded-xl border bg-white p-3 text-sm" value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}>{Object.entries(INCIDENT_LABELS.severity).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <input className="rounded-xl border bg-white p-3 text-sm" placeholder="الصفحة أو الجزء المتأثر" value={form.affected_area} onChange={e=>setForm({...form,affected_area:e.target.value})}/>
      </div>
      <div className="flex justify-end gap-2"><button onClick={()=>setShowForm(false)} className="rounded-xl border px-4 py-2 text-sm">إلغاء</button><button disabled={saving} onClick={create} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving?'جارٍ التسجيل...':'حفظ البلاغ'}</button></div>
    </div>}
    {loading ? <div className="py-12 text-center text-sm text-slate-500">جارٍ تحميل سجل الأعطال...</div> : items.length===0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><Server className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 font-bold">لا توجد بلاغات مسجلة</p><p className="mt-1 text-xs text-slate-500">يمكن تسجيل الخلل هنا ليظهر لفريق التطوير.</p></div> :
      <div className="space-y-3">{items.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{item.title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px]">{INCIDENT_LABELS.category[item.category]||item.category}</span><span className={`rounded-full px-2 py-1 text-[10px] ${item.severity==='critical'?'bg-red-100 text-red-700':item.severity==='high'?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-600'}`}>{INCIDENT_LABELS.severity[item.severity]||item.severity}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.description}</p><p className="mt-2 text-xs text-slate-400">{item.affected_area||'لم يحدد الجزء المتأثر'} · {fmtDate(item.created_at)}</p></div>
          <div className="flex shrink-0 flex-col gap-2 sm:w-44"><select className="rounded-lg border p-2 text-xs" value={item.status} onChange={e=>update(item.id,{status:e.target.value})}>{Object.entries(INCIDENT_LABELS.status).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select className="rounded-lg border p-2 text-xs" value={item.assigned_to||''} onChange={e=>update(item.id,{assigned_to:e.target.value||null})}><option value="">غير مسند</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
        </div>
      </article>)}</div>}
  </div>;
}

function PlatformPermissionsTab() {
  const [team,setTeam]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{callOwnerApi('list_team_members').then(setTeam).catch(e=>toast.error(e.message)).finally(()=>setLoading(false));},[]);
  return <div className="space-y-5"><div><h2 className="text-xl font-black">صلاحيات فريق المنصة</h2><p className="mt-1 text-sm text-slate-500">مراجعة الأعضاء والأدوار. تفعيل الحجب الفعلي لكل شاشة يتطلب ربط هذه الصلاحيات بحارس المسارات وواجهات الخادم قبل منح حسابات الموظفين.</p></div>
    {loading?<p className="py-8 text-center text-sm text-slate-500">جارٍ التحميل...</p>:team.map(m=><div key={m.id} className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-bold">{m.full_name}</p><p className="text-xs text-slate-500">{m.department||m.role} · {m.job_title||'بدون مسمى'}</p></div><span className={`rounded-full px-3 py-1 text-xs ${m.is_active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{m.is_active?'نشط':'موقوف'}</span></div>)}
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">تنبيه أمني: لا تمنح موظفًا دخولًا فعليًا قبل اكتمال تسجيل الدخول الفردي وربط كل عملية بصلاحيات الخادم.</div>
  </div>;
}
function PlatformCareersTab() {
  const blank = { id:'', title:'', slug:'', summary:'', department:'', employment_type:'FULL_TIME', workplace_type:'ONSITE', location:'', country:'SA', applicant_country:'Saudi Arabia', description:'', responsibilities:'', requirements:'', preferred_qualifications:'', benefits:'', salary_min:'', salary_max:'', salary_currency:'SAR', salary_period:'MONTH', valid_through:'', status:'draft' };
  const [view,setView]=useState('jobs'), [jobs,setJobs]=useState([]), [applications,setApplications]=useState([]);
  const [form,setForm]=useState(blank), [editing,setEditing]=useState(false), [showForm,setShowForm]=useState(false);
  const [loadingData,setLoadingData]=useState(true), [saving,setSaving]=useState(false), [search,setSearch]=useState(''), [filter,setFilter]=useState('all');
  const load=async()=>{setLoadingData(true);try{const values=await Promise.all([callOwnerApi('list_job_posts'),callOwnerApi('list_job_applications')]);setJobs(values[0]||[]);setApplications(values[1]||[]);}catch(e){toast.error(e.message||'تعذر تحميل بيانات التوظيف');}finally{setLoadingData(false);}};
  useEffect(()=>{load();},[]);
  const startNew=()=>{setForm(blank);setEditing(false);setShowForm(true);};
  const startEdit=(job)=>{setForm({...blank,...job,salary_min:job.salary_min??'',salary_max:job.salary_max??'',valid_through:job.valid_through||''});setEditing(true);setShowForm(true);window.scrollTo({top:0,behavior:'smooth'});};
  const update=(key,value)=>setForm(v=>({...v,[key]:value}));
  async function saveJob(e){e.preventDefault();if(!form.title.trim()||form.description.trim().length<20){toast.error('أدخل المسمى الوظيفي ووصفاً واضحاً لا يقل عن 20 حرفاً');return;}setSaving(true);try{await callOwnerApi('save_job_post',{...form,salary_min:form.salary_min===''?null:Number(form.salary_min),salary_max:form.salary_max===''?null:Number(form.salary_max)});toast.success(form.status==='published'?'تم حفظ الوظيفة ونشرها':'تم حفظ مسودة الوظيفة');setShowForm(false);setForm(blank);setEditing(false);await load();}catch(e){toast.error(e.message||'تعذر حفظ الوظيفة');}finally{setSaving(false);}}
  async function changeStatus(id,status){const job=jobs.find(x=>x.id===id);if(!job)return;try{await callOwnerApi('save_job_post',{...job,status});toast.success(status==='published'?'تم نشر الوظيفة':status==='closed'?'تم إغلاق الوظيفة':'تم حفظ المسودة');await load();}catch(e){toast.error(e.message);}}
  async function removeJob(job){if(!window.confirm('هل تريد حذف إعلان الوظيفة؟'))return;try{await callOwnerApi('delete_job_post',{id:job.id});toast.success('تم حذف الوظيفة');await load();}catch(e){toast.error(e.message);}}
  async function changeApplicationStatus(id,status){try{await callOwnerApi('update_job_application',{id,status});setApplications(rows=>rows.map(x=>x.id===id?{...x,status}:x));toast.success('تم تحديث حالة المتقدم');}catch(e){toast.error(e.message);}}
  async function openResume(id){try{const url=await callOwnerApi('job_resume_url',{id});window.open(url,'_blank','noopener,noreferrer');}catch(e){toast.error(e.message||'تعذر فتح السيرة الذاتية');}}
  const filteredJobs=jobs.filter(j=>(filter==='all'||j.status===filter)&&(!search||[j.title,j.department,j.location].some(x=>String(x||'').toLowerCase().includes(search.toLowerCase()))));
  const filteredApps=applications.filter(a=>!search||[a.full_name,a.email,a.phone,a.job_posts?.title].some(x=>String(x||'').toLowerCase().includes(search.toLowerCase())));
  const statusLabels={draft:'مسودة',published:'منشورة',closed:'مغلقة'}, appLabels={received:'جديد',reviewing:'قيد المراجعة',shortlisted:'مرشح',rejected:'مرفوض',hired:'تم التوظيف'};
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black">إدارة التوظيف</h2><p className="mt-1 text-sm text-slate-500">أنشئ الوظائف، انشرها على صفحة التوظيف، وتابع طلبات المتقدمين من مكان واحد.</p></div><a href="/careers" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50"><ExternalLink className="h-4 w-4"/> صفحة الوظائف العامة</a></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['كل الوظائف',jobs.length],['منشورة',jobs.filter(j=>j.status==='published').length],['مسودات',jobs.filter(j=>j.status==='draft').length],['طلبات التقديم',applications.length]].map(([label,value])=><div key={label} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{fmt(value)}</p></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1"><button onClick={()=>{setView('jobs');setShowForm(false);}} className={'rounded-lg px-4 py-2 text-sm font-bold '+(view==='jobs'?'bg-white shadow':'text-slate-500')}>إعلانات الوظائف ({jobs.length})</button><button onClick={()=>{setView('applications');setShowForm(false);}} className={'rounded-lg px-4 py-2 text-sm font-bold '+(view==='applications'?'bg-white shadow':'text-slate-500')}>المتقدمون ({applications.length})</button></div>
      <div className="flex flex-wrap gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو الوظيفة..." className="h-10 w-56 rounded-xl border px-3 text-sm outline-none focus:border-slate-400"/>{view==='jobs'&&<button onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4"/> إضافة وظيفة</button>}<button onClick={load} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><RefreshCw className="h-4 w-4"/> تحديث</button></div>
    </div>
    {view==='jobs'&&showForm&&<form onSubmit={saveJob} className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">{editing?'تعديل الوظيفة':'إضافة وظيفة جديدة'}</h3><p className="text-xs text-slate-500">كل وظيفة منشورة تحصل على صفحة مستقلة برابط خاص.</p></div><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border p-2" aria-label="إغلاق"><X className="h-4 w-4"/></button></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-bold">المسمى الوظيفي<input required value={form.title} onChange={e=>update('title',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal" placeholder="مثال: مطور واجهات أمامية"/></label>
        <label className="space-y-1 text-sm font-bold">القسم<input value={form.department} onChange={e=>update('department',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal" placeholder="التقنية، التسويق، المبيعات..."/></label>
        <label className="space-y-1 text-sm font-bold">رابط الصفحة<input value={form.slug} onChange={e=>update('slug',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal" placeholder="يُنشأ تلقائياً من المسمى"/></label>
        <label className="space-y-1 text-sm font-bold">الموقع<input value={form.location} onChange={e=>update('location',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal" placeholder="جدة، الرياض، عن بُعد..."/></label>
        <label className="space-y-1 text-sm font-bold">نوع الدوام<select value={form.employment_type} onChange={e=>update('employment_type',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"><option value="FULL_TIME">دوام كامل</option><option value="PART_TIME">دوام جزئي</option><option value="CONTRACTOR">متعاون</option><option value="CONTRACT">عقد</option></select></label>
        <label className="space-y-1 text-sm font-bold">مكان العمل<select value={form.workplace_type} onChange={e=>update('workplace_type',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"><option value="ONSITE">من مقر الشركة</option><option value="REMOTE">عن بُعد</option><option value="HYBRID">هجين</option></select></label>
        <label className="space-y-1 text-sm font-bold">حالة الإعلان<select value={form.status} onChange={e=>update('status',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"><option value="draft">مسودة</option><option value="published">نشر الآن</option><option value="closed">مغلق</option></select></label>
        <label className="space-y-1 text-sm font-bold">آخر موعد للتقديم<input type="date" value={form.valid_through||''} onChange={e=>update('valid_through',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"/></label>
      </div>
      <label className="block space-y-1 text-sm font-bold">نبذة مختصرة<textarea value={form.summary||''} onChange={e=>update('summary',e.target.value)} rows={2} className="w-full rounded-xl border bg-white p-3 font-normal" placeholder="ملخص يظهر في بطاقة الوظيفة"/></label>
      <label className="block space-y-1 text-sm font-bold">الوصف الوظيفي بالتفصيل <span className="font-normal text-slate-500">(مطلوب)</span><textarea required minLength={20} value={form.description} onChange={e=>update('description',e.target.value)} rows={5} className="w-full rounded-xl border bg-white p-3 font-normal" placeholder="اكتب نبذة الوظيفة والهدف منها..."/></label>
      <div className="grid gap-3 md:grid-cols-2">{[['responsibilities','المهام والمسؤوليات'],['requirements','المتطلبات والمؤهلات'],['preferred_qualifications','المؤهلات المفضلة'],['benefits','المزايا الوظيفية']].map(([key,label])=><label key={key} className="space-y-1 text-sm font-bold">{label}<textarea value={form[key]||''} onChange={e=>update(key,e.target.value)} rows={4} className="w-full rounded-xl border bg-white p-3 font-normal" placeholder="اكتب كل نقطة في سطر مستقل..."/></label>)}</div>
      <div className="grid gap-3 md:grid-cols-3"><label className="space-y-1 text-sm font-bold">الحد الأدنى للراتب<input type="number" min="0" value={form.salary_min} onChange={e=>update('salary_min',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"/></label><label className="space-y-1 text-sm font-bold">الحد الأعلى للراتب<input type="number" min="0" value={form.salary_max} onChange={e=>update('salary_max',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"/></label><label className="space-y-1 text-sm font-bold">فترة الراتب<select value={form.salary_period} onChange={e=>update('salary_period',e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal"><option value="MONTH">شهري</option><option value="YEAR">سنوي</option><option value="HOUR">بالساعة</option></select></label></div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button type="button" onClick={()=>setShowForm(false)} className="rounded-xl border bg-white px-5 py-2.5 text-sm font-bold">إلغاء</button><button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{form.status==='published'?'حفظ ونشر الوظيفة':'حفظ الوظيفة'}</button></div>
    </form>}
    {loadingData?<div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400"/></div>:view==='jobs'?<div className="space-y-3">
      <div className="flex flex-wrap gap-2">{[['all','الكل'],['published','منشورة'],['draft','مسودات'],['closed','مغلقة']].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={'rounded-full px-3 py-1.5 text-xs font-bold '+(filter===v?'bg-slate-900 text-white':'bg-slate-100 text-slate-600')}>{l}</button>)}</div>
      {!filteredJobs.length?<div className="rounded-2xl border border-dashed p-10 text-center"><UserCog className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 font-bold">لا توجد وظائف في هذا التصنيف</p><p className="mt-1 text-sm text-slate-500">اضغط إضافة وظيفة لإنشاء أول إعلان وظيفي.</p></div>:filteredJobs.map(job=><article key={job.id} className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{job.title}</h3><span className={'rounded-full px-2.5 py-1 text-[10px] font-bold '+(job.status==='published'?'bg-emerald-50 text-emerald-700':job.status==='closed'?'bg-slate-200 text-slate-600':'bg-amber-50 text-amber-700')}>{statusLabels[job.status]}</span></div><p className="mt-1 text-xs text-slate-500">{job.department||'بدون قسم'} · {job.location||'الموقع غير محدد'} · {fmtDate(job.created_at)}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">{job.summary||job.description}</p></div>
        <div className="flex shrink-0 flex-wrap gap-2">{job.status==='published'&&<a href={'/careers/'+encodeURIComponent(job.slug)} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-bold">عرض الصفحة</a>}<button onClick={()=>startEdit(job)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5"/> تعديل</button>{job.status!=='published'&&<button onClick={()=>changeStatus(job.id,'published')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">نشر</button>}{job.status==='published'&&<button onClick={()=>changeStatus(job.id,'closed')} className="rounded-lg border px-3 py-2 text-xs font-bold">إغلاق</button>}<button onClick={()=>removeJob(job)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5"/></button></div>
      </article>)}
    </div>:<div className="space-y-3">{!filteredApps.length?<div className="rounded-2xl border border-dashed p-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 font-bold">لا توجد طلبات تقديم حتى الآن</p></div>:filteredApps.map(app=><article key={app.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{app.full_name}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px]">{appLabels[app.status]||app.status}</span></div><p className="mt-1 text-sm text-slate-600">{app.job_posts?.title||'وظيفة محذوفة'} · {fmtDate(app.created_at)}</p><p className="mt-1 break-all text-xs text-slate-500">{app.email} {app.phone?'· '+app.phone:''} {app.location?'· '+app.location:''}</p><p className="mt-2 text-xs text-slate-500">{app.university||'—'} · {app.major||'—'} · {app.experience_years??0} سنوات خبرة</p>{(app.languages?.length>0||app.skills?.length>0)&&<p className="mt-2 text-xs text-slate-600">اللغات: {(app.languages||[]).join('، ')} · المهارات: {(app.skills||[]).join('، ')}</p>}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><select value={app.status} onChange={e=>changeApplicationStatus(app.id,e.target.value)} className="h-10 rounded-lg border px-3 text-xs font-bold">{Object.entries(appLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{app.resume_path&&<button onClick={()=>openResume(app.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white"><FileText className="h-4 w-4"/> السيرة الذاتية</button>}</div>
    </div></article>)}</div>}
  </div>;
}
function PlatformWebsiteTab() { return <div className="space-y-3"><h2 className="text-xl font-black">الموقع والمحتوى</h2><p className="text-sm text-slate-500">إدارة نصوص الموقع التسويقي والأسعار والصفحات. التعديل المباشر للصفحات غير مربوط بالكامل بلوحة المالك حتى الآن.</p><a className="inline-flex rounded-xl border px-4 py-2 text-sm font-bold" href="https://felsy.org" target="_blank" rel="noreferrer">فتح الموقع التسويقي</a></div>; }
function PlatformSeoTab() { return <div className="space-y-3"><h2 className="text-xl font-black">SEO وظهور Google</h2><p className="text-sm text-slate-500">إدارة Sitemap وبيانات Schema ومتابعة الفهرسة. لا توجد حاليًا وصلة Search Console موثقة داخل لوحة المالك، لذلك لا تعرض هذه الشاشة حالة فهرسة غير متحققة.</p><a className="inline-flex rounded-xl border px-4 py-2 text-sm font-bold" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">فتح Google Search Console</a></div>; }
function PlatformSettingsTab() { return <div className="space-y-3"><h2 className="text-xl font-black">إعدادات المنصة العامة</h2><p className="text-sm text-slate-500">إعدادات المساعد الذكي والمحتوى متاحة حاليًا ضمن تبويباتها. إعدادات البريد والتنبيهات والتكاملات العامة تحتاج واجهات ربط مستقلة.</p></div>; }
