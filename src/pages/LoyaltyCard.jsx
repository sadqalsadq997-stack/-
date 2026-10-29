import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LoyaltyCardView from '@/components/loyalty/LoyaltyCardView';
import MadeByFelsy from '@/components/MadeByFelsy';

// بطاقة الولاء العامة — /loyalty/:id
// تعرض تصميم المحل نفسه فقط (الاسم الأول + الطوابع) بدون جوال أو بريد
export default function LoyaltyCard() {
  const { id } = useParams();
  const [card, setCard] = useState(undefined);

  const [bump, setBump] = useState(false);

  // التحديث المباشر: كل 10 ثوانٍ والصفحة مفتوحة (الختم يظهر للعميل لحظة ما يُضاف)
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { setCard(null); return; }
    let alive = true; let prev = null;
    const load = () => supabase.rpc('public_loyalty_card', { p_customer: id }).then(({ data }) => {
      if (!alive) return;
      if (prev !== null && data && data.stamps !== prev) {
        setBump(true); setTimeout(() => setBump(false), 1600);
        try { navigator.vibrate?.(120); } catch { /* */ }
      }
      prev = data?.stamps ?? prev;
      setCard(data || null);
    });
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [id]);

  if (card === undefined) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  if (!card) return <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-6 text-center text-muted-foreground">البطاقة غير موجودة</div>;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background to-muted/40 flex flex-col items-center justify-center gap-5 p-4">
      {bump && <div role="status" className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-lg animate-bounce">⭐ وصلك ختم جديد!</div>}
      <div className={`w-full max-w-sm transition-transform duration-500 ${bump ? 'scale-105' : ''}`}>
        <LoyaltyCardView design={card} customerName={card.first_name || 'عميلنا العزيز'} stamps={card.stamps} points={card.points} businessName={card.business_name} />
      </div>
      <p className="text-xs text-muted-foreground">احفظ هذه الصفحة — أختامك تتحدث فيها تلقائياً مع كل زيارة</p>
      <MadeByFelsy />
    </div>
  );
}
