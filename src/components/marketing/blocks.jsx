import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PLANS } from '@/lib/pricingPlans';

export function Reveal({ children, delay = 0, className = '' }) {
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.47, 0.32, 0.98] }}>
      {children}
    </motion.div>
  );
}

const CODE_ALIASES = { starter: 'basic', basic: 'basic', pro: 'pro', enterprise: 'enterprise' };

/** الأسعار من قاعدة البيانات (نفس المبلغ اللي يُخصم) مع بديل ثابت */
export function usePlans() {
  const [plans, setPlans] = useState(() => PLANS.map(p => ({ code: p.code, price: p.price, ui: p })));
  useEffect(() => {
    supabase.from('billing_plans').select('plan_code, price_monthly, version').eq('is_active', true)
      .then(({ data }) => {
        if (!data?.length) return;
        const latest = {};
        data.forEach(p => { if (!latest[p.plan_code] || p.version > latest[p.plan_code].version) latest[p.plan_code] = p; });
        const merged = Object.values(latest)
          .map(p => ({ code: p.plan_code, price: Number(p.price_monthly), ui: PLANS.find(x => x.code === CODE_ALIASES[p.plan_code]) }))
          .filter(p => p.ui).sort((a, b) => a.price - b.price);
        if (merged.length) setPlans(merged);
      }, () => {});
  }, []);
  return plans;
}

export function PricingCards() {
  const plans = usePlans();
  const featured = plans.find(p => p.ui?.popular)?.code;
  return (
    <>
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {plans.map((p, i) => {
          const hot = p.code === featured;
          return (
            <motion.div key={p.code}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.08 }} whileHover={{ y: -6 }}
              className={`relative flex flex-col rounded-3xl p-7 ${hot ? 'bg-ink text-white shadow-2xl shadow-ink/25 md:-my-4 md:py-11' : 'border border-beige-200 bg-white'}`}>
              {hot && <span className="absolute -top-3.5 start-7 rounded-full bg-peach-400 px-3.5 py-1 text-xs font-black text-ink">الأكثر طلباً</span>}
              <h3 className="text-xl font-black">{p.ui.name}</h3>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-6xl font-black tracking-tight">{p.price}</span>
                <span className={hot ? 'text-slate-400' : 'text-slate-500'}><span className="sar">⃁</span> / شهرياً</span>
              </p>
              <p className={`mt-1 text-sm font-bold ${hot ? 'text-peach-300' : 'text-peach-600'}`}>{p.ui.perDay}</p>
              <ul className="mt-7 flex-1 space-y-3">
                {p.ui.features.map(f => (
                  <li key={f} className={`flex items-start gap-2.5 text-[15px] ${hot ? 'text-slate-200' : 'text-slate-700'}`}>
                    <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${hot ? 'text-sage-300' : 'text-sage-600'}`} /> {f}
                  </li>
                ))}
              </ul>
              <Link to={`/auth/signup?plan=${encodeURIComponent(p.code)}`}
                className={`mt-8 block rounded-2xl py-3.5 text-center font-bold transition-colors ${hot ? 'bg-sage-400 text-ink hover:bg-sage-500' : 'bg-beige text-ink hover:bg-beige-200'}`}>
                {p.ui.cta}
              </Link>
            </motion.div>
          );
        })}
      </div>
      <p className="mt-10 text-center text-sm text-slate-500">
        الأسعار لا تشمل ضريبة القيمة المضافة · بدون عقود ولا رسوم تركيب · الدفع بمدى وفيزا وماستركارد عبر ميسر
      </p>
    </>
  );
}

export function FAQList({ faqs, defaultOpen = 0 }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <h3>
              <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 py-5 text-start text-lg font-bold hover:text-sage-700">
                {f.q}
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-400" />
                </motion.span>
              </button>
            </h3>
            {/* الجواب موجود دائماً في الـ HTML (لمحركات البحث) ويُخفى بصرياً فقط */}
            <AnimatePresence initial={false}>
              <motion.div key="a" initial={false}
                animate={isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden" aria-hidden={!isOpen}>
                <p className="max-w-2xl pb-5 leading-relaxed text-slate-600">{f.a}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function CTABand({ title = 'جاهز تفتح الكاشير؟', text = 'سجّل الآن واطبع أول فاتورة اليوم — من 29 ريال شهرياً.' }) {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-sage-400 px-6 py-16 text-center text-ink sm:px-12">
        <motion.div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/40 blur-2xl"
          animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-peach-200/50 blur-2xl"
          animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
        <h2 className="relative text-3xl font-black sm:text-5xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-lg text-ink/70">{text}</p>
        <Link to="/auth/signup" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-8 py-4 text-lg font-black text-white transition-transform hover:bg-ink/90 hover:scale-[1.03]">
          أنشئ حسابك <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}
