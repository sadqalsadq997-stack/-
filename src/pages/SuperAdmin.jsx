import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PLANS } from '@/lib/pricingPlans';
import { hmacSign, sha256, maskSensitive } from '@/lib/security/crypto';
import {
  Crown, Users, Globe, BarChart3, DollarSign, Calendar,
  Shield, Bell, Search, RefreshCw, Loader2, CheckCircle2,
  XCircle, AlertTriangle, MessageSquare, Eye, EyeOff, Lock,
  LogOut, FileText, Activity, Server, Database, Pencil, Trash2,
  Send, Plus, Settings, Tag, BadgeDollarSign, Megaphone,
  Wifi, WifiOff, AlertCircle, Newspaper, Bot, Check, X,
  CreditCard, Sparkles, TrendingUp, Copy, UserCog
} from 'lucide-react';
import { toast } from 'sonner';

const fmt    = (n) => Number(n || 0).toLocaleString('ar-SA');
const fmtSAR = (n) => `${fmt(n)} ر.س`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-SA') : '—';

// ── اسم مساعد الدعم الذكي — قابل للتغيير من المدير ────────────
const DEFAULT_AI_NAME = 'فلسي مساعد';

const SESSION_KEY  = '_sa_tok';
const SESSION_MAX  = 4 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;

// ── استدعاء دالة owner-admin-api — تتجاوز RLS بأمان فقط لجلسة صاحب
// النظام الموثَّقة (لا تتأثر بعزل tenant_id الخاص بالعملاء العاديين) ──
async function callOwnerApi(action, payload) {
  let ownerToken = '';
  try {
    const raw = JSON.parse(atob(sessionStorage.getItem(SESSION_KEY) || ''));
    ownerToken = raw?.token || '';
  } catch { /* لا توجد جلسة صالحة */ }
  const { data, error } = await supabase.functions.invoke('owner-admin-api', {
    body: { ownerToken, action, payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
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
      {sub && <p className="text-xs text-green-400 font-bold mt-1">{sub}</p>}
    </div>
  );
}

// ── شاشة تسجيل الدخول ──────────────────────────────────────────
function OwnerLogin({ onLogin }) {
  const [pin, setPin]       = useState('');
  const [show, setShow]     = useState(false);
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(() => parseInt(localStorage.getItem('_sa_lock')||'0'));
  const [attempts, setAttempts]       = useState(() => parseInt(sessionStorage.getItem('_sa_att')||'0'));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p+1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  const isLocked  = lockedUntil > Date.now();

  async function handleLogin() {
    if (isLocked || loading || !pin) return;
    setLoading(true); setErr('');
    try {
      const pinHash = await sha256(pin + ':felsy-owner');
      const nonce   = Date.now().toString(36);
      const sig     = await hmacSign(`${pinHash}:${nonce}`, pin);
      const { data, error } = await supabase.functions.invoke('verify-owner-pin', { body: { hash: pinHash, nonce, sig } });
      if (error || !data?.token) throw new Error('فشل');
      sessionStorage.setItem(SESSION_KEY, btoa(JSON.stringify({ token: data.token, exp: Date.now() + SESSION_MAX })));
      sessionStorage.removeItem('_sa_att');
      localStorage.removeItem('_sa_lock');
      onLogin();
    } catch {
      const na = attempts + 1;
      setAttempts(na);
      sessionStorage.setItem('_sa_att', na.toString());
      if (na >= MAX_ATTEMPTS) {
        const t = Date.now() + LOCKOUT_MS;
        localStorage.setItem('_sa_lock', t.toString());
        setLockedUntil(t);
        setErr(`الحساب مقفول ${Math.ceil(LOCKOUT_MS/60000)} دقيقة`);
      } else {
        setErr(`رمز خاطئ — ${MAX_ATTEMPTS - na} محاولة متبقية`);
      }
      setPin('');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4" dir="rtl">
      <div className="bg-white border border-gray-200 rounded-3xl p-10 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8 text-gray-900" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">لوحة مالك النظام</h1>
          <p className="text-gray-400 text-sm mt-1">فلسي — الداخلية</p>
        </div>
        {isLocked ? (
          <div className="text-center py-6">
            <Lock className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-400 font-bold">الحساب مقفول</p>
            <p className="text-gray-400 text-sm mt-1">انتظر {remaining} ثانية</p>
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
            {err && <p className="text-red-400 text-sm text-center">{err}</p>}
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Users}       label="إجمالي العملاء"  value={fmt(stats.totalClients)}   color="bg-blue-900 text-blue-400" />
          <StatCard icon={CheckCircle2}label="نشطون"           value={fmt(stats.activeClients)}  color="bg-green-900 text-green-400" />
          <StatCard icon={DollarSign}  label="الإيرادات"       value={fmtSAR(stats.totalRevenue)}color="bg-amber-900 text-amber-400" />
          <StatCard icon={MessageSquare} label="تذاكر مفتوحة"  value={fmt(stats.openTickets)}   color="bg-red-900 text-red-400" />
          <StatCard icon={Shield}      label="رموز متاحة"      value={fmt(stats.unusedCodes)}   color="bg-violet-900 text-violet-400" />
        </div>
      )}

      {/* مراقبة الفروع */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
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
                      <span className="flex items-center gap-1 text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded-lg">
                        <AlertCircle className="w-3 h-3" /> خلل مكتشف
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded-lg">
                        <Wifi className="w-3 h-3" /> يعمل
                      </span>
                    )}
                    {owner && (
                      <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded-lg">نشط</span>
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
    supabase.from('subscription_plans').select('*').order('sort_order')
      .then(({ data }) => { setPlans(data||[]); setLoading(false); });
  }, []);

  async function savePlan(plan) {
    const { id, ...rest } = plan;
    if (id) { await supabase.from('subscription_plans').update(rest).eq('id', id); }
    else     { await supabase.from('subscription_plans').insert(rest); }
    const { data } = await supabase.from('subscription_plans').select('*').order('sort_order');
    setPlans(data||[]);
    setEditing(null);
    toast.success('تم حفظ الخطة');
  }

  async function deletePlan(id) {
    if (!confirm('حذف الخطة؟')) return;
    await supabase.from('subscription_plans').delete().eq('id', id);
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
                  <button onClick={() => deletePlan(p.id)} className="p-1.5 hover:bg-red-900/50 rounded-lg text-gray-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-white rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">شهري</p>
                  <p className="text-lg font-black text-amber-400">{fmtSAR(p.price_monthly)}</p>
                </div>
                <div className="flex-1 bg-white rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">سنوي</p>
                  <p className="text-lg font-black text-green-400">{fmtSAR(p.price_yearly)}</p>
                </div>
              </div>
              {p.features?.length > 0 && (
                <ul className="space-y-1">
                  {p.features.slice(0,4).map((f,i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-500">
                      <Check className="w-3 h-3 text-green-400 flex-shrink-0" />{f}
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
            <label className="text-xs text-gray-500 mb-1 block">{l} (ر.س)</label>
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
      const { error } = await supabase.from('owner_notifications').insert(msgs);
      if (error) throw error;
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
          <Megaphone className="w-4 h-4 text-amber-400" /> إرسال رسالة جماعية
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
        <div className="bg-green-900/20 border border-green-800/50 rounded-2xl p-4">
          <p className="text-green-400 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> تم الإرسال لـ {sent.length} مالك بنجاح
          </p>
        </div>
      )}
    </div>
  );
}

// ── ٤. المدونة والأخبار مع SEO ───────────────────────────────
function BlogTab() {
  const [posts, setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('blog_posts').select('*').order('published_at', { ascending: false });
    setPosts(data||[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function savePost(post) {
    const { id, ...rest } = post;
    // توليد slug تلقائي من العنوان
    if (!rest.slug) {
      rest.slug = rest.title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'').slice(0,80);
    }
    if (id) { await supabase.from('blog_posts').update(rest).eq('id', id); }
    else     { await supabase.from('blog_posts').insert({ ...rest, published_at: new Date().toISOString() }); }
    await load();
    setEditing(null);
    toast.success('تم حفظ المقالة');
  }

  async function deletePost(id) {
    if (!confirm('حذف المقالة؟')) return;
    await supabase.from('blog_posts').delete().eq('id', id);
    await load();
  }

  async function togglePublish(p) {
    await supabase.from('blog_posts').update({ published: !p.published }).eq('id', p.id);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-blue-400" /> المدونة والأخبار
        </h3>
        <button onClick={() => setEditing({ title:'', content:'', excerpt:'', slug:'', category:'news', seo_title:'', seo_description:'', published:false })}
          className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> مقالة جديدة
        </button>
      </div>

      {editing && (
        <BlogForm post={editing} onSave={savePost} onCancel={() => setEditing(null)} />
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">لا توجد مقالات — أنشئ أول مقالة</div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.category==='news' ? 'bg-blue-900/50 text-blue-300' : 'bg-violet-900/50 text-violet-300'
                  }`}>{p.category==='news'?'خبر':'مقالة'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.published ? 'bg-green-900/50 text-green-300' : 'bg-gray-50 text-gray-400'}`}>
                    {p.published ? 'منشور' : 'مسودة'}
                  </span>
                  {p.slug && <span className="text-xs text-gray-500 font-mono">/{p.slug}</span>}
                </div>
                <h4 className="font-bold text-gray-900 text-sm">{p.title}</h4>
                {p.excerpt && <p className="text-xs text-gray-400 line-clamp-2">{p.excerpt}</p>}
                <p className="text-xs text-gray-500">{fmtDate(p.published_at)}</p>
                {/* SEO */}
                {p.seo_title && (
                  <div className="mt-2 bg-gray-50 rounded-xl p-2.5 space-y-0.5">
                    <p className="text-xs text-blue-400 font-medium">SEO: {p.seo_title}</p>
                    <p className="text-xs text-gray-400 line-clamp-1">{p.seo_description}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setEditing(p)} className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => togglePublish(p)} className={`p-1.5 rounded-lg ${p.published?'text-green-400 hover:bg-green-900/20':'text-gray-400 hover:bg-gray-50'}`}>
                  {p.published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => deletePost(p.id)} className="p-1.5 hover:bg-red-900/20 rounded-lg text-gray-500 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlogForm({ post, onSave, onCancel }) {
  const [form, setForm] = useState({ ...post });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const [tab, setTab] = useState('content'); // content | seo

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-4">
      <div className="flex gap-1 bg-white p-1 rounded-xl">
        {[['content','المحتوى'],['seo','SEO']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab===id ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'content' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">العنوان <span className="text-red-500">*</span></label>
              <input value={form.title||''} onChange={e => set('title',e.target.value)}
                className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">التصنيف</label>
              <select value={form.category||'news'} onChange={e => set('category',e.target.value)}
                className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500">
                <option value="news">خبر</option>
                <option value="article">مقالة</option>
                <option value="update">تحديث</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ملخص قصير</label>
            <textarea value={form.excerpt||''} onChange={e => set('excerpt',e.target.value)} rows={2}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">المحتوى الكامل</label>
            <textarea value={form.content||''} onChange={e => set('content',e.target.value)} rows={8}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none font-mono" />
          </div>
        </div>
      )}

      {tab === 'seo' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Slug (رابط المقالة)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">/blog/</span>
              <input value={form.slug||''} onChange={e => set('slug',e.target.value.toLowerCase().replace(/\s+/g,'-'))}
                placeholder="my-article-title"
                className="flex-1 h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500 font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">عنوان SEO (meta title) — أقل من 60 حرف</label>
            <input value={form.seo_title||''} onChange={e => set('seo_title',e.target.value.slice(0,60))}
              className="w-full h-9 bg-white border border-gray-300 rounded-xl px-3 text-gray-900 text-sm focus:outline-none focus:border-red-500" />
            <p className="text-xs text-gray-500 mt-1">{(form.seo_title||'').length}/60 حرف</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">وصف SEO (meta description) — أقل من 160 حرف</label>
            <textarea value={form.seo_description||''} onChange={e => set('seo_description',e.target.value.slice(0,160))} rows={3}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-red-500 resize-none" />
            <p className="text-xs text-gray-500 mt-1">{(form.seo_description||'').length}/160 حرف</p>
          </div>
          {/* معاينة Google */}
          {(form.seo_title||form.title) && (
            <div className="bg-white rounded-xl p-3 space-y-1">
              <p className="text-xs text-gray-400 mb-2">معاينة Google</p>
              <p className="text-blue-400 text-sm">felsy.sa › blog › {form.slug||'slug'}</p>
              <p className="text-gray-900 text-sm font-medium">{form.seo_title||form.title}</p>
              <p className="text-gray-500 text-xs line-clamp-2">{form.seo_description||form.excerpt||'وصف المقالة...'}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="pub" checked={form.published||false} onChange={e => set('published',e.target.checked)} />
            <label htmlFor="pub" className="text-sm text-gray-700">نشر مباشرة</label>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">إلغاء</button>
        <button onClick={() => { if (!form.title) return toast.error('العنوان مطلوب'); onSave(form); }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded-xl text-sm">حفظ</button>
      </div>
    </div>
  );
}

// ── ٥. إعدادات مساعد الذكاء الاصطناعي ───────────────────────
function AISettingsTab() {
  const [name, setName]       = useState('');
  const [persona, setPersona] = useState('');
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key','ai_assistant').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setName(v.name || DEFAULT_AI_NAME);
          setPersona(v.persona || '');
        } else {
          setName(DEFAULT_AI_NAME);
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    const { error } = await supabase.from('system_settings').upsert({
      key: 'ai_assistant',
      value: JSON.stringify({ name, persona }),
    }, { onConflict: 'key' });
    if (error) { toast.error('فشل الحفظ'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast.success('تم حفظ إعدادات المساعد');
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" /> إعدادات مساعد الدعم الذكي
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
  const [form, setForm] = useState({ plan_code: planCode || '', name_ar: '', price_monthly: 0, features: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.plan_code || !form.name_ar || !form.price_monthly) {
      toast.error('يرجى تعبئة كل الحقول'); return;
    }
    setSaving(true);
    try {
      // جلب أعلى نسخة حالية لنفس الخطة لتحديد النسخة التالية
      const { data: existing } = await supabase.from('billing_plans')
        .select('version').eq('plan_code', form.plan_code).order('version', { ascending: false }).limit(1);
      const nextVersion = (existing?.[0]?.version || 0) + 1;

      // تعطيل النسخة القديمة (لا حذف، فقط is_active = false) — العقود
      // القائمة تستمر بالعمل لأنها مرتبطة بـ billing_plan_id ثابت
      await supabase.from('billing_plans').update({ is_active: false }).eq('plan_code', form.plan_code);

      const { error } = await supabase.from('billing_plans').insert({
        plan_code: form.plan_code,
        version: nextVersion,
        name_ar: form.name_ar,
        price_monthly: Number(form.price_monthly),
        features: form.features.split('\n').filter(Boolean),
        is_active: true,
      });
      if (error) throw error;
      toast.success(`تم نشر السعر الجديد كنسخة #${nextVersion} — المشتركون الحاليون لن يتأثروا`);
      onSaved?.();
    } catch (err) {
      toast.error('فشل الحفظ: ' + err.message);
    }
    setSaving(false);
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-3">
      <p className="text-xs text-amber-400 bg-amber-950/40 border border-amber-900/50 rounded-xl p-2.5">
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
          <label className="text-xs text-gray-500 mb-1 block">السعر الشهري الجديد (ر.س)</label>
          <input type="number" value={form.price_monthly} onChange={e => set('price_monthly', e.target.value)}
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
      const { error } = await supabase.from('billing_promotions').insert({
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
      if (error) throw error;
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
          <label className="text-xs text-gray-500 mb-1 block">سعر فترة العرض (ر.س)</label>
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
      supabase.from('billing_plans').select('*').order('plan_code').order('version', { ascending: false }),
      supabase.from('billing_promotions').select('*').order('created_at', { ascending: false }),
      callOwnerApi('list_tenant_subscriptions').catch(() => []),
      callOwnerApi('list_billing_invoices').catch(() => []),
    ]);
    setBillingPlans(plans || []);
    setPromotions(promos || []);
    setSubscriptions(subs || []);
    setInvoices(invs || []);
    setLoading(false);
  }

  const activePlans = billingPlans.filter(p => p.is_active);
  const totalMRR = subscriptions
    .filter(s => ['active', 'trialing'].includes(s.status))
    .reduce((sum, s) => sum + Number(s.next_charge_amount || 0), 0);

  const statusLabel = { trialing: 'بفترة العرض', active: 'فعّال', past_due: 'متأخر بالدفع', suspended: 'معلّق', cancelled: 'ملغي' };
  const statusColor = {
    trialing: 'bg-blue-950 text-blue-300', active: 'bg-emerald-950 text-emerald-300',
    past_due: 'bg-amber-950 text-amber-300', suspended: 'bg-red-950 text-red-300', cancelled: 'bg-gray-50 text-gray-500',
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">إيراد شهري متكرر متوقع (MRR)</p>
          <p className="text-xl font-black text-emerald-400">{fmtSAR(totalMRR)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">اشتراكات نشطة</p>
          <p className="text-xl font-black text-gray-900">{subscriptions.filter(s => ['active','trialing'].includes(s.status)).length}</p>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">متأخرة/معلّقة</p>
          <p className="text-xl font-black text-amber-400">{subscriptions.filter(s => ['past_due','suspended'].includes(s.status)).length}</p>
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
                <p className="text-2xl font-black text-amber-400 mb-1">{fmtSAR(p.price_monthly)}<span className="text-xs text-gray-400"> / شهر</span></p>
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
                  <p className="font-bold text-gray-900 text-sm">{p.name_ar} {p.code && <span className="font-mono text-amber-400 text-xs">({p.code})</span>}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.plan_code} — {fmtSAR(p.trial_price)} لأول {p.trial_period_count} {p.trial_period_unit === 'day' ? 'يوم' : 'شهر'}
                    {p.max_redemptions ? ` — ${p.redemptions_count}/${p.max_redemptions} مستخدَم` : ` — ${p.redemptions_count} مستخدَم`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${p.is_active ? 'bg-emerald-950 text-emerald-300' : 'bg-gray-100 text-gray-500'}`}>
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
                  {['المنشأة','الخطة','الحالة','المبلغ القادم','نهاية الدورة','محاولات فاشلة'].map(h => (
                    <th key={h} className="text-right px-4 py-3 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد اشتراكات بعد</td></tr>
                ) : subscriptions.map(s => (
                  <tr key={s.id} className="border-b border-gray-200/50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.tenant_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-900">{s.billing_plans?.name_ar || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[s.status] || 'bg-gray-100 text-gray-700'}`}>
                        {statusLabel[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-amber-400 font-bold">{fmtSAR(s.next_charge_amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(s.current_period_end)}</td>
                    <td className="px-4 py-3 text-gray-500">{s.failed_attempts || 0}</td>
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
  const [search, setSearch]   = useState('');
  const [tab, setTab]         = useState('overview');

  useEffect(() => {
    const iv = setInterval(() => { if (!checkSession()) setAuthed(false); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (authed) loadAll(); }, [authed]);

  async function loadAll() {
    setLoading(true);
    const [subs, tix, pays] = await Promise.all([
      callOwnerApi('list_subscriptions').catch(() => []),
      callOwnerApi('list_support_tickets').catch(() => []),
      callOwnerApi('list_payment_codes').catch(() => []),
    ]);
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
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
    toast('تم تسجيل الخروج');
  }

  if (!authed) return <OwnerLogin onLogin={() => setAuthed(true)} />;

  const TABS = [
    { id: 'overview',  label: 'نظرة عامة',    icon: BarChart3    },
    { id: 'clients',   label: 'العملاء',       icon: Users        },
    { id: 'payments',  label: 'الرموز',        icon: Shield       },
    { id: 'tickets',   label: 'التذاكر',       icon: MessageSquare},
    { id: 'pricing',   label: 'أسعار الخطط',   icon: BadgeDollarSign },
    { id: 'billing',   label: 'الفوترة الدورية', icon: CreditCard },
    { id: 'broadcast', label: 'رسائل جماعية',  icon: Megaphone    },
    { id: 'blog',      label: 'المدونة',        icon: Newspaper    },
    { id: 'ai',        label: 'مساعد الذكاء',  icon: Bot          },
    { id: 'team',      label: 'الفريق والمحتوى', icon: UserCog     },
  ];

  const filtered = clients.filter(c =>
    !search || c.client_name?.toLowerCase().includes(search.toLowerCase()) || c.client_id?.includes(search)
  );

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* رأس */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
              <Crown className="w-5 h-5 text-gray-900" />
            </div>
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
            {tab === 'pricing'   && <PricingTab />}
            {tab === 'billing'   && <BillingTab />}
            {tab === 'broadcast' && <BroadcastTab clients={clients} />}
            {tab === 'blog'      && <BlogTab />}
            {tab === 'ai'        && <AISettingsTab />}

            {tab === 'clients' && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
                      className="w-full h-9 bg-gray-50 border border-gray-300 rounded-xl pr-9 pl-3 text-sm text-gray-900 focus:outline-none focus:border-gray-500" />
                  </div>
                  <button onClick={loadAll} className="p-2 hover:bg-gray-50 rounded-xl">
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-200 text-gray-400">
                      {['العميل','الخطة','الحالة','المبلغ','الانتهاء'].map(h => (
                        <th key={h} className="text-right px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{filtered.map(c => (
                      <tr key={c.id} className="border-b border-gray-200/50 hover:bg-gray-50/30">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.client_name||maskSensitive(c.client_id||'',6)}</td>
                        <td className="px-4 py-3"><span className="bg-violet-900/50 text-violet-300 text-xs px-2 py-0.5 rounded-full">{c.plan}</span></td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${c.status==='active'?'bg-green-900/50 text-green-300':'bg-gray-50 text-gray-500'}`}>
                            {c.status==='active'?'نشط':'منتهي'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-amber-400">{fmtSAR(c.amount_paid)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.expires_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'payments' && (
              <div className="space-y-4">
                <PaymentCodeGenerator onGenerated={() => loadAll()} />
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">رموز تفعيل النظام</h3>
                  <span className="text-xs text-gray-400">{payments.filter(p=>!p.used).length} رمز متاح</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-200 text-gray-400">
                      {['الرمز','الخطة','المبلغ','الحالة','تاريخ الإنشاء'].map(h => (
                        <th key={h} className="text-right px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-200/50 hover:bg-gray-50/30">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.code}</td>
                        <td className="px-4 py-3 text-violet-300 text-xs">{p.plan}</td>
                        <td className="px-4 py-3 text-amber-400">{fmtSAR(p.amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${p.used?'bg-gray-50 text-gray-400':'bg-green-900/50 text-green-300'}`}>
                            {p.used?'مستخدم':'متاح'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(p.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                </div>
              </div>
            )}

            {tab === 'tickets' && <TicketsTab tickets={tickets} onRefresh={loadAll} />}
            {tab === 'team' && <TeamAndContentTab />}
          </>
        )}
      </div>
    </div>
  );
}

// ── تبويب الدعم الفني — شات كامل بين صاحب النظام والعملاء ──────
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
              {t.priority === 'high' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 flex-shrink-0">عاجل</span>}
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
    supabase.from('system_settings').select('value').eq('key', 'about_us_content').maybeSingle()
      .then(({ data }) => { setAboutContent(data?.value || ''); setLoadingAbout(false); })
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
                  <button onClick={() => removeMember(m.id)} className="text-xs px-3 py-1.5 bg-red-900/40 text-red-300 rounded-lg hover:bg-red-900/60">
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

// ── توليد رمز تفعيل اشتراك جديد لعميل — الواجهة الفعلية الوحيدة
// القادرة على إنشاء رموز payment_codes (عبر owner-admin-api فقط) ──
function PaymentCodeGenerator({ onGenerated }) {
  const [plan, setPlan]       = useState(PLANS[1]?.code || PLANS[0].code);
  const [months, setMonths]   = useState(1);
  const [amount, setAmount]   = useState(PLANS[1]?.price || PLANS[0].price);
  const [generating, setGenerating] = useState(false);
  const [lastCode, setLastCode]     = useState(null);

  function pickPlan(code) {
    setPlan(code);
    const p = PLANS.find(p => p.code === code);
    if (p?.price) setAmount(p.price * months);
  }
  function pickMonths(m) {
    setMonths(m);
    const p = PLANS.find(p => p.code === plan);
    if (p?.price) setAmount(p.price * m);
  }

  async function generate() {
    setGenerating(true);
    try {
      const rand = Math.random().toString(36).substr(2, 8).toUpperCase();
      const code = `PAY-${plan.toUpperCase().substr(0, 3)}-${rand}-${months}M`;
      await callOwnerApi('insert_payment_code', {
        code, plan, months, amount, signature: 'owner-verified', used: false,
      });
      setLastCode(code);
      onGenerated?.();
      toast.success('تم توليد رمز جديد بنجاح');
    } catch (e) {
      toast.error('فشل التوليد: ' + (e?.message || ''));
    }
    setGenerating(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="font-bold text-gray-900 mb-4">توليد رمز تفعيل اشتراك جديد</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={plan} onChange={e => pickPlan(e.target.value)}
          className="h-10 bg-gray-50 border border-gray-300 rounded-lg px-3 text-sm text-gray-900">
          {PLANS.map(p => <option key={p.code} value={p.code}>{p.name} ({p.price ?? '—'} ر.س)</option>)}
        </select>
        <select value={months} onChange={e => pickMonths(Number(e.target.value))}
          className="h-10 bg-gray-50 border border-gray-300 rounded-lg px-3 text-sm text-gray-900">
          {[1,3,6,12].map(m => <option key={m} value={m}>{m} {m===1?'شهر':'شهور'}</option>)}
        </select>
        <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
          placeholder="المبلغ (ر.س)"
          className="h-10 bg-gray-50 border border-gray-300 rounded-lg px-3 text-sm text-gray-900" />
        <button onClick={generate} disabled={generating}
          className="h-10 bg-primary text-gray-900 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {generating && <Loader2 className="w-4 h-4 animate-spin" />} توليد الرمز
        </button>
      </div>

      {lastCode && (
        <div className="mt-4 bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-300 text-xs mb-1">الرمز الجديد — أرسله للعميل ليُدخله في صفحة الدفع:</p>
            <p className="text-gray-900 font-mono text-lg font-bold">{lastCode}</p>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(lastCode); toast.success('تم نسخ الرمز'); }}
            className="px-4 h-10 bg-emerald-700 text-gray-900 rounded-lg text-sm font-bold flex items-center gap-1.5">
            <Copy className="w-4 h-4" /> نسخ
          </button>
        </div>
      )}
    </div>
  );
}
