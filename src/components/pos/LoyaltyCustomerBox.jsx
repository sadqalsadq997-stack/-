import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Gift, UserPlus, X, Send, Star } from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════════════════
// عميل الولاء في نقطة البيع
//  • الكاشير يكتب جوال العميل ← يظهر رصيده
//  • عند إتمام البيع يُضاف الختم في السيرفر (add_loyalty_stamps)
//    وبطاقة العميل في جواله تتحدث تلقائياً خلال ثوانٍ
// ══════════════════════════════════════════════════════════════════

const normPhone = (v) => {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  if (d.startsWith('966')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = '0' + d;
  return d;
};

export function cardLink(customerId) {
  return `${window.location.origin}/loyalty/${customerId}`;
}

export function sendCardWhatsApp(customer) {
  const p = normPhone(customer.phone).replace(/^0/, '966');
  const msg = `أهلاً ${customer.name || ''} 👋\nبطاقة الولاء حقتك — أختامك تتحدث فيها مباشرة:\n${cardLink(customer.id)}`;
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

export default function LoyaltyCustomerBox({ customer, onChange, required = 10 }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState('idle'); // idle | searching | notfound
  const [busy, setBusy] = useState(false);

  async function lookup(e) {
    e?.preventDefault();
    const p = normPhone(phone);
    if (p.length < 9) { toast.error('اكتب رقم جوال صحيح'); return; }
    setState('searching');
    const { data } = await supabase.from('customers').select('id, name, phone, stamps, loyalty_points')
      .in('phone', [p, p.replace(/^0/, '966'), p.replace(/^0/, '+966')]).limit(1).maybeSingle();
    if (data) { onChange(data); setPhone(''); setState('idle'); }
    else setState('notfound');
  }

  async function create(e) {
    e?.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.from('customers')
      .insert({ phone: normPhone(phone), name: name.trim() || 'عميل', stamps: 0 })
      .select('id, name, phone, stamps, loyalty_points').single();
    setBusy(false);
    if (error) { toast.error('تعذر إضافة العميل'); return; }
    onChange(data); setPhone(''); setName(''); setState('idle');
    toast.success('تم تسجيل العميل في برنامج الولاء');
  }

  async function redeem() {
    setBusy(true);
    const { data, error } = await supabase.rpc('redeem_loyalty_reward', { p_customer: customer.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChange({ ...customer, stamps: data.stamps });
    toast.success('🎁 تم صرف المكافأة');
  }

  if (customer) {
    const s = customer.stamps || 0;
    const ready = s >= required;
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-foreground">{customer.name}</p>
            <p className="text-muted-foreground" dir="ltr">{customer.phone}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => sendCardWhatsApp(customer)} title="إرسال البطاقة للعميل بالواتساب"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-primary"><Send className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onChange(null)} aria-label="إزالة العميل"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1" aria-label={`${s} من ${required} أختام`}>
          {Array.from({ length: Math.min(required, 12) }).map((_, i) => (
            <Star key={i} className={`h-3.5 w-3.5 ${i < s ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`} />
          ))}
          <span className="mr-auto font-bold text-primary">{s}/{required}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">+1 ختم تلقائياً عند إتمام البيع</p>
        {ready && (
          <button type="button" onClick={redeem} disabled={busy}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-amber-500 font-bold text-white disabled:opacity-50">
            <Gift className="h-3.5 w-3.5" /> صرف المكافأة الآن
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={state === 'notfound' ? create : lookup} className="space-y-1.5">
      <div className="flex gap-1.5">
        <input value={phone} onChange={e => { setPhone(e.target.value); setState('idle'); }} inputMode="tel" dir="ltr"
          placeholder="جوال العميل (للأختام)" aria-label="جوال العميل"
          className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-right text-xs focus:border-primary focus:outline-none" />
        {state !== 'notfound' && (
          <button type="submit" disabled={state === 'searching'} className="h-9 rounded-xl bg-muted px-3 text-xs font-bold text-foreground hover:bg-muted/70">
            {state === 'searching' ? '...' : 'بحث'}
          </button>
        )}
      </div>
      {state === 'notfound' && (
        <div className="flex gap-1.5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم العميل الجديد" autoFocus
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs focus:border-primary focus:outline-none" />
          <button type="submit" disabled={busy} className="flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
            <UserPlus className="h-3.5 w-3.5" /> تسجيل
          </button>
        </div>
      )}
    </form>
  );
}
