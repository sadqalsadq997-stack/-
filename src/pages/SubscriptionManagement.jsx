import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Crown, Plus, Edit3, Clock, Gift, Percent, Calendar,
  Users, CheckCircle2, AlertTriangle, Loader2, Trash2,
  CreditCard, Zap, Star, Copy, RefreshCw, Tag
} from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════
// إدارة الاشتراكات والعروض — للمدير
// ══════════════════════════════════════════════════════

function generatePaymentCode(plan, months, amount) {
  const rand = Math.random().toString(36).substr(2, 8).toUpperCase();
  return `PAY-${plan.toUpperCase().substr(0, 3)}-${rand}-${months}M`;
}

export default function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [offers, setOffers]               = useState([]);
  const [codes, setCodes]                 = useState([]);
  const [tab, setTab]                     = useState('subscriptions');
  const [loading, setLoading]             = useState(true);

  // نموذج تمديد الاشتراك
  const [extendModal, setExtendModal]     = useState(null);
  const [extendMonths, setExtendMonths]   = useState(1);
  const [extendNote, setExtendNote]       = useState('');
  const [extending, setExtending]         = useState(false);

  // نموذج إضافة عرض
  const [offerModal, setOfferModal]       = useState(false);
  const [offerForm, setOfferForm]         = useState({
    title: '', title_ar: '', discount: 20, type: 'percent',
    valid_from: new Date().toISOString().split('T')[0],
    valid_to: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
    show_on_homepage: true, plan: 'pro',
  });
  const [savingOffer, setSavingOffer]     = useState(false);

  // توليد رمز دفع
  const [codeModal, setCodeModal]         = useState(false);
  const [codeForm, setCodeForm]           = useState({ plan: 'pro', months: 1, amount: 199 });
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: subs }, { data: offs }, { data: pCodes }] = await Promise.all([
      supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase.from('payment_codes').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setSubscriptions(subs || []);
    setOffers(offs || []);
    setCodes(pCodes || []);
    setLoading(false);
  }

  // تمديد اشتراك
  async function extendSubscription() {
    if (!extendModal) return;
    setExtending(true);
    try {
      const current = new Date(extendModal.expires_at || Date.now());
      const newExpiry = new Date(Math.max(current, Date.now()));
      newExpiry.setMonth(newExpiry.getMonth() + extendMonths);

      await supabase.from('subscriptions').update({
        expires_at: newExpiry.toISOString(),
        status: 'active',
        notes: extendNote || null,
      }).eq('id', extendModal.id);

      toast.success(`✅ تم تمديد الاشتراك ${extendMonths} شهر/أشهر`);
      setExtendModal(null);
      loadAll();
    } catch (err) {
      toast.error('خطأ: ' + err.message);
    }
    setExtending(false);
  }

  // حفظ عرض
  async function saveOffer() {
    setSavingOffer(true);
    try {
      await supabase.from('offers').insert({
        ...offerForm,
        discount: Number(offerForm.discount),
        is_active: true,
      });
      toast.success('✅ تم حفظ العرض وسيظهر في الصفحة الرئيسية');
      setOfferModal(false);
      loadAll();
    } catch (err) {
      toast.error('خطأ: ' + err.message);
    }
    setSavingOffer(false);
  }

  // توليد رمز دفع مع توقيع
  async function generateCode() {
    setGeneratingCode(true);
    try {
      const code = generatePaymentCode(codeForm.plan, codeForm.months, codeForm.amount);
      // توليد توقيع HMAC-SHA256
      const SECRET = import.meta.env.VITE_PAYMENT_SECRET || 'felsy-payment-secret-2025';
      const payload = `${code}:${codeForm.plan}:${codeForm.amount}:${codeForm.months}`;
      let signature = 'dev';
      try {
        const key = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(SECRET),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
        signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
      } catch { /* dev mode */ }

      const { error } = await supabase.from('payment_codes').insert({
        code,
        plan: codeForm.plan,
        months: codeForm.months,
        amount: codeForm.amount,
        signature,
        used: false,
      });

      if (error) throw error;
      setGeneratedCode(code);
      toast.success('✅ تم توليد رمز الدفع');
      loadAll();
    } catch (err) {
      toast.error('خطأ: ' + err.message);
    }
    setGeneratingCode(false);
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => toast.success('تم النسخ'));
  };

  const activeOffer = offers.find(o => o.is_active && new Date(o.valid_to) > new Date());

  return (
    <div dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Crown className="w-6 h-6 text-primary" />
            إدارة الاشتراكات
          </h1>
          <p className="text-muted-foreground text-sm">تحكم في اشتراكات العملاء والعروض ورموز الدفع</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCodeModal(true)} className="flex items-center gap-1.5 h-9 px-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-colors">
            <Zap className="w-4 h-4" /> توليد رمز دفع
          </button>
          <button onClick={() => setOfferModal(true)} className="flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> عرض جديد
          </button>
        </div>
      </div>

      {/* إشعار العرض النشط */}
      {activeOffer && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-5 flex items-center gap-3">
          <Gift className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm text-foreground">عرض نشط: {activeOffer.title_ar || activeOffer.title}</p>
            <p className="text-xs text-muted-foreground">
              خصم {activeOffer.discount}{activeOffer.type === 'percent' ? '%' : ' ر.س'}
              {' • '}ينتهي {new Date(activeOffer.valid_to).toLocaleDateString('ar')}
              {activeOffer.show_on_homepage && ' • يظهر في الصفحة الرئيسية'}
            </p>
          </div>
        </div>
      )}

      {/* التبويبات */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5">
        {[
          { id: 'subscriptions', label: 'الاشتراكات', icon: CreditCard },
          { id: 'offers', label: 'العروض', icon: Tag },
          { id: 'codes', label: 'رموز الدفع', icon: Zap },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {/* الاشتراكات */}
          {tab === 'subscriptions' && (
            <div className="space-y-3">
              {subscriptions.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  لا توجد اشتراكات بعد
                </div>
              ) : subscriptions.map(s => {
                const expired = new Date(s.expires_at) < new Date();
                const daysLeft = Math.ceil((new Date(s.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={s.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      s.status === 'active' && !expired ? 'bg-emerald-500/15' : 'bg-red-500/15'
                    }`}>
                      <Crown className={`w-5 h-5 ${s.status === 'active' && !expired ? 'text-emerald-500' : 'text-red-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground">{s.plan || 'pro'}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          s.status === 'active' && !expired
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/15 text-red-500'
                        }`}>
                          {s.status === 'active' && !expired ? 'نشط' : expired ? 'منتهي' : s.status}
                        </span>
                        {!expired && daysLeft <= 7 && (
                          <span className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full px-2 py-0.5">
                            ⚠️ {daysLeft} يوم متبقٍ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ينتهي: {new Date(s.expires_at).toLocaleDateString('ar')}
                        {s.amount_paid && ` • دفع ${s.amount_paid} ر.س`}
                      </p>
                    </div>
                    <button
                      onClick={() => { setExtendModal(s); setExtendMonths(1); setExtendNote(''); }}
                      className="h-8 px-3 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" /> تمديد
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* العروض */}
          {tab === 'offers' && (
            <div className="space-y-3">
              {offers.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  لا توجد عروض. أضف عرضاً جديداً!
                </div>
              ) : offers.map(o => {
                const active = o.is_active && new Date(o.valid_to) > new Date();
                return (
                  <div key={o.id} className={`bg-card border rounded-2xl p-4 flex items-center gap-4 ${active ? 'border-amber-500/30' : 'border-border opacity-60'}`}>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <Percent className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground">{o.title_ar || o.title}</p>
                      <p className="text-xs text-muted-foreground">
                        خصم {o.discount}{o.type === 'percent' ? '%' : ' ر.س'}
                        {' • '}{new Date(o.valid_from).toLocaleDateString('ar')} – {new Date(o.valid_to).toLocaleDateString('ar')}
                        {o.show_on_homepage && ' • يظهر في الصفحة'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await supabase.from('offers').update({ is_active: !o.is_active }).eq('id', o.id);
                          loadAll();
                        }}
                        className={`h-7 px-3 rounded-lg text-xs font-medium ${
                          o.is_active ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                        }`}
                      >
                        {o.is_active ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button
                        onClick={async () => { await supabase.from('offers').delete().eq('id', o.id); loadAll(); }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* رموز الدفع */}
          {tab === 'codes' && (
            <div className="space-y-3">
              {codes.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  لا توجد رموز دفع
                </div>
              ) : codes.map(c => (
                <div key={c.id} className={`bg-card border rounded-2xl p-4 flex items-center gap-4 ${c.used ? 'border-border opacity-50' : 'border-emerald-500/30'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.used ? 'bg-muted' : 'bg-emerald-500/15'}`}>
                    <Zap className={`w-5 h-5 ${c.used ? 'text-muted-foreground' : 'text-emerald-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-sm text-foreground">{c.code}</code>
                      {!c.used && (
                        <button onClick={() => copyCode(c.code)} className="p-0.5 hover:text-primary transition-colors">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      خطة {c.plan} • {c.months} شهر • {c.amount} ر.س
                      {c.used && ` • استُخدم في ${new Date(c.used_at).toLocaleDateString('ar')}`}
                    </p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${c.used ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>
                    {c.used ? 'مستخدم' : 'متاح'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* مودال تمديد الاشتراك */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" /> تمديد الاشتراك
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">عدد الأشهر</label>
                <div className="flex gap-2">
                  {[1,2,3,6,12].map(m => (
                    <button key={m} onClick={() => setExtendMonths(m)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${extendMonths === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">ملاحظة (اختياري)</label>
                <input value={extendNote} onChange={e => setExtendNote(e.target.value)}
                  placeholder="مثال: هدية عيد الفطر"
                  className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-sm text-muted-foreground">
                الاشتراك الحالي ينتهي: <span className="font-bold text-foreground">{new Date(extendModal.expires_at).toLocaleDateString('ar')}</span>
                <br />
                بعد التمديد ينتهي: <span className="font-bold text-primary">{(() => { const d = new Date(Math.max(new Date(extendModal.expires_at), Date.now())); d.setMonth(d.getMonth() + extendMonths); return d.toLocaleDateString('ar'); })()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setExtendModal(null)} className="flex-1 h-10 bg-muted rounded-xl text-sm font-medium">إلغاء</button>
              <button onClick={extendSubscription} disabled={extending}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {extending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                تمديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال إضافة عرض */}
      {offerModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" /> إضافة عرض جديد
            </h3>
            <div className="space-y-3">
              <input value={offerForm.title_ar} onChange={e => setOfferForm(f => ({ ...f, title_ar: e.target.value }))}
                placeholder="عنوان العرض (عربي)" className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
              <input value={offerForm.title} onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Offer Title (English)" className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" dir="ltr" />
              <div className="flex gap-2">
                <input type="number" value={offerForm.discount} onChange={e => setOfferForm(f => ({ ...f, discount: e.target.value }))}
                  placeholder="الخصم" className="flex-1 h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                <select value={offerForm.type} onChange={e => setOfferForm(f => ({ ...f, type: e.target.value }))}
                  className="h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
                  <option value="percent">نسبة %</option>
                  <option value="fixed">مبلغ ثابت ر.س</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">من</label>
                  <input type="date" value={offerForm.valid_from} onChange={e => setOfferForm(f => ({ ...f, valid_from: e.target.value }))}
                    className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">إلى</label>
                  <input type="date" value={offerForm.valid_to} onChange={e => setOfferForm(f => ({ ...f, valid_to: e.target.value }))}
                    className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={offerForm.show_on_homepage}
                  onChange={e => setOfferForm(f => ({ ...f, show_on_homepage: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm text-foreground">إظهار في الصفحة الرئيسية للموقع</span>
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setOfferModal(false)} className="flex-1 h-10 bg-muted rounded-xl text-sm font-medium">إلغاء</button>
              <button onClick={saveOffer} disabled={savingOffer}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {savingOffer ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                حفظ العرض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال توليد رمز دفع */}
      {codeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-500" /> توليد رمز دفع
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">الخطة</label>
                <select value={codeForm.plan} onChange={e => setCodeForm(f => ({ ...f, plan: e.target.value }))}
                  className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
                  <option value="starter">المبتدئ (99 ر.س/شهر)</option>
                  <option value="pro">الاحترافي (199 ر.س/شهر)</option>
                  <option value="enterprise">المؤسسي (499 ر.س/شهر)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">عدد الأشهر</label>
                <div className="flex gap-2">
                  {[1,2,3,6,12].map(m => (
                    <button key={m} onClick={() => setCodeForm(f => ({ ...f, months: m }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${codeForm.months === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">المبلغ المدفوع (ر.س)</label>
                <input type="number" value={codeForm.amount} onChange={e => setCodeForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
              </div>

              {generatedCode && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2">
                  <code className="flex-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{generatedCode}</code>
                  <button onClick={() => copyCode(generatedCode)} className="p-1 hover:text-primary">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setCodeModal(false); setGeneratedCode(''); }} className="flex-1 h-10 bg-muted rounded-xl text-sm font-medium">إغلاق</button>
              <button onClick={generateCode} disabled={generatingCode}
                className="flex-1 h-10 bg-emerald-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                توليد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
