import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { BellRing, Bell, Check, ChefHat, Loader2, Volume2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { unlockAudio, startRinging, stopRinging } from '@/lib/pager/sound';
import MadeByFelsy from '@/components/MadeByFelsy';

// ══════════════════════════════════════════════════════════════════
// صفحة البيجر عند العميل — felsy.org/p/<token>
// تفحص الحالة كل 3 ثواني، وعند "جاهز": نغمة + اهتزاز + إشعار + وميض
// ══════════════════════════════════════════════════════════════════

const POLL_MS = 4000;

const STEPS = [
  { key: 'waiting', label: 'استلمنا طلبك', icon: Check },
  { key: 'preparing', label: 'قيد التحضير', icon: ChefHat },
  { key: 'ready', label: 'جاهز للاستلام', icon: BellRing },
];
const ORDER = { waiting: 0, preparing: 1, ready: 2, collected: 3 };

function toArabicDigits(n) { return Number(n).toLocaleString('ar-SA', { useGrouping: false }); }

export default function PagerCustomer() {
  const { token } = useParams();
  const [pager, setPager] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound
  const [armed, setArmed] = useState(false);
  const [ringing, setRinging] = useState(false);
  const prevStatus = useRef(null);
  const swReg = useRef(null);
  const wakeLock = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!/^[a-f0-9]{32,64}$/i.test(token || '')) { setState('notfound'); return; }
    const { data, error } = await supabase.rpc('pager_public', { p_token: token });
    if (error) return; // خطأ شبكة مؤقت — نحاول في الدورة الجاية
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.display_number) { setState('notfound'); return; }
    setPager(row);
    setState('ok');
  }, [token]);

  // الفحص الدوري + فحص فوري عند الرجوع للصفحة
  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') fetchStatus(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchStatus]);

  // عنوان الصفحة
  useEffect(() => {
    if (!pager) return;
    document.title = pager.status === 'ready'
      ? `🔔 طلبك ${pager.display_number} جاهز!`
      : `طلب رقم ${pager.display_number} — ${pager.business_name}`;
  }, [pager]);

  // التحول إلى "جاهز" ⇒ رنين
  useEffect(() => {
    if (!pager) return;
    const was = prevStatus.current;
    prevStatus.current = pager.status;
    if (pager.status === 'ready' && was !== 'ready' && !pager.acknowledged_at) {
      setRinging(true);
      startRinging();
      showNotification(pager);
    }
    if (pager.status !== 'ready' && ringing) { setRinging(false); stopRinging(); }
  }, [pager]); // eslint-disable-line react-hooks/exhaustive-deps

  // عند فتح الصفحة والطلب جاهز مسبقاً
  useEffect(() => {
    if (pager?.status === 'ready' && !pager.acknowledged_at && prevStatus.current === null) setRinging(true);
  }, [pager]);

  async function showNotification(p) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const title = `طلبك رقم ${p.display_number} جاهز`;
    const opts = {
      body: `تفضل للاستلام من ${p.business_name}`,
      tag: `pager-${token}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 800],
      icon: '/logo-square.png',
      badge: '/logo-square.png',
      data: { url: `/p/${token}` },
    };
    try {
      if (swReg.current) await swReg.current.showNotification(title, opts);
      else new Notification(title, opts);
    } catch { /* بعض المتصفحات لا تدعم */ }
  }

  async function arm() {
    await unlockAudio();
    try {
      if ('serviceWorker' in navigator) {
        swReg.current = await navigator.serviceWorker.register('/pager-sw.js', { scope: '/p/' });
      }
    } catch { /* */ }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
    } catch { /* */ }
    try { wakeLock.current = await navigator.wakeLock?.request('screen'); } catch { /* */ }
    setArmed(true);
    if (pager?.status === 'ready' && !pager.acknowledged_at) startRinging();
  }

  // أي لمسة على الصفحة تفعّل الصوت (المتصفحات تمنع الصوت قبل أول لمسة)
  useEffect(() => {
    if (armed) return;
    const once = () => { arm(); };
    window.addEventListener('pointerdown', once, { once: true });
    window.addEventListener('keydown', once, { once: true });
    return () => { window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
  }, [armed, pager?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // إعادة طلب إبقاء الشاشة مضاءة بعد الرجوع للصفحة
  useEffect(() => {
    const re = async () => {
      if (armed && document.visibilityState === 'visible') {
        try { wakeLock.current = await navigator.wakeLock?.request('screen'); } catch { /* */ }
      }
    };
    document.addEventListener('visibilitychange', re);
    return () => document.removeEventListener('visibilitychange', re);
  }, [armed]);

  async function acknowledge() {
    stopRinging();
    setRinging(false);
    try { await supabase.rpc('pager_ack', { p_token: token }); } catch { /* */ }
    fetchStatus();
  }

  if (state === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-sage-700" /></div>;
  }

  if (state === 'notfound') {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <XCircle className="h-12 w-12 text-slate-300" />
        <h1 className="text-xl font-black text-slate-800">الرابط منتهي أو غير صحيح</h1>
        <p className="max-w-xs text-slate-500">روابط البيجر صالحة لمدة 24 ساعة. اسأل الكاشير عن طلبك.</p>
      </div>
    );
  }

  const isReady = pager.status === 'ready';
  const isDone = pager.status === 'collected';
  const isCancelled = pager.status === 'cancelled';
  const stepIndex = ORDER[pager.status] ?? 0;

  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" className={`relative flex min-h-[100dvh] flex-col overflow-hidden transition-colors duration-500 ${isReady ? 'bg-sage-600 text-white' : 'bg-sage-50 text-ink'}`}>
        {ringing && (
          <motion.div className="pointer-events-none absolute inset-0 bg-white"
            animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 0.9, repeat: Infinity }} />
        )}

        <header className="relative flex items-center justify-between px-5 pt-5">
          <p className="text-sm font-bold opacity-80">{pager.business_name}</p>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${isReady ? 'bg-white/20' : 'bg-white text-slate-500 shadow-sm'}`}>بيجر إلكتروني</span>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className={`text-base ${isReady ? 'text-white/85' : 'text-slate-500'}`}>رقم طلبك</p>
          <motion.p key={pager.status} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="mt-1 text-[7.5rem] font-black leading-none tracking-tight sm:text-[9rem]">
            {toArabicDigits(pager.display_number)}
          </motion.p>

          <AnimatePresence mode="wait">
            {isReady ? (
              <motion.div key="ready" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
                <motion.div animate={ringing ? { rotate: [0, -16, 16, -10, 10, 0] } : {}} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.3 }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-sage-700">
                  <BellRing className="h-10 w-10" />
                </motion.div>
                <h1 className="mt-5 text-3xl font-black">طلبك جاهز!</h1>
                <p className="mt-2 text-lg text-white/90">تفضل للاستلام من الكاونتر</p>
                {ringing && !armed && (
                  <motion.button onClick={arm} animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 0.9, repeat: Infinity }}
                    className="mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black text-sage-700 shadow-xl">
                    <Volume2 className="h-5 w-5" /> اضغط لتشغيل الرنين
                  </motion.button>
                )}
                {ringing && armed && (
                  <button onClick={acknowledge} className="mt-8 h-14 w-full max-w-xs rounded-2xl bg-white text-lg font-black text-sage-700 shadow-xl">
                    تمام، جاي أستلم
                  </button>
                )}
              </motion.div>
            ) : isDone ? (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                <h1 className="text-2xl font-black">تم استلام الطلب</h1>
                <p className="mt-2 text-slate-500">بالعافية، نتشرف بزيارتك مرة ثانية</p>
              </motion.div>
            ) : isCancelled ? (
              <motion.div key="cancel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                <h1 className="text-2xl font-black">تم إلغاء الطلب</h1>
                <p className="mt-2 text-slate-500">راجع الكاشير لأي استفسار</p>
              </motion.div>
            ) : (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 w-full max-w-xs">
                <ol className="space-y-3 text-start">
                  {STEPS.map((s, i) => {
                    const done = i < stepIndex, active = i === stepIndex;
                    return (
                      <li key={s.key} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${active ? 'bg-white shadow-sm' : ''}`}>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${done ? 'bg-sage-500 text-ink' : active ? 'bg-sage-400 text-ink' : 'bg-slate-200 text-slate-400'}`}>
                          {active && s.key !== 'ready' ? <Loader2 className="h-4 w-4 animate-spin" /> : <s.icon className="h-4 w-4" />}
                        </span>
                        <span className={`font-bold ${active ? 'text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>{s.label}</span>
                      </li>
                    );
                  })}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!isDone && !isCancelled && !(isReady && !armed) && (
          <footer className="relative px-5 pb-6">
            {!armed ? (
              <motion.button onClick={arm} whileTap={{ scale: 0.97 }}
                animate={{ boxShadow: ['0 0 0 0 rgba(163,193,173,0.6)', '0 0 0 14px rgba(163,193,173,0)'] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="mx-auto flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-sage-400 text-lg font-black text-ink">
                <Volume2 className="h-5 w-5" /> فعّل التنبيه بالصوت
              </motion.button>
            ) : (
              <p className={`mx-auto flex max-w-sm items-center justify-center gap-2 text-sm ${isReady ? 'text-white/85' : 'text-slate-500'}`}>
                <Bell className="h-4 w-4" /> التنبيه مفعّل — خلّ هذي الصفحة مفتوحة
              </p>
            )}
            {!armed && <p className="mt-3 text-center text-xs text-slate-400">بيرن جوالك ويهتز أول ما يجهز طلبك</p>}
            <div className="mt-4 flex justify-center"><MadeByFelsy source="pager" tone={isReady ? 'light' : 'muted'} /></div>
          </footer>
        )}
      </div>
    </MotionConfig>
  );
}
