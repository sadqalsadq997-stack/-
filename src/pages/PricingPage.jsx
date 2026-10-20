import React from 'react';
import { Check, Minus } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { Reveal, PricingCards, FAQList, CTABand } from '@/components/marketing/blocks';
import { PRICES, PRICING_FAQS as FAQS } from '@/content/seo';

const COMPARE = [
  ['نقطة البيع والفواتير الضريبية (ZATCA)', true, true, true],
  ['البيجر الإلكتروني بالباركود', true, true, true],
  ['المنتجات والمخزون', true, true, true],
  ['عدد الفروع', '1', 'حتى 3', 'بلا حد'],
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
  return (
    <MarketingLayout path="/pricing">
      <section className="bg-gradient-to-b from-beige to-paper px-4 pb-24 pt-28 sm:px-6 lg:pt-36">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-black leading-tight sm:text-6xl">أسعار نظام نقاط البيع فلسي</h1>
            <p className="mt-5 text-lg text-slate-600">
              من {PRICES[0].price} ريال بالشهر — أقل من ريال باليوم. كل الباقات فيها الفوترة الإلكترونية والبيجر الإلكتروني، بدون عقود ولا رسوم تركيب.
            </p>
          </Reveal>
          <div className="mt-16"><PricingCards /></div>
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
                  {PRICES.map(p => <th key={p.code} scope="col" className="p-4 font-black">{p.name}<span className="block text-sm font-bold text-sage-700">{p.price} ريال</span></th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([name, ...vals]) => (
                  <tr key={name} className="border-t border-slate-100">
                    <th scope="row" className="p-4 text-start font-medium text-slate-700">{name}</th>
                    {vals.map((v, i) => <td key={i} className="p-4"><Cell v={v} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-6 mt-20 text-3xl font-black">أسئلة عن الأسعار والدفع</h2>
          <FAQList faqs={FAQS} />
        </div>
      </section>
      <CTABand />
    </MarketingLayout>
  );
}
