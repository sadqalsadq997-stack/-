import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Settings as SettingsIcon, Building2, Printer, Globe, Shield,
  Bell, Save, Loader2, Plug, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import ZATCASettings from './ZATCASettings';

const TABS = [
  { id: 'business', label: 'بيانات المنشأة', icon: Building2  },
  { id: 'zatca',    label: 'ZATCA',           icon: FileCheck  },
  { id: 'printer',  label: 'الطابعة',         icon: Printer    },
  { id: 'domain',   label: 'الدومين',          icon: Globe      },
  { id: 'security', label: 'الأمان',           icon: Shield     },
  { id: 'notif',    label: 'الإشعارات',        icon: Bell       },
];

export default function Settings() {
  const [tab, setTab]           = useState('business');
  const [settings, setSettings] = useState({});
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1)
      .then(({ data }) => {
        if (data?.[0]) setSettings(data[0]);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      if (settings.id) {
        await supabase.from('app_settings').update(settings).eq('id', settings.id);
      } else {
        const { data } = await supabase.from('app_settings').insert(settings).select().single();
        if (data) setSettings(data);
      }
      toast.success('✅ تم حفظ الإعدادات');
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  }

  const f = (key) => (e) => setSettings(v => ({ ...v, [key]: e.target.value }));

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary" /> الإعدادات
        </h1>
        {tab !== 'zatca' && (
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
          </button>
        )}
      </div>

      {/* بانر الكشك */}
      <Link to="/kiosk"
        className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3.5 hover:bg-primary/10 transition-colors group">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Plug className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">ربط الكشك والبيجر</p>
          <p className="text-xs text-muted-foreground">إعداد كشك الطلبات الذاتي وجهاز البيجر — Plug & Play</p>
        </div>
        <span className="text-xs text-primary font-medium group-hover:underline">فتح ←</span>
      </Link>

      <div className="flex gap-4">
        {/* تبويبات جانبية */}
        <div className="w-48 flex-shrink-0 space-y-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-right
                ${tab === t.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
              <t.icon className="w-4 h-4 flex-shrink-0" />{t.label}
              {t.id === 'zatca' && (
                <span className="mr-auto text-[10px] bg-primary text-primary-foreground px-1.5 rounded-md">Phase 2</span>
              )}
            </button>
          ))}
        </div>

        {/* محتوى التبويب */}
        <div className="flex-1">
          {/* ── ZATCA ── */}
          {tab === 'zatca' ? (
            <ZATCASettings />
          ) : loading ? (
            <div className="bg-card border border-border rounded-2xl p-6 flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : tab === 'business' ? (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 max-w-lg">
              <h3 className="font-bold text-foreground mb-4">بيانات المنشأة</h3>
              {[
                { key: 'business_name', label: 'اسم المنشأة',       placeholder: 'مطعم الأصالة'     },
                { key: 'vat_number',    label: 'رقم الضريبة (VAT)',  placeholder: '310000000000003'  },
                { key: 'cr_number',     label: 'السجل التجاري',      placeholder: '1010000000'       },
                { key: 'phone',         label: 'رقم الهاتف',         placeholder: '0500000000'       },
                { key: 'address',       label: 'العنوان',            placeholder: 'الرياض، حي النزهة'},
                { key: 'city',          label: 'المدينة',            placeholder: 'الرياض'           },
              ].map(inp => (
                <div key={inp.key}>
                  <label className="text-sm font-medium block mb-1.5">{inp.label}</label>
                  <input value={settings[inp.key] || ''} onChange={f(inp.key)} placeholder={inp.placeholder}
                    className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
                </div>
              ))}
              <div>
                <label className="text-sm font-medium block mb-1.5">نوع النشاط</label>
                <select value={settings.industry_type || 'general'} onChange={f('industry_type')}
                  className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
                  <option value="general">عام</option>
                  <option value="restaurant">مطعم</option>
                  <option value="cafe">كافيه</option>
                  <option value="retail">تجزئة</option>
                  <option value="car_wash">غسيل سيارات</option>
                  <option value="grocery">بقالة</option>
                </select>
              </div>
            </div>
          ) : tab === 'printer' ? (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 max-w-lg">
              <h3 className="font-bold text-foreground mb-4">إعدادات الطابعة الحرارية</h3>
              <div>
                <label className="text-sm font-medium block mb-1.5">نوع الطابعة</label>
                <select className="w-full h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
                  <option value="browser">طباعة المتصفح (افتراضي)</option>
                  <option value="network">طابعة شبكية</option>
                  <option value="usb">طابعة USB</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">عرض الورق</label>
                <div className="flex gap-2">
                  {['58mm', '80mm'].map(w => (
                    <button key={w} className="flex-1 h-10 bg-muted rounded-xl text-sm font-medium hover:bg-primary/10 hover:text-primary transition-colors">{w}</button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
                💡 للطابعات الشبكية أدخل IP الطابعة ومنفذ الاتصال (افتراضي 9100)
              </div>
            </div>
          ) : tab === 'security' ? (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 max-w-lg">
              <h3 className="font-bold text-foreground mb-4">إعدادات الأمان</h3>
              <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-bold text-foreground">🔐 نظام PIN</p>
                <p>لتغيير رمز PIN المدير، اخرج من النظام وادخل مجدداً ثم اختر "تغيير PIN".</p>
                <p>يتم تشفير PIN بـ SHA-256 ولا يُخزّن بشكل مقروء.</p>
                <p>يُقفل النظام تلقائياً بعد 5 محاولات فاشلة لمدة دقيقتين.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm">تسجيل خروج تلقائي بعد الخمول (30 دقيقة)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm">تشفير البيانات المحلية</span>
              </label>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 flex items-center justify-center h-40 text-muted-foreground text-sm">
              الإعدادات ستكون متاحة قريباً
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
