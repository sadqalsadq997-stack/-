import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import MenuView, { MENU_THEMES } from '@/components/menu/MenuView';

// ══════════════════════════════════════════════════════════════════
// المنيو / المتجر العام
//   felsy.org/m/<رقم الحساب>   ← الرابط المختصر (مفهرس في Google عبر api/menu-seo)
//   /menu?branch=<id>  و  /store  ← الروابط القديمة + الدومين الخاص بالمنشأة
// التصميم واللون من إعدادات المنشأة (الإعدادات ← تصميم المنيو)
// ══════════════════════════════════════════════════════════════════

const THEME_IDS = MENU_THEMES.map(t => t.id);

export default function PublicMenu() {
  const { slug } = useParams();
  const { pathname, search } = useLocation();
  const [data, setData] = useState(undefined);
  const storeMode = pathname.startsWith('/store');

  useEffect(() => {
    let alive = true;
    (async () => {
      let d = null;
      if (slug) {
        const r = await supabase.rpc('public_menu_by_slug', { p_slug: slug });
        d = r.data;
      } else {
        const params = new URLSearchParams(search);
        const b = params.get('branch');
        const validId = b && /^[0-9a-f-]{36}$/i.test(b) ? b : null;
        const r = await supabase.rpc('public_menu', { p_branch: validId, p_host: validId ? null : window.location.hostname });
        d = r.data;
        if (d?.branch?.id) {
          const t = await supabase.rpc('public_menu_theme', { p_branch: d.branch.id });
          if (t.data) d = { ...d, ...t.data };
        }
      }
      if (!alive) return;
      setData(d || null);
      if (d) {
        const name = d.business_name || d.branch?.name_ar || d.branch?.name;
        document.title = `${name} | ${storeMode ? 'المتجر' : 'المنيو'}`;
      }
    })().catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [slug, search, storeMode]);

  if (data === undefined) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-500" /></div>;
  }
  if (!data) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center p-6 text-center text-neutral-500">المنيو غير متاح حالياً</div>;
  }

  // معاينة مؤقتة من الإعدادات: ?theme=night&color=%23ff0000
  const params = new URLSearchParams(search);
  const theme = THEME_IDS.includes(params.get('theme')) ? params.get('theme') : (data.theme || 'fresh');
  const color = /^#[0-9a-f]{6}$/i.test(params.get('color') || '') ? params.get('color') : data.color;

  const placeOrder = async ({ items, phone, notes }) => {
    const { data: o, error } = await supabase.rpc('public_place_order', {
      p_branch: data.branch?.id, p_items: items, p_phone: phone, p_notes: notes,
    });
    if (error) throw error;
    return o;
  };

  return <MenuView data={data} theme={theme} color={color} onPlaceOrder={placeOrder} storeMode={storeMode} />;
}
