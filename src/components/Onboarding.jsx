import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store, Coffee, UtensilsCrossed, Car, ShoppingBag, Package } from 'lucide-react';
import { toast } from 'sonner';

const INDUSTRIES = [
  { value: 'restaurant', label: 'مطعم',          icon: UtensilsCrossed },
  { value: 'cafe',       label: 'كافيه',          icon: Coffee },
  { value: 'car_wash',   label: 'مغسلة سيارات',  icon: Car },
  { value: 'retail',     label: 'تجزئة',          icon: ShoppingBag },
  { value: 'wholesale',  label: 'جملة',           icon: Package },
  { value: 'general',    label: 'عام',            icon: Store },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (!industry || !name.trim()) return;
    setSaving(true);
    try {
      await supabase.from('app_settings').insert({
        onboarded: true,
        industry_type: industry,
        business_name: name.trim(),
      });

      const { data: existing } = await supabase.from('branches').select('id').limit(1);
      if (existing?.length) {
        await supabase.from('branches')
          .update({ industry_type: industry, name_ar: name.trim(), name: name.trim() })
          .eq('id', existing[0].id);
      } else {
        await supabase.from('branches').insert({
          name: name.trim(),
          name_ar: name.trim(),
          industry_type: industry,
        });
      }

      toast.success('تم الإعداد بنجاح — مرحباً بك!');
      onDone?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-[9999] p-4" dir="rtl">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <Store className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">مرحباً بك في فلسي</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 ? 'الخطوة 1 من 2 — نوع النشاط' : 'الخطوة 2 من 2 — اسم النشاط'}
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <Label className="text-base font-bold">اختر نوع نشاطك</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {INDUSTRIES.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setIndustry(item.value)}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    industry === item.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <item.icon className={`w-7 h-7 ${industry === item.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}
            </div>
            <Button className="w-full h-11" disabled={!industry} onClick={() => setStep(2)}>
              التالي
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>اسم النشاط التجاري</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: مطعم الفرسان"
                className="h-11 text-base mt-1"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(1)}>
                رجوع
              </Button>
              <Button
                className="flex-1 h-11"
                disabled={!name.trim() || saving}
                onClick={finish}
              >
                {saving ? 'جارٍ الإعداد...' : 'ابدأ الآن'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
