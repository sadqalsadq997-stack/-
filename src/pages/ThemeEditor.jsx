import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Palette, Save, RotateCcw, Eye, Loader2, CheckCircle2, Monitor, Smartphone, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════
// صفحة تخصيص الواجهة — Theme Editor
// ══════════════════════════════════════════════════════

const PRESETS = [
  {
    id: 'red',       label: 'أحمر فلسي',
    primary: '#dc2626', primaryFg: '#ffffff',
    bg: '#ffffff',  card: '#f9fafb',  fg: '#111827',
    border: '#e5e7eb', radius: '12px', font: 'Tajawal',
  },
  {
    id: 'emerald',   label: 'أخضر طازج',
    primary: '#059669', primaryFg: '#ffffff',
    bg: '#ffffff',  card: '#f0fdf4',  fg: '#064e3b',
    border: '#d1fae5', radius: '12px', font: 'Tajawal',
  },
  {
    id: 'violet',    label: 'بنفسجي راقي',
    primary: '#7c3aed', primaryFg: '#ffffff',
    bg: '#ffffff',  card: '#faf5ff',  fg: '#1e1b4b',
    border: '#ede9fe', radius: '12px', font: 'Cairo',
  },
  {
    id: 'amber',     label: 'ذهبي دافئ',
    primary: '#d97706', primaryFg: '#ffffff',
    bg: '#fffbeb',  card: '#ffffff',  fg: '#78350f',
    border: '#fde68a', radius: '12px', font: 'Tajawal',
  },
  {
    id: 'dark',      label: 'داكن أنيق',
    primary: '#f97316', primaryFg: '#ffffff',
    bg: '#0f172a',  card: '#1e293b',  fg: '#f1f5f9',
    border: '#334155', radius: '12px', font: 'Tajawal',
  },
  {
    id: 'rose',      label: 'وردي ناعم',
    primary: '#e11d48', primaryFg: '#ffffff',
    bg: '#fff1f2',  card: '#ffffff',  fg: '#881337',
    border: '#fecdd3', radius: '16px', font: 'Noto Kufi Arabic',
  },
];

const FONT_OPTIONS = ['Tajawal', 'Cairo', 'Noto Kufi Arabic', 'IBM Plex Sans Arabic'];

const DEFAULT_THEME = PRESETS[0];

export default function ThemeEditor() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState('desktop');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ── تحميل الثيم المحفوظ ─────────────────────────────
  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1)
      .then(({ data }) => {
        const s = data?.[0];
        if (s?.theme) {
          const t = JSON.parse(s.theme);
          setTheme(t);
          setSaved(t);
          applyTheme(t);
        }
        if (s?.logo_url) setLogoPreview(s.logo_url);
        setLoading(false);
      });
  }, []);

  // ── تطبيق الثيم على المتصفح ──────────────────────────
  const applyTheme = useCallback((t) => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', t.primary);
    root.style.setProperty('--theme-primary-fg', t.primaryFg);
    root.style.setProperty('--theme-bg', t.bg);
    root.style.setProperty('--theme-card', t.card);
    root.style.setProperty('--theme-fg', t.fg);
    root.style.setProperty('--theme-border', t.border);
    root.style.setProperty('--theme-radius', t.radius);
    // خط
    const fontLink = document.getElementById('theme-font-link') || (() => {
      const l = document.createElement('link'); l.id = 'theme-font-link'; l.rel = 'stylesheet';
      document.head.appendChild(l); return l;
    })();
    fontLink.href = `https://fonts.googleapis.com/css2?family=${t.font?.replace(/ /g, '+')}:wght@400;500;700;900&display=swap`;
    root.style.setProperty('--theme-font', `'${t.font}', sans-serif`);
  }, []);

  function update(key, value) {
    const next = { ...theme, [key]: value };
    setTheme(next);
    applyTheme(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      let logoUrl = logoPreview;

      // رفع الشعار
      if (logoFile) {
        setUploadingLogo(true);
        const ext = logoFile.name.split('.').pop();
        const path = `logos/brand-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('uploads').upload(path, logoFile, { upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path);
          logoUrl = publicUrl;
          setLogoPreview(publicUrl);
          setLogoFile(null);
        }
        setUploadingLogo(false);
      }

      const themeJson = JSON.stringify(theme);
      const { data: existing } = await supabase.from('app_settings').select('id').limit(1).maybeSingle();

      if (existing?.id) {
        await supabase.from('app_settings').update({ theme: themeJson, logo_url: logoUrl }).eq('id', existing.id);
      } else {
        await supabase.from('app_settings').insert({ theme: themeJson, logo_url: logoUrl });
      }

      // تحديث شعار الفروع أيضاً
      if (logoUrl && logoUrl !== logoPreview) {
        await supabase.from('branches').update({ logo_url: logoUrl }).neq('id', '00000000-0000-0000-0000-000000000000');
      }

      setSaved(theme);
      toast.success('✅ تم حفظ التصميم بنجاح');
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  }

  function handleReset() {
    const t = saved || DEFAULT_THEME;
    setTheme(t);
    applyTheme(t);
    toast('↩️ تم الرجوع للتصميم المحفوظ');
  }

  function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  const swatch = (key, label, desc) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        <label className="relative cursor-pointer group">
          <input type="color" value={theme[key] || '#000000'} onChange={e => update(key, e.target.value)}
            className="sr-only" />
          <div className="w-10 h-10 rounded-xl border-2 border-border shadow-sm group-hover:border-primary transition-colors flex items-center justify-center overflow-hidden">
            <div className="w-7 h-7 rounded-lg" style={{ background: theme[key] }} />
          </div>
        </label>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div dir="rtl" className="space-y-5 pb-10">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Palette className="w-6 h-6 text-primary" /> تخصيص الواجهة
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={handleReset}
            className="h-9 px-4 bg-muted text-foreground rounded-xl text-sm font-medium hover:bg-muted/70 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> تراجع
          </button>
          <button onClick={handleSave} disabled={saving}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            حفظ التصميم
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── لوح التحكم ── */}
        <div className="space-y-4">

          {/* الثيمات الجاهزة */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-foreground mb-3">🎨 تصميمات جاهزة</h2>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => { setTheme(p); applyTheme(p); }}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    theme.primary === p.primary && theme.bg === p.bg
                      ? 'border-primary shadow-md' : 'border-border hover:border-primary/40'
                  }`}>
                  <div className="h-12" style={{ background: p.bg }}>
                    <div className="h-4 w-full" style={{ background: p.primary }} />
                    <div className="p-1.5 flex gap-1">
                      <div className="h-2 flex-1 rounded" style={{ background: p.card, border: `1px solid ${p.border}` }} />
                      <div className="h-2 w-6 rounded" style={{ background: p.primary }} />
                    </div>
                  </div>
                  <div className="p-1.5 bg-card border-t border-border">
                    <p className="text-[10px] font-bold text-center text-foreground truncate">{p.label}</p>
                  </div>
                  {theme.primary === p.primary && theme.bg === p.bg && (
                    <CheckCircle2 className="absolute top-1 left-1 w-3.5 h-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* الألوان */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-bold text-foreground">🌈 الألوان</h2>
            {swatch('primary',   'اللون الرئيسي',   'أزرار، روابط، التمييز')}
            {swatch('primaryFg', 'نص الزر',          'لون النص فوق اللون الرئيسي')}
            {swatch('bg',        'خلفية الصفحة',     'الخلفية العامة')}
            {swatch('card',      'خلفية البطاقات',   'البطاقات والمربعات')}
            {swatch('fg',        'لون النص',         'النص الأساسي')}
            {swatch('border',    'لون الحدود',       'الإطارات والفواصل')}
          </div>

          {/* الخط */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-foreground">🔤 الخط</h2>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map(f => (
                <button key={f} onClick={() => update('font', f)}
                  className={`h-12 rounded-xl border-2 text-sm font-bold transition-all ${
                    theme.font === f ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40 text-foreground'
                  }`}
                  style={{ fontFamily: `'${f}', sans-serif` }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* الزوايا */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-foreground">⬜ نعومة الزوايا</h2>
            <div className="flex gap-2">
              {[{ v: '4px', l: 'حادة' }, { v: '8px', l: 'خفيفة' }, { v: '12px', l: 'متوسطة' }, { v: '16px', l: 'ناعمة' }, { v: '24px', l: 'دائرية' }].map(r => (
                <button key={r.v} onClick={() => update('radius', r.v)}
                  className={`flex-1 h-10 text-xs font-bold border-2 transition-all ${
                    theme.radius === r.v ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                  style={{ borderRadius: r.v }}>
                  {r.l}
                </button>
              ))}
            </div>
          </div>

          {/* الشعار */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-foreground">🏷️ شعار المنشأة</h2>
            <p className="text-xs text-muted-foreground">يظهر في القائمة العامة والفواتير والتقارير</p>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="شعار" className="w-16 h-16 rounded-xl object-contain border border-border bg-white" />
                  <button onClick={() => { setLogoPreview(''); setLogoFile(null); }}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <label className="flex-1 cursor-pointer">
                <input type="file" accept="image/*" onChange={pickLogo} className="sr-only" />
                <div className="h-10 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center gap-2 text-sm text-primary font-medium hover:bg-primary/10 transition-colors">
                  <Upload className="w-4 h-4" />
                  {logoFile ? logoFile.name : 'رفع شعار'}
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ── معاينة مباشرة ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> معاينة مباشرة
            </h2>
            <div className="flex gap-1 bg-muted rounded-xl p-1">
              <button onClick={() => setPreview('desktop')}
                className={`h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${preview === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Monitor className="w-3 h-3" /> سطح مكتب
              </button>
              <button onClick={() => setPreview('mobile')}
                className={`h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${preview === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Smartphone className="w-3 h-3" /> جوال
              </button>
            </div>
          </div>

          {/* إطار المعاينة */}
          <div className={`border-2 border-border rounded-2xl overflow-hidden shadow-lg transition-all ${
            preview === 'mobile' ? 'max-w-[375px] mx-auto' : 'w-full'
          }`} style={{ background: theme.bg }}>

            {/* شريط التطبيق */}
            <div className="h-12 flex items-center justify-between px-4 border-b"
              style={{ background: theme.primary, borderColor: theme.border }}>
              <div className="flex items-center gap-2">
                {logoPreview
                  ? <img src={logoPreview} className="w-8 h-8 rounded-lg object-contain bg-white/20" alt="logo" />
                  : <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold" style={{ color: theme.primaryFg }}>ف</div>
                }
                <span className="font-black text-sm" style={{ color: theme.primaryFg, fontFamily: `'${theme.font}', sans-serif` }}>
                  اسم المنشأة
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <ShoppingCartIcon color={theme.primaryFg} />
              </div>
            </div>

            {/* محتوى */}
            <div className="p-4 space-y-3" style={{ fontFamily: `'${theme.font}', sans-serif` }}>
              {/* بحث */}
              <div className="h-10 rounded-xl border flex items-center px-3 gap-2"
                style={{ background: theme.card, borderColor: theme.border, borderRadius: theme.radius }}>
                <span className="text-sm" style={{ color: theme.fg, opacity: 0.4 }}>ابحث في القائمة...</span>
              </div>

              {/* تصنيفات */}
              <div className="flex gap-2 overflow-hidden">
                {['الكل', 'بيتزا', 'برجر', 'مشروبات'].map((c, i) => (
                  <div key={c} className="flex-shrink-0 h-8 px-4 rounded-full text-xs font-bold flex items-center"
                    style={{
                      background: i === 0 ? theme.primary : theme.card,
                      color:      i === 0 ? theme.primaryFg : theme.fg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '999px',
                    }}>{c}</div>
                ))}
              </div>

              {/* منتجات */}
              <div className="grid grid-cols-2 gap-3">
                {['بيتزا مارغريتا', 'برجر لحم', 'باستا كريمة', 'سلطة خضراء'].map((n, i) => (
                  <div key={n} className="rounded-xl overflow-hidden border" style={{ borderColor: theme.border, borderRadius: theme.radius }}>
                    <div className="h-20 flex items-center justify-center text-3xl"
                      style={{ background: theme.card }}>
                      {['🍕','🍔','🍝','🥗'][i]}
                    </div>
                    <div className="p-2.5" style={{ background: theme.card }}>
                      <p className="text-xs font-bold truncate" style={{ color: theme.fg }}>{n}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-black" style={{ color: theme.primary }}>35 ر.س</span>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                          style={{ background: theme.primary, color: theme.primaryFg, borderRadius: theme.radius }}>+</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* زر الطلب */}
              <div className="h-12 rounded-2xl flex items-center justify-between px-4 text-sm font-bold"
                style={{ background: theme.primary, color: theme.primaryFg, borderRadius: theme.radius }}>
                <span className="bg-white/20 rounded-lg px-2 py-0.5 text-xs">3</span>
                <span>عرض الطلب</span>
                <span>105 ر.س</span>
              </div>
            </div>
          </div>

          {/* بطاقة CSS للمطورين */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs font-bold text-muted-foreground mb-2">📋 متغيرات CSS المولّدة</p>
            <pre className="text-[10px] text-muted-foreground leading-5 overflow-x-auto" dir="ltr">{
`:root {
  --primary: ${theme.primary};
  --primary-fg: ${theme.primaryFg};
  --background: ${theme.bg};
  --card: ${theme.card};
  --foreground: ${theme.fg};
  --border: ${theme.border};
  --radius: ${theme.radius};
  --font: '${theme.font}';
}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShoppingCartIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}
