import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, ShoppingCart, Plus, Minus, Star, Phone, MapPin, Clock, X, CheckCircle2 } from 'lucide-react';

// ══════════════════════════════════════════════════════
// صفحة القائمة العامة — مع SEO ديناميكي لكل منشأة
// ══════════════════════════════════════════════════════

function injectSEO(branch, products, categories) {
  if (!branch) return;

  const name     = branch.name_ar || branch.name || 'القائمة';
  const city     = branch.address || 'السعودية';
  const phone    = branch.phone || '';
  const logo     = branch.logo_url || '';
  const catNames = categories.map(c => c.name_ar || c.name).join('، ');
  const prodNames = products.slice(0, 10).map(p => p.name_ar || p.name).join('، ');

  const title = `${name} | قائمة الطعام والمنتجات — ${city}`;
  const desc  = `اكتشف قائمة ${name} في ${city}. ${catNames ? 'تشمل: ' + catNames + '.' : ''} ${prodNames ? 'من أبرز منتجاتنا: ' + prodNames + '.' : ''} اطلب الآن بكل سهولة.`;
  const url   = window.location.href;

  // Title & description
  document.title = title;
  setMeta('description', desc);
  setMeta('keywords', `${name}, قائمة طعام, ${catNames}, ${city}, طلب أونلاين, توصيل`);

  // Open Graph
  setOG('title',       title);
  setOG('description', desc);
  setOG('url',         url);
  setOG('type',        'restaurant.menu');
  setOG('locale',      'ar_SA');
  setOG('site_name',   name);
  if (logo) setOG('image', logo);

  // Twitter
  setTW('card',        'summary_large_image');
  setTW('title',       title);
  setTW('description', desc);
  if (logo) setTW('image', logo);

  // Canonical
  let canon = document.querySelector('link[rel="canonical"]');
  if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
  canon.href = url;

  // Schema.org — Restaurant / LocalBusiness
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name,
    url,
    telephone: phone,
    address: { '@type': 'PostalAddress', addressLocality: city, addressCountry: 'SA' },
    ...(logo ? { image: logo } : {}),
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: categories.slice(0, 10).map(c => ({
        '@type': 'MenuSection',
        name: c.name_ar || c.name,
        hasMenuItem: products
          .filter(p => p.category_id === c.id)
          .slice(0, 10)
          .map(p => ({
            '@type': 'MenuItem',
            name: p.name_ar || p.name,
            description: p.description_ar || p.description || '',
            offers: { '@type': 'Offer', price: p.price, priceCurrency: 'SAR' },
            ...(p.image_url ? { image: p.image_url } : {}),
          })),
      })),
    },
    servesCuisine: catNames,
    priceRange: '$$',
    inLanguage: 'ar',
  };

  let schemaTag = document.getElementById('menu-schema');
  if (!schemaTag) {
    schemaTag = document.createElement('script');
    schemaTag.type = 'application/ld+json';
    schemaTag.id = 'menu-schema';
    document.head.appendChild(schemaTag);
  }
  schemaTag.textContent = JSON.stringify(schema);
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}
function setOG(prop, content) {
  let el = document.querySelector(`meta[property="og:${prop}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', `og:${prop}`); document.head.appendChild(el); }
  el.content = content;
}
function setTW(name, content) {
  let el = document.querySelector(`meta[name="twitter:${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = `twitter:${name}`; document.head.appendChild(el); }
  el.content = content;
}

// ── مكوّن بطاقة المنتج ──────────────────────────────
function ProductCard({ product, onAdd, qty }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-md hover:border-primary/30 transition-all group">
      <div className="aspect-square bg-muted/30 relative overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              alt={product.name_ar || product.name}
              loading="lazy"
            />
          : <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>}
        {product.is_featured && (
          <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3 fill-white" /> مميز
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-bold text-sm text-foreground leading-tight">{product.name_ar || product.name}</p>
        {product.description_ar && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{product.description_ar}</p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <span className="font-black text-primary text-base">{product.price} <span className="text-xs font-medium">ر.س</span></span>
          {qty > 0 ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onAdd(product, -1)}
                className="w-6 h-6 bg-muted rounded-md flex items-center justify-center hover:bg-muted/70">
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-5 text-center text-sm font-bold">{qty}</span>
              <button onClick={() => onAdd(product, 1)}
                className="w-6 h-6 bg-primary text-primary-foreground rounded-md flex items-center justify-center hover:opacity-90">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => onAdd(product, 1)}
              className="w-8 h-8 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm shadow-primary/30">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── مكوّن سلة الطلب ─────────────────────────────────
function CartDrawer({ cart, onUpdate, onClose, branch }) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const [ordering, setOrdering] = useState(false);
  const [done, setDone] = useState(false);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  async function placeOrder() {
    setOrdering(true);
    try {
      const { data: order } = await supabase.from('orders').insert({
        items: cart,
        total,
        status: 'pending',
        order_type: 'online',
        payment_method: 'cash',
        branch_id: branch?.id,
        customer_phone: phone || null,
        notes: notes || null,
        order_number: `ONL-${Date.now().toString(36).toUpperCase()}`,
      }).select().single();
      if (order) setDone(true);
    } catch (e) { console.error(e); }
    setOrdering(false);
  }

  if (done) return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-3xl p-8 max-w-sm w-full text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-xl font-black text-foreground mb-2">تم استلام طلبك!</h2>
        <p className="text-muted-foreground text-sm mb-6">سنتواصل معك قريباً لتأكيد الطلب</p>
        <button onClick={onClose} className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-bold">إغلاق</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end" onClick={onClose}>
      <div className="bg-card rounded-t-3xl w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg text-foreground">طلبك</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 mb-4">
          {cart.map(item => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.price} × {item.qty}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onUpdate(item, -1)} className="w-6 h-6 bg-muted rounded-md flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                <button onClick={() => onUpdate(item, 1)} className="w-6 h-6 bg-primary text-primary-foreground rounded-md flex items-center justify-center"><Plus className="w-3 h-3" /></button>
              </div>
              <span className="w-16 text-left font-bold text-sm">{(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-3 mb-4">
          <div className="flex justify-between font-black text-lg">
            <span>الإجمالي</span>
            <span className="text-primary">{total.toFixed(2)} ر.س</span>
          </div>
        </div>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الجوال (اختياري)"
          className="w-full h-11 bg-muted/50 border border-border rounded-xl px-4 mb-3 text-sm focus:outline-none focus:border-primary" dir="ltr" />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات الطلب (اختياري)" rows={2}
          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:border-primary resize-none" />
        <button onClick={placeOrder} disabled={ordering}
          className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {ordering ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          إرسال الطلب
        </button>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────
export default function PublicMenu() {
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [branch, setBranch]         = useState(null);
  const [offers, setOffers]         = useState([]);
  const [category, setCategory]     = useState('all');
  const [search, setSearch]         = useState('');
  const [cart, setCart]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCart, setShowCart]     = useState(false);

  useEffect(() => {
    // تحديد branch_id من الدومين أو URL أو الأول متاح
    const params = new URLSearchParams(window.location.search);
    const branchId = params.get('branch');

    Promise.all([
      branchId
        ? supabase.from('branches').select('*').eq('id', branchId).maybeSingle()
        : supabase.from('branches').select('*').eq('is_active', true).limit(1).maybeSingle(),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('offers').select('*').eq('is_active', true).eq('show_on_homepage', true)
        .gte('valid_to', new Date().toISOString().split('T')[0]),
    ]).then(async ([{ data: br }, { data: cats }, { data: offs }]) => {
      setBranch(br);
      setCategories(cats || []);
      setOffers(offs || []);

      // جلب المنتجات بعد معرفة الفرع
      const q = supabase.from('products').select('*').eq('is_active', true).order('sort_order');
      if (br?.id) q.eq('branch_id', br.id);
      const { data: prods } = await q;
      setProducts(prods || []);

      // حقن SEO ديناميكي
      injectSEO(br, prods || [], cats || []);
      setLoading(false);
    });
  }, []);

  const filtered = products.filter(p => {
    const matchCat = category === 'all' || p.category_id === category;
    const matchSearch = !search || (p.name_ar || p.name)?.toLowerCase().includes(search.toLowerCase())
      || p.description_ar?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartQty = (id) => cart.find(i => i.id === id)?.qty || 0;
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);

  function updateCart(product, delta) {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (!ex && delta > 0) return [...prev, { id: product.id, name: product.name_ar || product.name, price: product.price, qty: 1 }];
      if (ex) {
        const newQty = ex.qty + delta;
        if (newQty <= 0) return prev.filter(i => i.id !== product.id);
        return prev.map(i => i.id === product.id ? { ...i, qty: newQty } : i);
      }
      return prev;
    });
  }

  const activeOffer = offers[0];
  const featuredProducts = products.filter(p => p.is_featured).slice(0, 6);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* بانر عرض */}
      {activeOffer && (
        <div className="bg-gradient-to-l from-amber-500 to-orange-500 text-white text-center py-2.5 text-sm font-bold">
          🎉 {activeOffer.title_ar || activeOffer.title} — خصم {activeOffer.discount}{activeOffer.type === 'percent' ? '%' : ' ر.س'}
          {' '}حتى {new Date(activeOffer.valid_to).toLocaleDateString('ar')}
        </div>
      )}

      {/* رأس الصفحة */}
      <header className="bg-card/90 backdrop-blur border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {branch?.logo_url && (
            <img src={branch.logo_url} alt={branch.name_ar || branch.name}
              className="w-10 h-10 rounded-xl object-cover border border-border" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-lg text-foreground truncate">{branch?.name_ar || branch?.name || 'القائمة'}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {branch?.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{branch.address}</span>}
              {branch?.phone && <a href={`tel:${branch.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" />{branch.phone}</a>}
            </div>
          </div>
          {totalQty > 0 && (
            <button onClick={() => setShowCart(true)} className="relative p-2 hover:bg-muted rounded-xl transition-colors">
              <ShoppingCart className="w-6 h-6 text-foreground" />
              <span className="absolute -top-1 -left-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center">
                {totalQty}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-5 pb-24">
        {/* بحث */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في القائمة..."
            className="w-full h-11 bg-card border border-border rounded-2xl pr-10 pl-4 text-sm focus:outline-none focus:border-primary transition-colors" />
        </div>

        {/* المنتجات المميزة */}
        {!search && featuredProducts.length > 0 && category === 'all' && (
          <div>
            <h2 className="font-black text-foreground mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> الأكثر طلباً
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {featuredProducts.map(p => (
                <ProductCard key={p.id} product={p} onAdd={updateCart} qty={cartQty(p.id)} />
              ))}
            </div>
          </div>
        )}

        {/* التصنيفات */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button onClick={() => setCategory('all')}
            className={`flex-shrink-0 h-9 px-5 rounded-full text-sm font-bold transition-colors ${category === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            الكل
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`flex-shrink-0 h-9 px-5 rounded-full text-sm font-bold transition-colors ${category === c.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
              {c.icon && <span className="mr-1">{c.icon}</span>}{c.name_ar || c.name}
            </button>
          ))}
        </div>

        {/* المنتجات */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl h-52 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>لا توجد نتائج</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onAdd={updateCart} qty={cartQty(p.id)} />
            ))}
          </div>
        )}
      </div>

      {/* شريط الكارت الثابت */}
      {totalQty > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-background/95 backdrop-blur border-t border-border z-20">
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setShowCart(true)}
              className="w-full h-13 bg-primary text-primary-foreground font-bold rounded-2xl flex items-center justify-between px-5 py-3 shadow-lg shadow-primary/25">
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-sm">{totalQty}</span>
              <span className="text-base">عرض الطلب</span>
              <span className="font-black">{cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)} ر.س</span>
            </button>
          </div>
        </div>
      )}

      {/* سلة الطلب */}
      {showCart && (
        <CartDrawer cart={cart} onUpdate={updateCart} onClose={() => setShowCart(false)} branch={branch} />
      )}
    </div>
  );
}
