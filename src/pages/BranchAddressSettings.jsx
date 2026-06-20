import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Save, Loader2, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════
// شاشة عنوان الفرع للإشعارات الآلية (SMS/واتساب)
// كل فرع يمكن أن يكون له عنوان مختلف يظهر برسائل العميل،
// مثل: "بطاقتك جاهزة — فرع العليا، شارع التحلية"
// ══════════════════════════════════════════════════════

function BranchAddressRow({ branch, onSaved }) {
  const [form, setForm] = useState({
    notification_address: branch.notification_address || '',
    notification_address_ar: branch.notification_address_ar || '',
    notification_sms_sender: branch.notification_sms_sender || '',
    notification_phone_country: branch.notification_phone_country || '+966',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from('branches').update(form).eq('id', branch.id);
      if (error) throw error;
      toast.success(`تم حفظ عنوان فرع "${branch.name}"`);
      onSaved?.();
    } catch (err) {
      toast.error('فشل الحفظ: ' + (err.message || ''));
    }
    setSaving(false);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" />{branch.name}</h3>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}حفظ
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">العنوان (عربي) — يظهر بنص الرسالة</label>
          <input value={form.notification_address_ar} onChange={e => set('notification_address_ar', e.target.value)}
            placeholder="مثال: فرع العليا، شارع التحلية"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">العنوان (إنجليزي / اختياري)</label>
          <input value={form.notification_address} onChange={e => set('notification_address', e.target.value)}
            placeholder="e.g. Olaya Branch, Tahlia St."
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">اسم المرسل في الرسائل (Sender ID)</label>
          <input value={form.notification_sms_sender} onChange={e => set('notification_sms_sender', e.target.value)}
            placeholder="مثال: FELSY"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">رمز الدولة الافتراضي</label>
          <input value={form.notification_phone_country} onChange={e => set('notification_phone_country', e.target.value)}
            placeholder="+966"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
      </div>
      {form.notification_address_ar && (
        <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground flex items-start gap-2">
          <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>معاينة الرسالة: "تم تحديث بطاقة ولائك بنجاح — {form.notification_address_ar}. لإضافتها لجوالك: [رابط البطاقة]"</span>
        </div>
      )}
    </div>
  );
}

export default function BranchAddressSettings() {
  const { data: branches = [], isLoading, refetch } = useQuery({
    queryKey: ['branches-notification-address'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div dir="rtl" className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <MapPin className="w-6 h-6 text-primary" />عنوان الفروع للرسائل الآلية
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          هذا العنوان يظهر في رسائل SMS التي تُرسل تلقائياً للعميل (مثل تحديثات بطاقة الولاء)، لكل فرع عنوانه الخاص.
        </p>
      </div>

      {branches.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Plus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد فروع مسجّلة بعد — أضف فرعاً أولاً من شاشة الفروع</p>
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map(b => (
            <BranchAddressRow key={b.id} branch={b} onSaved={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
