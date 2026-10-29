import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Loader2, Save, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import MenuView, { MENU_THEMES, MENU_COLORS, themeVars } from '@/components/menu/MenuView';
import { useMyAccount } from '@/components/AccountNumber';

// أصناف تجريبية للمعاينة لو المنيو لسه فاضي
const SAMPLE = {
  categories: [{ id: 'c1', name_ar: 'برجر' }, { id: 'c2', name_ar: 'مشروبات' }],
  products: [
    { id: 's1', name_ar: 'برجر سماش دبل', description_ar: 'لحم أنجوس، جبنة شيدر، صوص البيت', price: 32, category_id: 'c1', is_featured: true, image_url: null },
    { id: 's2', name_ar: 'برجر دجاج مقرمش', description_ar: 'صدر دجاج متبّل، خس، مايونيز حار', price: 27, category_id: 'c1', image_url: null },
    { id: 's3', name_ar: 'سبانش لاتيه', description_ar: 'إسبريسو مع حليب مكثف', price: 18, category_id: 'c2', is_featured: true, image_url: null },
    { id: 's4', name_ar: 'ليموناضة نعناع', price: 14, category_id: 'c2', image_url: null },
  ],
};

export default function MenuDesignTab({ settings, setSettings }) {
  const { data: acc } = useMyAccount();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const theme = settings.menu_theme || 'fresh';
  const color = settings.menu_color || '#E4572E';

  const { data: live } = useQuery({
    queryKey: ['menu-preview', acc?.slug],
    enabled: !!acc?.slug,
    queryFn: async () => (await supabase.rpc('public_menu_by_slug', { p_slug: acc.slug })).data,
    staleTime: 60_000,
  });
  const data = live?.products?.length ? live : { ...SAMPLE, business_name: settings.business_name || acc?.name || 'مطعمك', logo_url: settings.logo_url };
  const link = acc ? `${window.location.origin}/m/${acc.slug || acc.account_number}` : '';

  useEffect(() => { if (!settings.menu_color) setSettings(s => ({ ...s, menu_color: '#E4572E' })); }, []); // eslint-disable-line

  async function save() {
    setSaving(true);
    const { error } = settings.id
      ? await supabase.from('app_settings').update({ menu_theme: theme, menu_color: color }).eq('id', settings.id)
      : await supabase.from('app_settings').insert({ menu_theme: theme, menu_color: color });
    setSaving(false);
    if (error) toast.error('تعذر الحفظ'); else toast.success('تم تطبيق التصميم على المنيو والمتجر');
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-bold">التصميم</h3>
          <p className="mb-3 text-sm text-muted-foreground">كل التصاميم تتلوّن تلقائياً بلون منشأتك — والنص يتعدل عشان يكون واضح على أي لون.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MENU_THEMES.map(t => (
              <button key={t.id} type="button" onClick={() => setSettings(s => ({ ...s, menu_theme: t.id }))}
                className={`relative overflow-hidden rounded-2xl border-2 text-right transition-all ${theme === t.id ? 'border-primary shadow-lg' : 'border-border hover:border-primary/40'}`}>
                <ThemeThumb id={t.id} color={color} />
                <div className="p-3">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                {theme === t.id && <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span>}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 font-bold">لون المنشأة</h3>
          <div className="flex flex-wrap items-center gap-2">
            {MENU_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setSettings(s => ({ ...s, menu_color: c }))} aria-label={c}
                style={{ background: c }} className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-card ${color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-foreground' : ''}`} />
            ))}
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-xs font-bold">
              <input type="color" value={color} onChange={e => setSettings(s => ({ ...s, menu_color: e.target.value }))} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
              لون مخصص
            </label>
          </div>
        </section>

        {link && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-2 font-bold">رابط المنيو</h3>
            <div className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-sm">{link}</code>
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}
                className="flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-sm font-bold">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} نسخ</button>
              <a href={link} target="_blank" rel="noopener" className="flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-sm font-bold"><ExternalLink className="h-4 w-4" /> فتح</a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">هذا الرابط مهيأ لمحركات البحث (اسم المطعم + الأصناف والأسعار بصيغة Schema.org) — حطه في حسابك على Google Maps وإنستقرام.</p>
          </section>
        )}

        <button type="button" onClick={save} disabled={saving}
          className="flex h-11 items-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ التصميم
        </button>
      </div>

      {/* معاينة حيّة بإطار جوال */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted-foreground"><Smartphone className="h-4 w-4" />معاينة حيّة {live?.products?.length ? '(منيوك الحقيقي)' : '(أصناف تجريبية)'}</p>
        <div className="mx-auto w-[360px] max-w-full overflow-hidden rounded-[2.2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
          <div className="relative h-[680px] overflow-y-auto overflow-x-hidden rounded-[1.6rem]">
            <MenuView key={theme + color} data={data} theme={theme} color={color} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

// مصغّر يوضح شكل كل تصميم
function ThemeThumb({ id, color }) {
  const v = themeVars(color, id);
  const bg = { fresh: '#FFF8F1', photo: '#FAFAF7', night: '#0D0D0F', minimal: '#fff' }[id];
  const card = id === 'night' ? '#17171B' : '#fff';
  return (
    <div style={{ ...v, background: bg }} className="h-28 p-3" aria-hidden>
      {id === 'minimal' ? (
        <div className="space-y-2 pt-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-16 rounded bg-neutral-300" /><span className="flex-1 border-b border-dotted border-neutral-300" />
              <span className="h-2 w-6 rounded bg-[var(--m-brand)]" /><span className="h-5 w-5 rounded-full bg-[var(--m-brand)]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid h-full grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            id === 'photo' ? (
              <div key={i} className="relative overflow-hidden rounded-xl" style={{ background: `linear-gradient(160deg, color-mix(in oklab, var(--m-brand) 70%, #f5d0a9), #3a2410)` }}>
                <span className="absolute bottom-1.5 right-1.5 h-2 w-8 rounded bg-white/80" />
                <span className="absolute bottom-1.5 left-1.5 h-4 w-4 rounded-full bg-[var(--m-brand)]" />
              </div>
            ) : (
              <div key={i} className="flex flex-col overflow-hidden rounded-xl shadow-sm" style={{ background: card }}>
                <div className="flex-1" style={{ background: 'color-mix(in oklab, var(--m-accent) 25%, transparent)' }} />
                <div className="flex items-center justify-between p-1.5">
                  <span className="h-1.5 w-6 rounded bg-[var(--m-ink)]" /><span className="h-3.5 w-3.5 rounded-full bg-[var(--m-brand)]" />
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
