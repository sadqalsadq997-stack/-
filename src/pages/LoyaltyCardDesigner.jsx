import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';
import {
  Wallet, Save, Loader2, Upload, X, Stamp, Star,
  Sparkles, Smartphone, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/images';
import LoyaltyCardView, { LOYALTY_ANIMATIONS, LOYALTY_COLORS } from '@/components/loyalty/LoyaltyCardView';

// ══════════════════════════════════════════════════════
// صفحة تصميم بطاقة الولاء — Google Wallet
// كل منشأة (tenant) لها تصميم واحد، يُستخدم لإصدار بطاقات
// Google Wallet الحقيقية لكل عملائها.
// ══════════════════════════════════════════════════════

const DEFAULT_DESIGN = {
  program_name: 'برنامج الولاء',
  background_color: '#4F7360',
  text_color: '#ffffff',
  accent_color: '#ffffff',
  animation: 'shine',
  program_type: 'stamps',
  stamps_required: 10,
  reward_description: 'مكافأة مجانية',
  points_per_currency_unit: 1,
  min_redeem_points: 100,
  completion_message: '🎉 تهانينا! اطلب مكافأتك الآن',
};


function ImageUploadBox({ label, value, onChange, aspectHint }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadImage(file, 'loyalty', { max: 900, quality: 0.85 }));
      toast.success('تم رفع الصورة');
    } catch (err) {
      toast.error('فشل رفع الصورة: ' + (err.message || ''));
    }
    setUploading(false);
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : value ? (
            <img src={value} alt={label} className="w-full h-full object-contain" />
          ) : (
            <Upload className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-medium cursor-pointer hover:bg-muted">
            <Upload className="w-3.5 h-3.5" />
            {value ? 'تغيير الصورة' : 'رفع صورة'}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
          {value && (
            <button onClick={() => onChange(null)} className="ml-2 text-xs text-red-500 hover:underline">إزالة</button>
          )}
          {aspectHint && <p className="text-[11px] text-muted-foreground mt-1">{aspectHint}</p>}
        </div>
      </div>
    </div>
  );
}

function CardPreview({ design }) {
  return (
    <div className="sticky top-4">
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <Smartphone className="w-3.5 h-3.5" /> معاينة كما تظهر في جوال العميل
      </p>
      <div className="mx-auto w-full max-w-[320px]">
        <LoyaltyCardView design={design} customerName="عبدالله" stamps={Math.min(3, Number(design.stamps_required) || 10)} points={240} />
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">البطاقة خاصة بمحلك وعملائك فقط — ما تظهر لأي منشأة ثانية.</p>
    </div>
  );
}

export default function LoyaltyCardDesigner() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [design, setDesign] = useState(DEFAULT_DESIGN);
  const [recordId, setRecordId] = useState(null);
  const [tenantId, setTenantId] = useState(null);

  const set = (k, v) => setDesign(d => ({ ...d, [k]: v }));

  // جلب tenant_id الخاص بالمستخدم الحالي
  const { data: tenantRow, isLoading: tenantLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!session?.user?.id,
  });

  useEffect(() => {
    if (tenantRow?.tenant_id) setTenantId(tenantRow.tenant_id);
  }, [tenantRow]);

  const { isLoading } = useQuery({
    queryKey: ['loyalty-card-design', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('loyalty_card_designs')
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) { setDesign(d => ({ ...d, ...data })); setRecordId(data.id); }
      return data;
    },
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('لا يمكن تحديد المنشأة الحالية');
      const payload = {
        ...design,
        tenant_id: tenantId,
        stamps_required: Number(design.stamps_required),
        points_per_currency_unit: Number(design.points_per_currency_unit),
        min_redeem_points: Number(design.min_redeem_points),
      };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.google_wallet_class_id;
      delete payload.google_wallet_class_synced;

      if (recordId) {
        const { error } = await supabase.from('loyalty_card_designs').update(payload).eq('id', recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('loyalty_card_designs').insert(payload).select().single();
        if (error) throw error;
        setRecordId(data.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loyalty-card-design'] });
      toast.success('تم حفظ تصميم البطاقة — سيتم استخدامه تلقائياً عند إصدار بطاقات العملاء الجديدة');
    },
    onError: (err) => toast.error('فشل الحفظ: ' + (err.message || '')),
  });

  if (tenantLoading || isLoading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (!tenantId) {
    return (
      <div dir="rtl" className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm">لم يتم ربط حسابك بمنشأة بعد</p>
          <p className="text-sm mt-1">يجب إنشاء سجل في جدول tenant_users يربط حسابك بمنشأتك قبل استخدام هذه الشاشة.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />تصميم بطاقة الولاء (Google Wallet)
        </h1>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-5">
          {/* الهوية */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />هوية البطاقة</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم برنامج الولاء</label>
              <input value={design.program_name} onChange={e => set('program_name', e.target.value)}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
            </div>
            <ImageUploadBox label="شعار المحل (Logo)" value={design.logo_url} onChange={v => set('logo_url', v)}
              aspectHint="يفضّل صورة مربعة بخلفية شفافة" />
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">لونك المفضل (خلفية البطاقة)</label>
              <div className="flex items-center gap-2 flex-wrap">
                {LOYALTY_COLORS.map(c => (
                  <button key={c} onClick={() => set('background_color', c)}
                    className={`w-8 h-8 rounded-full border-2 ${design.background_color === c ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={design.background_color} onChange={e => set('background_color', e.target.value)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-border cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">لون النص</label>
              <div className="flex items-center gap-2">
                {['#ffffff', '#111827'].map(c => (
                  <button key={c} onClick={() => set('text_color', c)}
                    className={`w-8 h-8 rounded-full border-2 ${design.text_color === c ? 'border-primary' : 'border-border'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* الحركة */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />حركة البطاقة</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LOYALTY_ANIMATIONS.map(a => {
                const on = design.animation === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => set('animation', a.id)} aria-pressed={on}
                    className={`rounded-2xl border p-2 text-right transition ${on ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
                    <LoyaltyCardView compact design={{ ...design, animation: a.id, stamps_required: 5 }} customerName="عميل" stamps={3} className="pointer-events-none !rounded-xl !shadow-md" />
                    <p className="mt-2 text-xs font-bold text-foreground">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">لون الطوابع المكتملة</label>
              <div className="flex items-center gap-2 flex-wrap">
                {['#ffffff', '#FDE68A', '#F5D0C5', '#CFE0D5', '#111827'].map(c => (
                  <button key={c} type="button" onClick={() => set('accent_color', c)} aria-label={c}
                    className={`w-8 h-8 rounded-full border-2 ${design.accent_color === c ? 'border-primary' : 'border-border'}`} style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={design.accent_color || '#ffffff'} onChange={e => set('accent_color', e.target.value)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-border cursor-pointer" aria-label="لون مخصص" />
              </div>
            </div>
          </div>

          {/* نوع البرنامج */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><Stamp className="w-4 h-4 text-primary" />نوع برنامج الولاء</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => set('program_type', 'stamps')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${design.program_type === 'stamps' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                <Stamp className="w-4 h-4" />طوابع (مثل: 3 غسلات + الرابعة مجاناً)
              </button>
              <button onClick={() => set('program_type', 'points')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${design.program_type === 'points' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                <Star className="w-4 h-4" />نقاط (نقاط مقابل كل عملية شراء)
              </button>
            </div>

            {design.program_type === 'stamps' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">عدد الطوابع المطلوبة للمكافأة</label>
                  <input type="number" min={1} value={design.stamps_required} onChange={e => set('stamps_required', e.target.value)}
                    className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">وصف المكافأة</label>
                  <input value={design.reward_description || ''} onChange={e => set('reward_description', e.target.value)}
                    className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">نقاط لكل ريال</label>
                  <input type="number" step="0.1" value={design.points_per_currency_unit} onChange={e => set('points_per_currency_unit', e.target.value)}
                    className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الحد الأدنى للاستبدال</label>
                  <input type="number" value={design.min_redeem_points} onChange={e => set('min_redeem_points', e.target.value)}
                    className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>
            )}
          </div>

          {/* عند الإكمال */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />عند اكتمال البطاقة</h2>
            <ImageUploadBox label="صورة / إيموجي الإكمال (تظهر للعميل عند اكتمال بطاقته)" value={design.completion_emoji_url}
              onChange={v => set('completion_emoji_url', v)} aspectHint="مثال: صورة كنفيتي، نجمة، أو شعار خاص" />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">رسالة الإكمال</label>
              <input value={design.completion_message || ''} onChange={e => set('completion_message', e.target.value)}
                className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>

        <CardPreview design={design} />
      </div>
    </div>
  );
}
