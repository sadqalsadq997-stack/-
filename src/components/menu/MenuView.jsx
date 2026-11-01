import React, { useMemo, useState } from 'react';
import { Search, Plus, Minus, ShoppingBag, MapPin, Phone, Star, X, CheckCircle2, Flame } from 'lucide-react';
import MadeByFelsy from '@/components/MadeByFelsy';

// ══════════════════════════════════════════════════════════════════
// تصاميم المنيو والمتجر الإلكتروني
// كل تصميم مبني على "لون المنشأة" بمتغيرات CSS، ولون النص فوقه يُحسب
// تلقائياً (أبيض/أسود) حسب الإضاءة ⇒ أي لون يختاره صاحب المحل يطلع واضح.
// ══════════════════════════════════════════════════════════════════

export const MENU_THEMES = [
  { id: 'fresh',   name: 'طازج',        desc: 'فاتح ودافئ، بطاقات بصور مربعة — يناسب الكافيهات والمخابز' },
  { id: 'photo',   name: 'صور شهية',    desc: 'الصورة كاملة والسعر فوقها — يفتح النفس للمطاعم والبرجر' },
  { id: 'night',   name: 'ليلي فاخر',   desc: 'خلفية داكنة ولمسة لامعة — للمطاعم الراقية والستيك' },
  { id: 'minimal', name: 'كلاسيكي',     desc: 'قائمة مرتبة مثل المنيو المطبوع — سريع للقوائم الطويلة' },
];

export const MENU_COLORS = ['#E4572E', '#C2185B', '#7B3FE4', '#1E88E5', '#00897B', '#2E7D32', '#F9A825', '#6D4C41', '#212121', '#7FA38C'];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function themeVars(color, theme) {
  const rgb = hexToRgb(color) || hexToRgb('#E4572E');
  const L = luminance(rgb);
  const brand = `rgb(${rgb.join(' ')})`;
  const fg = L > 0.45 ? '#141414' : '#ffffff';
  // في الثيم الداكن: لو اللون غامق جداً نفتّحه عشان يبان
  const accent = theme === 'night' && L < 0.12 ? `color-mix(in oklab, ${brand} 55%, white)` : brand;
  // للنص الملوّن على خلفية فاتحة: لو اللون فاتح جداً (أصفر) نغمّقه
  const ink = theme !== 'night' && L > 0.5 ? `color-mix(in oklab, ${brand} 55%, black)` : accent;
  return { '--m-brand': brand, '--m-fg': fg, '--m-accent': accent, '--m-ink': ink };
}

const SKINS = {
  fresh: {
    page: 'bg-[#FFF8F1] text-[#2B2118]', card: 'bg-white shadow-[0_6px_24px_-12px_rgba(60,30,0,.25)] rounded-3xl',
    muted: 'text-[#8A7563]', pill: 'bg-white text-[#5B4636] shadow-sm', input: 'bg-white shadow-sm', header: 'bg-[#FFF8F1]/90',
  },
  photo: {
    page: 'bg-[#FAFAF7] text-neutral-900', card: 'rounded-3xl overflow-hidden', muted: 'text-neutral-500',
    pill: 'bg-white text-neutral-700 border border-neutral-200', input: 'bg-white border border-neutral-200', header: 'bg-white/90',
  },
  night: {
    page: 'bg-[#0D0D0F] text-neutral-100', card: 'bg-[#17171B] ring-1 ring-white/5 rounded-2xl', muted: 'text-neutral-400',
    pill: 'bg-[#1C1C21] text-neutral-300 ring-1 ring-white/10', input: 'bg-[#17171B] ring-1 ring-white/10 text-neutral-100 placeholder:text-neutral-500', header: 'bg-[#0D0D0F]/90',
  },
  minimal: {
    page: 'bg-white text-neutral-900', card: '', muted: 'text-neutral-500',
    pill: 'bg-neutral-100 text-neutral-700', input: 'bg-neutral-100', header: 'bg-white/95',
  },
};

const fmt = (n) => Number(n || 0).toFixed(2).replace(/\.00$/, '');

function Qty({ qty, onAdd, product, big }) {
  if (qty > 0) {
    return (
      <div className={`flex items-center gap-1 rounded-full bg-[var(--m-brand)] p-1 text-[var(--m-fg)] ${big ? 'shadow-lg' : ''}`}>
        <button type="button" onClick={() => onAdd(product, -1)} aria-label="إنقاص" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10"><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-5 text-center text-sm font-black">{qty}</span>
        <button type="button" onClick={() => onAdd(product, 1)} aria-label="زيادة" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onAdd(product, 1)} aria-label={`أضف ${product.name_ar || product.name}`}
      className={`flex items-center justify-center rounded-full bg-[var(--m-brand)] text-[var(--m-fg)] transition-transform active:scale-90 ${big ? 'h-10 w-10 shadow-lg' : 'h-9 w-9 shadow-md'}`}>
      <Plus className="h-5 w-5" />
    </button>
  );
}

function Img({ p, className }) {
  const [bad, setBad] = useState(false);
  if (p.image_url && !bad) {
    return <img src={p.image_url} alt={p.name_ar || p.name} loading="lazy" decoding="async" onError={() => setBad(true)} className={`object-cover ${className}`} />;
  }
  return <div className={`flex items-center justify-center bg-[color-mix(in_oklab,var(--m-brand)_14%,transparent)] text-4xl ${className}`}>🍽️</div>;
}

function ProductCard({ theme, p, qty, onAdd, skin }) {
  const name = p.name_ar || p.name;
  const desc = p.description_ar || p.description;
  if (theme === 'photo') {
    return (
      <article className={`relative ${skin.card} aspect-[4/5] bg-neutral-200`}>
        <Img p={p} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        {p.is_featured && <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[var(--m-brand)] px-2.5 py-1 text-[11px] font-black text-[var(--m-fg)]"><Flame className="h-3 w-3" />الأكثر طلباً</span>}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
          <div className="min-w-0">
            <h3 className="text-base font-black leading-tight drop-shadow">{name}</h3>
            {desc && <p className="mt-0.5 line-clamp-1 text-[11px] text-white/75">{desc}</p>}
            <p className="mt-1 text-lg font-black">{fmt(p.price)} <span className="text-sm">⃁</span></p>
          </div>
          <Qty qty={qty} onAdd={onAdd} product={p} big />
        </div>
      </article>
    );
  }
  if (theme === 'minimal') {
    return (
      <article className="flex items-start gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-bold">{name}</h3>
            <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-neutral-300" />
            <span className="font-black text-[var(--m-ink)]">{fmt(p.price)} ⃁</span>
          </div>
          {desc && <p className={`mt-0.5 line-clamp-2 text-xs ${skin.muted}`}>{desc}</p>}
        </div>
        {p.image_url && <Img p={p} className="h-16 w-16 flex-shrink-0 rounded-xl" />}
        <Qty qty={qty} onAdd={onAdd} product={p} />
      </article>
    );
  }
  // fresh + night
  return (
    <article className={`flex flex-col overflow-hidden ${skin.card}`}>
      <div className="relative aspect-square overflow-hidden">
        <Img p={p} className="h-full w-full transition-transform duration-500 hover:scale-105" />
        {p.is_featured && <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[var(--m-brand)] px-2 py-0.5 text-[10px] font-black text-[var(--m-fg)]"><Star className="h-3 w-3 fill-current" />مميز</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-black leading-tight">{name}</h3>
        {desc && <p className={`mt-0.5 line-clamp-2 text-xs ${skin.muted}`}>{desc}</p>}
        <div className="mt-auto flex items-center justify-between pt-2.5">
          <span className="text-lg font-black text-[var(--m-ink)]">{fmt(p.price)} <span className="text-xs">⃁</span></span>
          <Qty qty={qty} onAdd={onAdd} product={p} />
        </div>
      </div>
    </article>
  );
}

export default function MenuView({ data, theme = 'fresh', color, preview = false, onPlaceOrder, storeMode = false }) {
  const skin = SKINS[theme] || SKINS.fresh;
  const vars = themeVars(color || data?.color, theme);
  const products = data?.products || [];
  const categories = (data?.categories || []).filter(c => products.some(p => p.category_id === c.id));
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const name = data?.business_name || data?.branch?.name_ar || data?.branch?.name || 'المنيو';
  const logo = data?.logo_url || data?.branch?.logo_url;
  const place = [data?.address || data?.branch?.address, data?.city].filter(Boolean).join('، ');
  const phone = data?.phone || data?.branch?.phone;

  const visible = useMemo(() => products.filter(p => {
    const okCat = cat === 'all' || p.category_id === cat;
    const s = q.trim();
    return okCat && (!s || (p.name_ar || p.name || '').includes(s) || (p.name || '').toLowerCase().includes(s.toLowerCase()));
  }), [products, cat, q]);

  const groups = useMemo(() => {
    if (cat !== 'all' || q.trim()) return [{ id: 'x', title: null, items: visible }];
    const g = categories.map(c => ({ id: c.id, title: c.name_ar || c.name, items: visible.filter(p => p.category_id === c.id) })).filter(x => x.items.length);
    const rest = visible.filter(p => !categories.some(c => c.id === p.category_id));
    if (rest.length) g.push({ id: 'rest', title: g.length ? 'أصناف أخرى' : null, items: rest });
    return g;
  }, [visible, categories, cat, q]);

  const featured = products.filter(p => p.is_featured).slice(0, 8);
  const qtyOf = (id) => cart.find(i => i.id === id)?.qty || 0;
  const add = (p, d) => setCart(prev => {
    const ex = prev.find(i => i.id === p.id);
    if (!ex) return d > 0 ? [...prev, { id: p.id, name: p.name_ar || p.name, price: Number(p.price), qty: 1 }] : prev;
    const n = ex.qty + d;
    return n <= 0 ? prev.filter(i => i.id !== p.id) : prev.map(i => (i.id === p.id ? { ...i, qty: n } : i));
  });
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + Math.round(i.price * 100) * i.qty, 0) / 100;
  const pos = preview ? 'absolute' : 'fixed';
  // المعاينة داخل إطار الجوال: عمودين دائماً (الـ breakpoints تتبع عرض النافذة مو الإطار)
  const grid = theme === 'minimal' ? 'divide-y divide-neutral-100'
    : preview ? 'grid grid-cols-2 gap-3'
    : theme === 'photo' ? 'grid grid-cols-2 gap-3 lg:grid-cols-3' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div dir="rtl" style={vars} className={`relative min-h-full font-sans ${skin.page} ${preview ? 'min-h-[640px]' : 'min-h-screen'}`}>
      {/* الواجهة */}
      {theme === 'photo' || theme === 'night' ? (
        <header className="relative overflow-hidden px-4 pb-6 pt-8 text-center"
          style={{ background: theme === 'photo' ? 'linear-gradient(160deg, var(--m-brand), color-mix(in oklab, var(--m-brand) 60%, black))' : 'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--m-accent) 35%, transparent), transparent 70%)' }}>
          {logo && <img src={logo} alt="" className="mx-auto mb-3 h-20 w-20 rounded-3xl border-4 border-white/20 object-cover shadow-xl" />}
          <h1 className={`text-3xl font-black tracking-tight ${theme === 'photo' ? 'text-[var(--m-fg)]' : ''}`}>{name}</h1>
          {(place || phone) && (
            <p className={`mt-2 flex flex-wrap items-center justify-center gap-3 text-xs ${theme === 'photo' ? 'text-[var(--m-fg)] opacity-80' : skin.muted}`}>
              {place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
              {phone && <a href={`tel:${phone}`} className="flex items-center gap-1" dir="ltr"><Phone className="h-3 w-3" />{phone}</a>}
            </p>
          )}
        </header>
      ) : (
        <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-2 pt-5">
          {logo ? <img src={logo} alt="" className="h-14 w-14 rounded-2xl object-cover shadow-md" />
            : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--m-brand)] text-2xl font-black text-[var(--m-fg)]">{name.slice(0, 1)}</div>}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">{name}</h1>
            {(place || phone) && <p className={`flex flex-wrap gap-3 text-xs ${skin.muted}`}>
              {place && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
              {phone && <a href={`tel:${phone}`} dir="ltr" className="flex items-center gap-1"><Phone className="h-3 w-3" />{phone}</a>}
            </p>}
          </div>
        </header>
      )}

      {/* البحث + التصنيفات (ثابتة أثناء التمرير) */}
      <div className={`${preview ? '' : 'sticky top-0'} z-20 ${skin.header} backdrop-blur`}>
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-2">
          <div className="relative">
            <Search className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${skin.muted}`} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={storeMode ? 'ابحث في المتجر...' : 'وش نفسك فيه اليوم؟'}
              className={`h-11 w-full rounded-2xl pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-[var(--m-brand)] ${skin.input}`} />
          </div>
          {categories.length > 0 && (
            <nav className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="التصنيفات">
              {[{ id: 'all', name_ar: 'الكل' }, ...categories].map(c => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)}
                  className={`h-9 flex-shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${cat === c.id ? 'bg-[var(--m-brand)] text-[var(--m-fg)] shadow' : skin.pill}`}>
                  {c.icon && <span className="ml-1">{c.icon}</span>}{c.name_ar || c.name}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      <main className={`mx-auto max-w-5xl space-y-7 px-4 pt-3 ${count ? 'pb-28' : 'pb-10'}`}>
        {/* الأكثر طلباً — شريط أفقي */}
        {cat === 'all' && !q && featured.length > 0 && theme !== 'minimal' && (
          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-lg font-black"><Flame className="h-5 w-5 text-[var(--m-ink)]" />الأكثر طلباً</h2>
            <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {featured.map(p => (
                <div key={p.id} className={`w-44 flex-shrink-0 snap-start ${preview ? '' : 'sm:w-52'}`}>
                  <ProductCard theme={theme === 'night' ? 'night' : 'photo'} p={p} qty={qtyOf(p.id)} onAdd={add} skin={theme === 'night' ? skin : SKINS.photo} />
                </div>
              ))}
            </div>
          </section>
        )}

        {groups.map(g => (
          <section key={g.id}>
            {g.title && (
              <h2 className={`mb-3 flex items-center gap-2 text-lg font-black ${theme === 'minimal' ? 'border-b-2 border-[var(--m-brand)] pb-1' : ''}`}>
                {theme !== 'minimal' && <span className="h-5 w-1.5 rounded-full bg-[var(--m-brand)]" />}{g.title}
              </h2>
            )}
            <div className={grid}>
              {g.items.map(p => <ProductCard key={p.id} theme={theme} p={p} qty={qtyOf(p.id)} onAdd={add} skin={skin} />)}
            </div>
          </section>
        ))}
        {products.length > 0 && visible.length === 0 && <p className={`py-16 text-center ${skin.muted}`}>ما لقينا شي بهذا الاسم</p>}
        {products.length === 0 && <p className={`py-16 text-center ${skin.muted}`}>المنيو قيد التجهيز</p>}

        <footer className="flex justify-center pt-4"><MadeByFelsy source={storeMode ? 'store' : 'menu'} tone={theme === 'night' ? 'light' : 'muted'} /></footer>
      </main>

      {/* شريط السلة */}
      {count > 0 && (
        <div className={`${pos} inset-x-0 bottom-0 z-30 p-3`}>
          <button type="button" onClick={() => setOpen(true)}
            className="mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-2xl bg-[var(--m-brand)] px-5 font-bold text-[var(--m-fg)] shadow-2xl">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-black/15 px-2 text-sm">{count}</span>
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />عرض الطلب</span>
            <span className="font-black">{fmt(total)} ⃁</span>
          </button>
        </div>
      )}
      {open && <CartSheet cart={cart} add={add} total={total} pos={pos} skin={skin} theme={theme}
        onClose={() => setOpen(false)} onPlaceOrder={onPlaceOrder} onDone={() => setCart([])} />}
    </div>
  );
}

function CartSheet({ cart, add, total, pos, skin, theme, onClose, onPlaceOrder, onDone }) {
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const sheet = theme === 'night' ? 'bg-[#141417] text-neutral-100' : 'bg-white text-neutral-900';

  async function submit() {
    if (!onPlaceOrder) { setDone({ order_number: 'معاينة' }); return; }
    setBusy(true); setErr('');
    try {
      const o = await onPlaceOrder({ items: cart.map(i => ({ id: i.id, qty: i.qty })), phone: phone.trim() || null, notes: notes.trim() || null });
      setDone(o || {}); onDone();
    } catch (e) { setErr(e?.message || 'تعذر إرسال الطلب — حاول مرة ثانية'); }
    setBusy(false);
  }

  return (
    <div className={`${pos} inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center`} onClick={onClose}>
      <div className={`max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${sheet}`} onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-16 w-16 text-emerald-500" />
            <h2 className="text-xl font-black">تم تسجيل طلبك بانتظار اعتماد الدفع</h2>
            {done.order_number && <p className={`mt-1 text-sm ${skin.muted}`}>رقم الطلب <b dir="ltr">{done.order_number}</b></p>}
            <p className={`mt-2 text-xs ${skin.muted}`}>سيبدأ تجهيز الطلب بعد اعتماد استلام المبلغ من الكاشير.</p>
            <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-2xl bg-[var(--m-brand)] font-bold text-[var(--m-fg)]">تمام</button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black">طلبك</h2>
              <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5"><X className="h-4 w-4" /></button>
            </div>
            <ul className="mb-4 space-y-3">
              {cart.map(i => (
                <li key={i.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{i.name}</p><p className={`text-xs ${skin.muted}`}>{fmt(i.price)} ⃁</p></div>
                  <Qty qty={i.qty} onAdd={add} product={{ id: i.id, name: i.name, price: i.price }} />
                  <span className="w-16 text-left text-sm font-black">{fmt(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mb-4 flex justify-between border-t border-black/10 pt-3 text-lg font-black"><span>الإجمالي</span><span className="text-[var(--m-ink)]">{fmt(total)} ⃁</span></div>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الجوال (اختياري)" inputMode="tel" dir="ltr"
              className={`mb-2 h-11 w-full rounded-xl px-4 text-right text-sm outline-none ${skin.input}`} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (بدون بصل، حار...)" rows={2}
              className={`mb-3 w-full resize-none rounded-xl px-4 py-3 text-sm outline-none ${skin.input}`} />
            {err && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <button type="button" onClick={submit} disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-brand)] font-black text-[var(--m-fg)] disabled:opacity-60">
              {busy && <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />} أرسل الطلب • {fmt(total)} ⃁
            </button>
          </>
        )}
      </div>
    </div>
  );
}
