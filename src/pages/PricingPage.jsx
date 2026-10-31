import React from 'react';
import { Check, Minus } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { Reveal, PricingCards, FAQList, CTABand, usePlans } from '@/components/marketing/blocks';
import { PRICING_FAQS as FAQS, CUSTOM_APP_PRICE } from '@/content/seo';
import { whatsappLink } from '@/lib/contact';
import { Smartphone, MessageCircle } from 'lucide-react';

const COMPARE = [
  ['نقطة البيع والفواتير الضريبية (ZATCA)', true, true, true],
  ['البيجر الإلكتروني بالباركود', true, true, true],
  ['المنتجات والمخزون', true, true, true],
  ['الفروع المشمولة', '1', '3', 'بلا حد'],
  ['كل فرع إضافي', '+29 ⃁', '+59 ⃁', '—'],
  ['عدد الفواتير', 'بلا حد', 'بلا حد', 'بلا حد'],
  ['برنامج الولاء (أختام ونقاط)', true, true, true],
  ['الطاولات وشاشة المطبخ', false, true, true],
  ['متجر إلكتروني ومنيو QR + دومين', false, true, true],
  ['بطاقة الولاء في محفظة الجوال', false, true, true],
  ['المحاسبة والمصروفات والموردين', false, true, true],
  ['المساعد الذكي', false, true, true],
  ['ربط API ومدير حساب مخصص', false, false, true],
];


function Cell({ v }) {
  if (v === true) return <Check className="mx-auto h-5 w-5 text-sage-600" aria-label="متاح" />;
  if (v === false) return <Minus className="mx-auto h-5 w-5 text-slate-300" aria-label="غير متاح" />;
  return <span className="font-bold">{v}</span>;
}

export default function PricingPage() {
  const plans = usePlans();
  const compareRows = COMPARE.map(row => {
    if (row[0] === 'الفروع المشمولة') {
      return [row[0], ...plans.map(p => p.includedBranches >= 999 ? 'بلا حد' : String(p.includedBranches))];
    }
    if (row[0] === 'كل فرع إضافي') {
      return [row[0], ...plans.map(p => p.includedBranches >= 999 ? '—' : `+${p.extraBranchPrice} ⃁`)];
    }
    return row;
  });

  return (
    <MarketingLayout path="/pricing">
      <section className="bg-gradient-to-b from-beige to-paper px-4 pb-24 pt-28 sm:px-6 lg:pt-36">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-black leading-tight sm:text-6xl">أسعار نظام نقاط البيع فلسي</h1>
            <p className="mt-5 text-lg text-slate-600">
              تبدأ الباقات من {plans[0]?.price ?? 29} ريال شهرياً. كل الباقات فيها الفوترة الإلكترونية والبيجر الإلكتروني، بدون عقود ولا رسوم تركيب.
            </p>
          </Reveal>
          <div className="mt-16"><PricingCards plans={plans} /></div>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Reveal><h2 className="text-3xl font-black sm:text-4xl">مقارنة الباقات</h2></Reveal>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-center text-[15px]">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="p-4 text-start font-bold text-slate-500">الميزة</th>
                  {plans.map(p => <th key={p.code} scope="col" className="p-4 font-black">{p.ui.name}<span className="block text-sm font-bold text-sage-700">{p.price} ⃁</span></th>)}
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([name, ...vals]) => (
                  <tr key={name} className="border-t border-slate-100">
                    <th scope="row" className="p-4 text-start font-medium text-slate-700">{name}</th>
                    {vals.map((v, i) => <td key={i} className="p-4"><Cell v={v} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-sm text-slate-500">مثال: تكلفة فرعين في الباقة الأساسية = سعر الفرع × 2. خصم 10% على 6 أشهر و20% على سنة. الأسعار قبل ضريبة القيمة المضافة.</p>

          {/* تطبيق خاص بالمنشأة */}
          <Reveal>
            <div className="mt-16 grid items-center gap-8 overflow-hidden rounded-3xl bg-ink p-8 text-white sm:p-10 md:grid-cols-[1fr_auto]">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold"><Smartphone className="h-3.5 w-3.5" />إضافة</span>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">تطبيق خاص باسم منشأتك</h2>
                <p className="mt-3 max-w-xl text-white/75">تطبيق جوال بشعارك وألوانك يحمّله عملاؤك: المنيو والطلب أونلاين وبطاقة الولاء والعروض — كل الطلبات توصل نظام فلسي حقك مباشرة.</p>
                <ul className="mt-5 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
                  {['اسم وأيقونة وألوان منشأتك', 'منيو وطلبات أونلاين', 'بطاقة الولاء داخل التطبيق', 'مربوط مع نقطة البيع والمطبخ'].map(t => (
                    <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-sage-300" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="text-center md:text-left">
                <p className="text-5xl font-black">{CUSTOM_APP_PRICE} <span className="text-2xl">⃁</span></p>
                <p className="text-sm text-white/60">دفعة وحدة · قبل الضريبة</p>
                <a href={whatsappLink(`السلام عليكم، أبي تطبيق خاص لمنشأتي (${CUSTOM_APP_PRICE} ريال)`)} target="_blank" rel="noopener"
                  className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 font-black text-ink">
                  <MessageCircle className="h-5 w-5" /> اطلبه بالواتساب
                </a>
              </div>
            </div>
          </Reveal>

          <h2 className="mb-6 mt-20 text-3xl font-black">أسئلة عن الأسعار والدفع</h2>
          <FAQList faqs={FAQS} />
        </div>
      </section>
      <CTABand />
    </MarketingLayout>
  );
}
