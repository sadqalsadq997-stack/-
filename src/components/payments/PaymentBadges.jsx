import React, { useState } from 'react';

// ══════════════════════════════════════════════════════════════════
// وسائل الدفع المقبولة (Apple Pay · مدى · فيزا · ماستركارد · STC Pay)
// الشعارات الرسمية بخلفية شفافة في public/payments/*.png
// (إذا انحذف ملف، يظهر اسم الوسيلة نصاً مكانه بدون ما ينكسر الشكل)
// ══════════════════════════════════════════════════════════════════

export const PAYMENT_METHODS = [
  { id: 'applepay',   label: 'Apple Pay' },
  { id: 'mada',       label: 'مدى' },
  { id: 'visa',       label: 'VISA' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'stcpay',     label: 'STC Pay' },
  { id: 'amex',       label: 'American Express' },
];

function Badge({ id, label, tone }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className={`flex h-9 min-w-[3.75rem] items-center justify-center rounded-lg px-2.5 ${tone === 'dark' ? 'bg-white' : 'border border-slate-200 bg-white'}`}
      title={label}>
      {failed ? (
        <span className="text-[12px] font-black tracking-tight text-slate-800" dir="ltr">{label}</span>
      ) : (
        <img src={`/payments/${id}.png`} alt={label} className="h-6 w-auto max-w-[5rem] object-contain" width="80" height="24"
          loading="lazy" onError={() => setFailed(true)} />
      )}
    </li>
  );
}

export default function PaymentBadges({ tone = 'light', className = '', title = 'وسائل الدفع' }) {
  return (
    <div className={className}>
      {title && <p className={`mb-2 text-xs font-bold ${tone === 'dark' ? 'text-white' : 'text-slate-600'}`}>{title}</p>}
      <ul className="flex flex-wrap items-center gap-2" aria-label="وسائل الدفع المقبولة">
        {PAYMENT_METHODS.map(m => <Badge key={m.id} {...m} tone={tone} />)}
      </ul>
    </div>
  );
}
