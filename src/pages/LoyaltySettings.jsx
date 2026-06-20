import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star, Save, Loader2, Gift, Stamp } from 'lucide-react';
import { toast } from 'sonner';

export default function LoyaltySettings() {
  const [form, setForm] = useState({
    points_per_sar: 1,
    sar_per_point: 0.1,
    min_redeem_points: 100,
    stamps_threshold: 10,
    stamps_reward: 'وجبة مجانية',
    loyalty_enabled: true,
    stamps_enabled: false,
  });
  const [recordId, setRecordId] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const qc = useQueryClient();

  const { isLoading } = useQuery({
    queryKey: ['loyalty-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loyalty_settings').select('*').limit(1);
      if (error) throw error;
      if (data?.[0]) { setForm(f => ({ ...f, ...data[0] })); setRecordId(data[0].id); }
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, points_per_sar: Number(form.points_per_sar), sar_per_point: Number(form.sar_per_point), min_redeem_points: Number(form.min_redeem_points), stamps_threshold: Number(form.stamps_threshold) };
      if (recordId) {
        const { error } = await supabase.from('loyalty_settings').update(payload).eq('id', recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('loyalty_settings').insert(payload).select().single();
        if (error) throw error;
        setRecordId(data.id);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty-settings'] }); toast.success('تم حفظ إعدادات الولاء'); },
    onError: () => toast.error('فشل الحفظ'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div dir="rtl" className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Star className="w-6 h-6 text-primary" />إعدادات الولاء
        </h1>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ
        </button>
      </div>

      {/* نقاط الولاء */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Star className="w-5 h-5 text-amber-500" />نقاط الولاء</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">تفعيل</span>
            <div onClick={() => set('loyalty_enabled', !form.loyalty_enabled)}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.loyalty_enabled ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${form.loyalty_enabled ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </label>
        </div>
        {form.loyalty_enabled && (
          <div className="grid grid-cols-3 gap-4">
            {[
              ['points_per_sar', 'نقاط لكل ريال', 'number'],
              ['sar_per_point', 'قيمة النقطة (ريال)', 'number'],
              ['min_redeem_points', 'الحد الأدنى للاستبدال', 'number'],
            ].map(([k,l,t]) => (
              <div key={k}>
                <label className="text-xs text-muted-foreground mb-1 block">{l}</label>
                <input type={t} step="0.01" value={form[k]} onChange={e => set(k, e.target.value)}
                  className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
              </div>
            ))}
          </div>
        )}
        {form.loyalty_enabled && (
          <div className="bg-amber-50 text-amber-700 text-sm rounded-xl p-3">
            كل {form.points_per_sar} نقطة لكل ريال · قيمة النقطة {form.sar_per_point} ريال · الحد الأدنى للاستبدال {form.min_redeem_points} نقطة
          </div>
        )}
      </div>

      {/* الطوابع */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Stamp className="w-5 h-5 text-blue-500" />بطاقة الطوابع</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">تفعيل</span>
            <div onClick={() => set('stamps_enabled', !form.stamps_enabled)}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.stamps_enabled ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${form.stamps_enabled ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </label>
        </div>
        {form.stamps_enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد الطوابع للمكافأة</label>
              <input type="number" min={1} value={form.stamps_threshold} onChange={e => set('stamps_threshold', e.target.value)}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">وصف المكافأة</label>
              <input value={form.stamps_reward||''} onChange={e => set('stamps_reward', e.target.value)}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
        )}
        {form.stamps_enabled && (
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: Number(form.stamps_threshold) }).map((_, i) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-dashed border-blue-300 bg-blue-50 flex items-center justify-center text-xs text-blue-400 font-bold">{i+1}</div>
            ))}
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
              <Gift className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
