import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Sparkles, Check, TrendingUp, ShieldCheck, Store, Package, Users } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

// ══════════════════════════════════════════════════════════════════
// مرئيات فلسي: واجهات واقعية من النظام (بدل الرسومات الكرتونية)
// منحنيات ناعمة · أيقونات خطية دائرية · مساحات بيضاء واسعة
// ══════════════════════════════════════════════════════════════════

const C = { sage: '#A3C1AD', sage600: '#6A8F77', ink: '#2C3E50' };

// منحنى ناعم (Catmull-Rom → Bezier)
function smoothPath(pts) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function SmoothChart({ values, w = 420, h = 150, id = 'c', strokeWidth = 3, showDot = true, delay = 0.3 }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [Math.round((i / (values.length - 1)) * (w - 16) + 8), Math.round(h - 14 - ((v - min) / (max - min || 1)) * (h - 34))]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0]} ${h} L${pts[0][0]} ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.sage} stopOpacity="0.5" />
          <stop offset="1" stopColor={C.sage} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#EAE4D8" strokeDasharray="3 6" />)}
      <motion.path d={area} fill={`url(#g-${id})`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: delay + 0.8, duration: 0.8 }} />
      <motion.path d={line} fill="none" stroke={C.sage600} strokeWidth={strokeWidth} strokeLinecap="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, delay, ease: 'easeInOut' }} />
      {showDot && (
        <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: delay + 1.5 }}>
          <motion.circle cx={last[0]} cy={last[1]} r="11" fill={C.sage} animate={{ opacity: [0.15, 0.45, 0.15] }} transition={{ duration: 2, repeat: Infinity }} />
          <circle cx={last[0]} cy={last[1]} r="5.5" fill="#fff" stroke={C.sage600} strokeWidth="3" />
        </motion.g>
      )}
    </svg>
  );
}

export function QRMini({ size = 64 }) {
  const N = 21; const cells = []; let seed = 11;
  const finder = (x, y, ox, oy) => { const dx = x - ox, dy = y - oy; if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null; return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    let on = finder(x, y, 0, 0) ?? finder(x, y, N - 7, 0) ?? finder(x, y, 0, N - 7);
    const near = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    if (on === null) on = near ? false : (seed >> 8) % 2 === 0;
    if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  }
  return <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} style={{ fill: C.ink }} shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>;
}

const floatAnim = (d = 0, amp = 8, dur = 6) => ({ animate: { y: [0, -amp, 0] }, transition: { duration: dur, repeat: Infinity, ease: 'easeInOut', delay: d } });

// ── المشهد الرئيسي: لوحة مبيعات + إشعار بيجر + مساعد ذكي + فاتورة ─────
export function HeroVisual({ className = '' }) {
  return (
    <div className={`relative mx-auto w-full max-w-[34rem] pb-28 pt-14 ${className}`} dir="rtl">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 560" preserveAspectRatio="none" fill="none" aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <motion.path key={i} d={`M-20 ${480 - i * 50} C 150 ${390 - i * 50}, 300 ${530 - i * 50}, 620 ${300 - i * 50}`} stroke={i % 2 ? C.sage : '#DDD5C4'} strokeWidth="1.4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, delay: i * 0.15, ease: 'easeInOut' }} />
        ))}
      </svg>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
        className="relative rounded-[1.75rem] border border-beige-200 bg-white p-6 shadow-[0_40px_80px_-40px_rgba(44,62,80,0.35)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-ink/55">مبيعات اليوم</p>
            <p className="mt-1 text-[2rem] font-extrabold leading-none text-ink" dir="ltr">12,480 <span className="text-base font-bold text-ink/50">ر.س</span></p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-peach-100 px-2.5 py-1 text-xs font-bold text-peach-700" dir="ltr">
            <TrendingUp className="h-3.5 w-3.5" /> +18%
          </span>
        </div>
        <div className="mt-5"><SmoothChart id="hero" values={[22, 30, 26, 38, 34, 46, 52, 48, 61, 72]} /></div>
        <div className="mt-2 flex justify-between px-1 text-[11px] font-semibold text-ink/40" dir="ltr">
          {['9AM', '12PM', '3PM', '6PM', '9PM'].map(t => <span key={t}>{t}</span>)}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-beige-200 pt-5">
          {[['الطلبات', '214'], ['متوسط الفاتورة', '58 ر.س'], ['عملاء جدد', '37']].map(([l, v]) => (
            <div key={l}>
              <p className="text-[11px] font-semibold text-ink/50">{l}</p>
              <p className="mt-0.5 text-lg font-extrabold text-ink">{v}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.1, duration: 0.6 }}
        className="absolute -left-1 top-0 w-60 sm:-left-10 sm:w-64">
        <motion.div {...floatAnim(0, 7, 5)} className="flex items-center gap-3 rounded-2xl border border-white bg-white/95 p-3 shadow-[0_20px_40px_-20px_rgba(44,62,80,0.4)] backdrop-blur">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-50"><LogoMark size={28} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between text-[11px] text-ink/45"><span className="font-bold text-ink/70">Felsy · بيجر</span>الآن</p>
            <p className="truncate text-sm font-extrabold text-ink">طلب رقم 47 جاهز</p>
            <p className="truncate text-xs text-ink/55">تفضل للاستلام من الكاونتر</p>
          </div>
          <motion.span animate={{ rotate: [0, -16, 16, -10, 10, 0] }} transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.6 }}>
            <BellRing className="h-5 w-5 text-peach-500" strokeWidth={2} />
          </motion.span>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.6 }}
        className="absolute -right-1 bottom-0 w-[17rem] sm:-right-6 sm:w-72">
        <motion.div {...floatAnim(1, 6, 6)} className="rounded-2xl bg-ink p-4 text-white shadow-[0_24px_48px_-20px_rgba(44,62,80,0.6)]">
          <p className="flex items-center gap-1.5 text-xs font-bold text-sage-300"><Sparkles className="h-4 w-4" /> المساعد الذكي</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/90">مبيعات القهوة أعلى <b className="text-white">23%</b> هذا الأسبوع — ننصح تزيد مخزون الحليب.</p>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.8, duration: 0.5 }}
        className="absolute bottom-3 left-0 hidden sm:block">
        <motion.div {...floatAnim(0.5, 5, 7)} className="flex items-center gap-3 rounded-2xl border border-beige-200 bg-white p-3 shadow-[0_20px_40px_-24px_rgba(44,62,80,0.4)]">
          <QRMini size={44} />
          <div>
            <p className="flex items-center gap-1 text-xs font-extrabold text-ink"><ShieldCheck className="h-4 w-4 text-sage-600" /> فاتورة معتمدة</p>
            <p className="text-[11px] text-ink/50">ZATCA · المرحلة الثانية</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── مرئيات البطاقات الثلاث ────────────────────────────────────────
export function ChartCardVisual() {
  return (
    <div className="flex h-[10.5rem] flex-col justify-between rounded-2xl bg-sage-50 p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-ink/60">صافي الربح</span>
        <span className="rounded-full bg-white px-2 py-0.5 font-bold text-sage-700">هذا الشهر</span>
      </div>
      <p className="text-xl font-extrabold text-ink" dir="ltr">38,920 <span className="text-xs text-ink/45">ر.س</span></p>
      <SmoothChart id="card1" values={[14, 18, 16, 24, 22, 30, 34, 31, 40]} h={80} strokeWidth={2.5} delay={0.2} />
    </div>
  );
}

export function PhoneCardVisual() {
  return (
    <div className="relative flex h-[10.5rem] items-end justify-center overflow-hidden rounded-2xl bg-sage-50">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="absolute top-6 h-28 w-48 rounded-full border border-peach-300"
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0.7, 0], scale: [0.6, 1.2] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }} />
      ))}
      <div className="relative h-[9.25rem] w-32 rounded-t-[1.6rem] border-[2.5px] border-b-0 border-ink/80 bg-white px-2.5 pt-6">
        <span className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-ink/80" />
        <p className="text-center text-[9px] font-bold text-ink/45">رقم طلبك</p>
        <p className="text-center text-4xl font-extrabold leading-tight text-ink">47</p>
        <motion.div animate={{ backgroundColor: ['#E6EFE9', '#A3C1AD', '#E6EFE9'] }} transition={{ duration: 1.6, repeat: Infinity }}
          className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-extrabold text-ink">
          <BellRing className="h-3 w-3" /> طلبك جاهز
        </motion.div>
      </div>
    </div>
  );
}

export function InvoiceCardVisual() {
  return (
    <div className="flex h-[10.5rem] items-center justify-center rounded-2xl bg-sage-50">
      <div className="relative w-40 rotate-[-3deg] rounded-t-xl bg-white px-4 pb-5 pt-3 shadow-[0_16px_30px_-18px_rgba(44,62,80,0.5)]"
        style={{ maskImage: 'radial-gradient(circle at 6px 100%, transparent 4px, #000 4.5px)', maskSize: '12px 100%', WebkitMaskImage: 'radial-gradient(circle at 6px 100%, transparent 4px, #000 4.5px)', WebkitMaskSize: '12px 100%' }}>
        <p className="text-center text-[10px] font-extrabold text-ink">فاتورة ضريبية مبسطة</p>
        <div className="my-2 space-y-1.5">
          {[70, 55, 62].map((w, i) => <div key={i} className="flex justify-between gap-2"><span className="h-1.5 rounded-full bg-beige-200" style={{ width: `${w}%` }} /><span className="h-1.5 w-6 rounded-full bg-beige-200" /></div>)}
        </div>
        <div className="flex items-center justify-between">
          <QRMini size={40} />
          <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', delay: 0.4 }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-400 text-ink">
            <Check className="h-5 w-5" strokeWidth={3} />
          </motion.span>
        </div>
      </div>
    </div>
  );
}

// ── قسم الخطوات: قائمة إعداد تتعبّى تلقائياً ─────────────────────────
const SETUP = [
  { icon: Store, label: 'بيانات المحل والفرع' },
  { icon: Package, label: 'إضافة المنتجات والأسعار' },
  { icon: Users, label: 'الموظفين ورموز PIN' },
  { icon: ShieldCheck, label: 'ربط الفوترة مع هيئة الزكاة' },
];

export function SetupVisual({ className = '' }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(d => (d >= SETUP.length + 2 ? 0 : d + 1)), 1100);
    return () => clearInterval(t);
  }, []);
  const n = Math.min(step, SETUP.length);
  return (
    <div className={`relative mx-auto w-full max-w-md ${className}`} dir="rtl">
      <div className="absolute -inset-3 rounded-[2.5rem] bg-beige sm:-inset-6" />
      <div className="relative rounded-[1.75rem] border border-beige-200 bg-white p-6 shadow-[0_40px_80px_-44px_rgba(44,62,80,0.4)]">
        <div className="flex items-center justify-between">
          <p className="font-extrabold text-ink">إعداد متجرك</p>
          <p className="text-sm font-bold text-ink/50" dir="ltr">{n}/{SETUP.length}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-beige">
          <motion.div className="h-full rounded-full bg-sage-400" animate={{ width: `${(n / SETUP.length) * 100}%` }} transition={{ duration: 0.5 }} />
        </div>
        <ul className="mt-5 space-y-2.5">
          {SETUP.map((s, i) => {
            const ok = i < n;
            return (
              <li key={s.label} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${ok ? 'border-sage-200 bg-sage-50' : 'border-beige-200'}`}>
                <s.icon className={`h-5 w-5 ${ok ? 'text-sage-700' : 'text-ink/35'}`} strokeWidth={1.8} />
                <span className={`flex-1 text-sm font-bold ${ok ? 'text-ink' : 'text-ink/50'}`}>{s.label}</span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${ok ? 'scale-100 bg-sage-400 text-ink' : 'scale-75 border border-beige-300 text-transparent'}`}>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className={`mt-4 rounded-2xl py-3 text-center text-sm font-extrabold transition-colors ${n === SETUP.length ? 'bg-ink text-white' : 'bg-beige text-ink/40'}`}>
          {n === SETUP.length ? 'جاهز للبيع ✓' : 'جارٍ الإعداد...'}
        </div>
      </div>
    </div>
  );
}

export function HeroWaves({ className = '' }) {
  return (
    <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M0 120 C260 60 480 160 760 110 C1040 60 1220 130 1440 90 L1440 202 L0 202 Z" fill="#FAFAFA" />
      <motion.path d="M0 120 C260 60 480 160 760 110 C1040 60 1220 130 1440 90" fill="none" stroke="#A3C1AD" strokeWidth="1.5"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: 'easeInOut' }} />
    </svg>
  );
}
