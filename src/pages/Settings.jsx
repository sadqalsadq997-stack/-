import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Settings as SettingsIcon, Building2, Printer, Shield, Save, Loader2, Plug, FileCheck, UserCircle, Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import ZatcaCenter from './ZatcaCenter';
import AccountTab from '@/components/settings/AccountTab';
import MenuDesignTab from '@/components/settings/MenuDesignTab';
import { getPrinterSettings, savePrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';

const TABS = [
  { id: 'account',  label: 'الحساب والاشتراك', icon: UserCircle },
  { id: 'business', label: 'بيانات المنشأة',   icon: Building2  },
  { id: 'menu',     label: 'تصميم المنيو',     icon: Palette    },
  { id: 'zatca',    label: 'الفوترة (ZATCA)',  icon: FileCheck  },
  { id: 'printer',  label: 'الطابعة',          icon: Printer    },
  { id: 'security', label: 'الأمان',           icon: Shield     },
];

// الحقول اللي يحفظها تبويب "بيانات المنشأة" فقط (ما نرسل الصف كامل)
const BUSINESS_FIELDS = ['business_name', 'vat_number', 'cr_number', 'phone', 'address', 'city', 'industry_type'];

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'account';
  const setTab = (id) => setParams({ tab: id }, { replace: true });
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1).then(({ data }) => {
      if (data?.[0]) setSettings(data[0]);
      setLoading(false);
    });
  }, []);

  async function saveBusiness() {
    if (settings.vat_number && !/^3\d{13}3$/.test(settings.vat_number)) { toast.error('الرقم الضريبي لازم 15 رقم يبدأ وينتهي بـ 3'); return; }
    setSaving(true);
    const patch = Object.fromEntries(BUSINESS_FIELDS.map(k => [k, settings[k] ?? null]));
    const { data, error } = settings.id
      ? await supabase.from('app_settings').update(patch).eq('id', settings.id).select().single()
      : await supabase.from('app_settings').insert(patch).select().single();
    setSaving(false);
    if (error) { toast.error('تعذر الحفظ'); return; }
    if (data) setSettings(data);
    toast.success('تم حفظ بيانات المنشأة');
  }

  const f = (key) => (e) => setSettings(v => ({ ...v, [key]: e.target.value }));

  return (
    <div dir="rtl" className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-black text-foreground">
        <SettingsIcon className="h-6 w-6 text-primary" /> الإعدادات
      </h1>

      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="scrollbar-none flex gap-1 overflow-x-auto lg:w-52 lg:flex-shrink-0 lg:flex-col" aria-label="أقسام الإعدادات">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm font-medium transition-colors
                ${tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
              <t.icon className="h-4 w-4 flex-shrink-0" />{t.label}
            </button>
          ))}
          <Link to="/kiosk" className="hidden items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 lg:flex">
            <Plug className="h-4 w-4" /> الكشك وأجهزة البيجر
          </Link>
        </nav>

        <div className="min-w-0 flex-1">
          {tab === 'account' ? <AccountTab />
          : tab === 'zatca' ? <ZatcaCenter />
          : loading ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : tab === 'menu' ? <MenuDesignTab settings={settings} setSettings={setSettings} />
          : tab === 'business' ? (
            <div className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
              <h3 className="font-bold text-foreground">بيانات المنشأة</h3>
              <p className="text-xs text-muted-foreground">تظهر في الفاتورة الضريبية والمنيو — تأكد إن الاسم والرقم الضريبي مطابقة لشهادة التسجيل في الضريبة.</p>
              {[
                { key: 'business_name', label: 'اسم المنشأة',        placeholder: 'مطعم الأصالة' },
                { key: 'vat_number',    label: 'الرقم الضريبي (15 رقم)', placeholder: '310000000000003', ltr: true },
                { key: 'cr_number',     label: 'السجل التجاري',       placeholder: '1010000000', ltr: true },
                { key: 'phone',         label: 'رقم الهاتف',          placeholder: '0500000000', ltr: true },
                { key: 'address',       label: 'العنوان',             placeholder: 'حي النزهة، شارع ...' },
                { key: 'city',          label: 'المدينة',             placeholder: 'الرياض' },
              ].map(inp => (
                <div key={inp.key}>
                  <label className="mb-1.5 block text-sm font-medium">{inp.label}</label>
                  <input value={settings[inp.key] || ''} onChange={f(inp.key)} placeholder={inp.placeholder} dir={inp.ltr ? 'ltr' : undefined}
                    className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm focus:border-primary focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-sm font-medium">نوع النشاط</label>
                <select value={settings.industry_type || 'general'} onChange={f('industry_type')}
                  className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm focus:border-primary focus:outline-none">
                  <option value="general">عام</option><option value="restaurant">مطعم</option><option value="cafe">كافيه</option>
                  <option value="retail">تجزئة</option><option value="car_wash">غسيل سيارات</option><option value="grocery">بقالة</option>
                </select>
              </div>
              <button onClick={saveBusiness} disabled={saving}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
              </button>
            </div>
          ) : tab === 'printer' ? <PrinterTab />
          : (
            <div className="max-w-lg space-y-3 rounded-2xl border border-border bg-card p-6 text-sm">
              <h3 className="font-bold text-foreground">الأمان</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>🔐 <b className="text-foreground">الدخول على خطوتين:</b> بريد وكلمة مرور المنشأة، ثم رمز PIN لكل موظف حسب صلاحياته.</li>
                <li>🛡️ <b className="text-foreground">حماية من التخمين:</b> 10 محاولات خاطئة من نفس الجهاز ⇒ إيقاف 30 دقيقة.</li>
                <li>🔑 <b className="text-foreground">رموز PIN مشفّرة</b> بـ bcrypt في السيرفر — ما أحد يقدر يقرأها حتى فريق فلسي.</li>
                <li>🏢 <b className="text-foreground">عزل كامل:</b> كل منشأة تشوف بياناتها فقط (Row Level Security في قاعدة البيانات).</li>
                <li>🌐 <b className="text-foreground">بدون أطراف ثالثة:</b> لا إعلانات ولا أدوات تتبّع، والخطوط تُحمّل من خوادم فلسي.</li>
                <li>⏱️ القفل التلقائي بعد الخمول يرجّع شاشة رمز الموظف.</li>
              </ul>
              <p className="text-xs text-muted-foreground">لتغيير رمز PIN المدير: من شاشة الدخول ← "تغيير PIN". لتغيير رموز الموظفين: صفحة الموظفين.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrinterTab() {
  const [p, setP] = useState(() => ({ ...DEFAULT_PRINTER, ...getPrinterSettings() }));
  const set = (patch) => setP(v => { const n = { ...v, ...patch }; savePrinterSettings(n); return n; });
  return (
    <div className="max-w-lg space-y-5 rounded-2xl border border-border bg-card p-6">
      <div>
        <h3 className="font-bold text-foreground">الطابعة الحرارية</h3>
        <p className="text-xs text-muted-foreground">الإعدادات تنحفظ على هذا الجهاز (كل كاشير له طابعته).</p>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">عرض الورق</label>
        <div className="flex gap-2">
          {['80mm', '58mm'].map(w => (
            <button key={w} type="button" onClick={() => set({ paperWidth: w })}
              className={`h-10 flex-1 rounded-xl text-sm font-bold ${p.paperWidth === w ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>{w}</button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
        <span className="text-sm"><b>طباعة الفاتورة فوراً</b><br /><span className="text-xs text-muted-foreground">تطلع الفاتورة لحظة إتمام البيع بدون ضغط</span></span>
        <input type="checkbox" checked={p.autoPrint !== false} onChange={e => set({ autoPrint: e.target.checked })} className="h-5 w-5 accent-[hsl(var(--primary))]" />
      </label>
      <div className="rounded-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-800 dark:text-sky-300">
        💡 للطباعة الفورية بدون نافذة التأكيد على ويندوز: شغّل كروم بإضافة <code dir="ltr">--kiosk-printing</code> لاختصار البرنامج، واختر الطابعة الحرارية كطابعة افتراضية.
      </div>
    </div>
  );
}
