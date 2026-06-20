import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Gift, Star } from 'lucide-react';

export default function LoyaltyCard() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    supabase.from('customers').select('*').eq('id', id).maybeSingle().then(({ data }) => setCustomer(data));
    supabase.from('loyalty_settings').select('*').limit(1).maybeSingle().then(({ data }) => setSettings(data));
  }, [id]);

  if (!customer) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  const stamps = customer.loyalty_stamps || 0;
  const maxStamps = settings?.stamps_required || 10;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 to-background flex items-center justify-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
        <Gift className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-black text-foreground mb-1">{customer.name || 'عزيزي العميل'}</h1>
        <p className="text-muted-foreground text-sm mb-6">بطاقة الولاء</p>
        <div className="bg-muted/30 rounded-2xl p-6 mb-6">
          <p className="text-5xl font-black text-primary mb-1">{stamps}</p>
          <p className="text-sm text-muted-foreground">من أصل {maxStamps} طابع</p>
        </div>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {Array(maxStamps).fill(0).map((_, i) => (
            <div key={i} className={`aspect-square rounded-xl flex items-center justify-center ${i < stamps ? 'bg-primary text-primary-foreground' : 'bg-muted/50'}`}>
              <Star className={`w-4 h-4 ${i < stamps ? 'fill-current' : ''}`} />
            </div>
          ))}
        </div>
        {stamps >= maxStamps && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl p-3 text-sm font-bold">
            🎉 تهانينا! اطلب مكافأتك الآن
          </div>
        )}
      </div>
    </div>
  );
}
