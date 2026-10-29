import React, { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, ShoppingCart, BellRing, Printer, ScanLine, Percent, Building2 } from 'lucide-react';
import { PagerTicketDialog } from '@/components/pager/PagerTicket';
import BarcodeScanner from '@/components/BarcodeScanner';
import LoyaltyCustomerBox from '@/components/pos/LoyaltyCustomerBox';
import { DiscountBox, B2BBox } from '@/components/pos/CheckoutExtras';
import { unitParts, cartTotals, fromH, money } from '@/lib/pricing';
import { printReceipt } from '@/lib/receipt';
import { issueEinvoice } from '@/lib/einvoice';
import { getPrinterSettings, savePrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';
import { loadSession } from '@/lib/security/session';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════════════════
// نقطة البيع
//  • قارئ الباركود: المسح يضيف المنتج للسلة فوراً (بدون ضغط)
//  • الأسعار: نفس معادلة القاعدة بالهللة، وتحترم "السعر شامل الضريبة"
//  • الفاتورة: تُطبع فور إتمام البيع (يمكن إيقافها من الزر)
// ══════════════════════════════════════════════════════════════════

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'نقداً',   icon: Banknote },
  { id: 'card',   label: 'بطاقة',  icon: CreditCard },
  { id: 'mada',   label: 'مدى',     icon: QrCode },
  { id: 'stcpay', label: 'STC Pay', icon: QrCode },
];

let audioCtx;
function beep(ok = true) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 320; g.gain.value = 0.06;
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (ok ? 0.07 : 0.22));
  } catch { /* بدون صوت */ }
}

const normCode = (v) => String(v || '').trim().replace(/\s+/g, '').toUpperCase();

export default function POSTerminal() {
  const [search, setSearch]       = useState('');
  const [cart, setCart]           = useState([]);
  const [category, setCategory]   = useState('all');
  const [payMethod, setPayMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const [usePager, setUsePager]   = useState(() => { try { return localStorage.getItem('felsy_pos_pager') === '1'; } catch { return false; } });
  const [autoPrint, setAutoPrint] = useState(() => ({ ...DEFAULT_PRINTER, ...getPrinterSettings() }).autoPrint !== false);
  const [pagerTicket, setPagerTicket] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [flashId, setFlashId]     = useState(null);
  const [customer, setCustomer]   = useState(null);
  const [discount, setDiscount]   = useState({ type: 'amount', value: '' });
  const [b2b, setB2b]             = useState(null); // عميل منشأة ⇒ فاتورة ضريبية (Standard)
  const lastScan = useRef(0);
  const qc = useQueryClient();

  const togglePager = () => setUsePager(v => { try { localStorage.setItem('felsy_pos_pager', v ? '0' : '1'); } catch { /* */ } return !v; });
  const toggleAutoPrint = () => setAutoPrint(v => { savePrinterSettings({ ...getPrinterSettings(), autoPrint: !v }); return !v; });

  const { data: products = [] } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('id, name, name_ar, base_price, tax_inclusive, tax_rate, vat_category, vat_exemption_code, image_url, category_id, barcode, sku, is_active')
        .eq('is_active', true).order('sort_order', { nullsFirst: false });
      if (error) toast.error('تعذر تحميل المنتجات');
      return (data || []).map(p => ({ ...p, unit: unitParts(p) }));
    },
    staleTime: 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name, name_ar').eq('is_active', true).order('sort_order');
      return data || [];
    },
  });

  // بيانات البائع للفاتورة (اسم المنشأة والرقم الضريبي)
  const { data: seller } = useQuery({
    queryKey: ['seller-info'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('business_name, vat_number, address, phone, logo_url').limit(1).maybeSingle();
      let br = {};
      try { br = JSON.parse(localStorage.getItem('activeBranch') || '{}'); } catch { /* */ }
      return {
        name: br.zatca_seller_name || data?.business_name || br.name_ar || br.name,
        vat_number: br.zatca_vat_number || br.vat_number || data?.vat_number,
        address: br.address || data?.address, phone: br.phone || data?.phone, logo_url: br.logo_url || data?.logo_url,
      };
    },
    staleTime: 5 * 60_000,
  });

  // عدد الأختام المطلوبة للمكافأة (من تصميم البطاقة أو إعدادات الولاء)
  const { data: stampsRequired = 10 } = useQuery({
    queryKey: ['stamps-required'],
    queryFn: async () => {
      const { data: d } = await supabase.from('loyalty_card_designs').select('stamps_required').eq('is_active', true).is('branch_id', null).limit(1).maybeSingle();
      if (d?.stamps_required) return d.stamps_required;
      const { data: s } = await supabase.from('loyalty_settings').select('stamps_threshold').limit(1).maybeSingle();
      return s?.stamps_threshold || 10;
    },
    staleTime: 5 * 60_000,
  });

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.name_ar?.includes(search.trim()) || p.barcode?.includes(search.trim());
    const matchCat = category === 'all' || p.category_id === category;
    return matchSearch && matchCat;
  });

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const exist = prev.find(i => i.product_id === product.id);
      if (exist) return prev.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name_ar || product.name, unit: product.unit, qty: 1 }];
    });
    setFlashId(product.id);
    setTimeout(() => setFlashId(id => (id === product.id ? null : id)), 450);
  }, []);

  // المسح بالباركود ← السلة فوراً
  const handleScan = useCallback((raw) => {
    const code = normCode(raw);
    if (!code) return;
    lastScan.current = Date.now();
    const p = products.find(x => normCode(x.barcode) === code) || products.find(x => normCode(x.sku) === code);
    setSearch('');
    if (p) { addToCart(p); beep(true); }
    else { beep(false); toast.error(`باركود غير مسجّل: ${code}`); }
  }, [products, addToCart]);

  // لو الكاشير كتب الباركود يدوياً في البحث وضغط Enter
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const typed = search;
    const onlyOne = filtered.length === 1 ? filtered[0] : null;
    // ننتظر لحظة: إذا كان المسح من القارئ فهو يعالجه (ما نضيف مرتين)
    setTimeout(() => {
      if (Date.now() - lastScan.current < 400) return;
      const code = normCode(typed);
      const exact = products.find(x => normCode(x.barcode) === code || normCode(x.sku) === code);
      if (exact) handleScan(code);
      else if (onlyOne) { addToCart(onlyOne); setSearch(''); }
    }, 60);
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => i.product_id === productId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };

  const grossNow = cart.reduce((s, i) => s + i.unit.gross * i.qty, 0) / 100;
  const discountAmount = (() => {
    const v = Number(discount.value) || 0;
    if (v <= 0) return 0;
    const d = discount.type === 'percent' ? Math.round(grossNow * Math.min(v, 100)) / 100 : Math.round(v * 100) / 100;
    return d < grossNow ? d : 0;
  })();
  const totals = cartTotals(cart, discountAmount);
  const { subtotal, vat, total } = totals;

  async function handleCheckout() {
    if (!cart.length || processing) return;
    setProcessing(true);
    try {
      const sess = await loadSession().catch(() => null);
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const branchId = (() => { try { return JSON.parse(localStorage.getItem('activeBranch') || '{}').id || null; } catch { return null; } })();
      const items = cart.map(i => ({
        product_id: i.product_id, name: i.name, quantity: i.qty,
        price: fromH(i.unit.gross), net: fromH(i.unit.net), vat: fromH(i.unit.vat), total: fromH(i.unit.gross * i.qty),
        vat_category: i.unit.cat, ...(i.unit.code ? { vat_exemption_code: i.unit.code } : {}),
      }));
      if (Number(discount.value) > 0 && !discountAmount) throw new Error('الخصم لازم يكون أقل من إجمالي الفاتورة');
      const payload = {
        order_number: orderNumber,
        status: usePager ? 'pending' : 'completed', // مع البيجر: الطلب يدخل المطبخ أولاً
        order_type: 'takeaway',
        payment_method: payMethod,
        items, subtotal, tax_amount: vat, total,
        discount_amount: discountAmount, discount_type: discountAmount ? discount.type : null,
        is_b2b: Boolean(b2b),
        branch_id: branchId,
        cashier_name: sess?.empName || (sess?.role === 'admin' ? 'المدير' : null),
        ...(customer ? { customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone } : {}),
        ...(b2b ? { customer_id: b2b.id, customer_name: b2b.legal_name || b2b.name, customer_phone: b2b.phone } : {}),
      };
      // المبالغ الرسمية ورقم الفاتورة التسلسلي من السيرفر (هو مصدر الحقيقة)
      const { data: created, error } = await supabase.from('orders').insert(payload)
        .select('id, created_at, invoiced_at, invoice_no, items, subtotal, tax_amount, total, rounding_amount, lines_net, discount_amount, discount_net, tax_breakdown, is_b2b, buyer').single();
      if (error) throw error;

      let receiptOrder = { ...payload, ...created };
      setLastOrder(receiptOrder);
      setCart([]);
      setDiscount({ type: 'amount', value: '' });
      setB2b(null);
      toast.success(`تم البيع • ${money(created.total)} ⃁ • ${created.invoice_no || ''}`);
      // ختم الولاء: يُحسب في السيرفر ويظهر في بطاقة العميل فوراً
      if (customer) {
        const { data: st, error: stErr } = await supabase.rpc('add_loyalty_stamps', { p_customer: customer.id, p_count: 1 });
        if (stErr) toast.error('تعذر إضافة الختم: ' + stErr.message);
        else {
          toast.success(st.reward_ready ? `🎁 ${customer.name} استحق المكافأة! (${st.stamps}/${st.required})` : `⭐ ختم لـ ${customer.name} (${st.stamps}/${st.required})`, { duration: 4000 });
        }
        setCustomer(null); // البيع التالي يبدأ بدون عميل (ما نختم لشخص غلط)
      }
      // الفوترة الإلكترونية: توقيع وإرسال للهيئة ⇒ QR المرحلة الثانية على الإيصال
      // فاتورة الشركات: لازم تُعتمد من الهيئة (Clearance) قبل تسليمها — ننتظر أطول
      let canPrint = true;
      if (created?.invoice_no) {
        const ez = await issueEinvoice('invoice', created.id, { timeoutMs: created.is_b2b ? 20000 : 4000 });
        if (ez.qr) { receiptOrder = { ...receiptOrder, zatca_qr: ez.qr, zatca_status: ez.status }; setLastOrder(receiptOrder); }
        if (ez.status === 'rejected') toast.error('الهيئة رفضت الفاتورة — راجع مركز الفوترة');
        if (created.is_b2b && !String(ez.status || '').startsWith('cleared') && ez.status !== 'not_onboarded') {
          canPrint = false;
          toast.warning('فاتورة الشركة بانتظار اعتماد الهيئة — لا تسلّمها للعميل الآن. اطبعها من صفحة الطلبات بعد الاعتماد', { duration: 8000 });
        }
      }
      if (autoPrint && canPrint) printReceipt(receiptOrder, seller).catch(() => toast.error('تعذرت الطباعة — تأكد من الطابعة'));

      if (usePager && created?.id) {
        const { data: pager, error: pErr } = await supabase.rpc('create_pager', { p_order_id: created.id, p_branch_id: branchId, p_label: null });
        if (pErr) toast.error('تعذر إنشاء البيجر: ' + pErr.message);
        else setPagerTicket(pager);
      }
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard-orders'] });
    } catch (err) {
      toast.error('خطأ: ' + (err.message || 'تعذر حفظ الطلب'));
    }
    setProcessing(false);
  }

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-120px)] lg:flex-row" dir="rtl">
      <BarcodeScanner onScan={handleScan} />

      {/* المنتجات */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKey}
            placeholder="ابحث باسم المنتج، أو امسح الباركود مباشرة..."
            className="h-11 w-full rounded-xl border border-border bg-card pr-9 pl-24 text-sm focus:border-primary focus:outline-none" />
          <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground"><ScanLine className="h-3.5 w-3.5" />القارئ جاهز</span>
        </div>

        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCategory('all')}
            className={`h-8 flex-shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            الكل
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`h-8 flex-shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${category === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {c.name_ar || c.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map(p => {
              const inCart = cart.find(i => i.product_id === p.id);
              return (
                <button key={p.id} onClick={() => addToCart(p)}
                  className={`relative rounded-2xl border bg-card p-3 text-right transition-all hover:border-primary/50 hover:shadow-md active:scale-95 ${inCart ? 'border-primary/40 bg-primary/5' : 'border-border'} ${flashId === p.id ? 'ring-2 ring-primary' : ''}`}>
                  {inCart && (
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {inCart.qty}
                    </span>
                  )}
                  <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted/30 text-2xl">
                    {p.image_url ? <img src={p.image_url} className="h-full w-full rounded-xl object-cover" alt="" loading="lazy" /> : '🛍️'}
                  </div>
                  <p className="truncate text-sm font-bold text-foreground">{p.name_ar || p.name}</p>
                  <p className="mt-0.5 text-sm font-black text-primary">{money(fromH(p.unit.gross))} ⃁</p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <ShoppingCart className="mx-auto mb-2 h-12 w-12 opacity-20" />
                لا توجد منتجات
              </div>
            )}
          </div>
        </div>
      </div>

      {/* السلة */}
      <div className="flex w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card lg:w-80">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="flex items-center gap-2 font-bold text-foreground">
            <ShoppingCart className="h-4 w-4 text-primary" />الطلب الحالي
          </h3>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} aria-label="تفريغ السلة" className="text-muted-foreground transition-colors hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-72 flex-1 space-y-2 overflow-y-auto p-3 lg:max-h-none">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <ScanLine className="mx-auto mb-2 h-8 w-8 opacity-30" />
              امسح باركود المنتج أو اضغط عليه
            </div>
          ) : cart.map(item => (
            <div key={item.product_id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs font-bold text-primary">{money(fromH(item.unit.gross * item.qty))} ⃁</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.product_id, -1)} aria-label="إنقاص"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                <button onClick={() => updateQty(item.product_id, 1)} aria-label="زيادة"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-primary/10 hover:text-primary">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <div className="space-y-1.5 text-sm">
            {totals.discount > 0 && <div className="flex justify-between text-emerald-700"><span>الخصم</span><span>− {money(totals.discount)} ⃁</span></div>}
            <div className="flex justify-between text-muted-foreground"><span>قبل الضريبة</span><span>{money(subtotal)} ⃁</span></div>
            <div className="flex justify-between text-muted-foreground"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ⃁</span></div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-black text-foreground">
              <span>الإجمالي</span><span className="text-primary">{money(total)} ⃁</span>
            </div>
          </div>

          {!b2b && <LoyaltyCustomerBox customer={customer} onChange={setCustomer} required={stampsRequired} />}

          <div className="grid grid-cols-2 gap-1.5">
            <DiscountBox value={discount} onChange={setDiscount} gross={grossNow} applied={discountAmount} icon={Percent} />
            <B2BBox value={b2b} onChange={(c) => { setB2b(c); if (c) setCustomer(null); }} icon={Building2} />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m.id} onClick={() => setPayMethod(m.id)}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors ${payMethod === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                <m.icon className="h-3.5 w-3.5" />{m.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={togglePager} aria-pressed={usePager}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${usePager ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              <BellRing className="h-3.5 w-3.5" /> بيجر {usePager ? '✓' : ''}
            </button>
            <button type="button" onClick={toggleAutoPrint} aria-pressed={autoPrint}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${autoPrint ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              <Printer className="h-3.5 w-3.5" /> طباعة تلقائية {autoPrint ? '✓' : ''}
            </button>
          </div>

          <button onClick={handleCheckout} disabled={!cart.length || processing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40">
            {processing ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <CreditCard className="h-4 w-4" />}
            إتمام الدفع • {money(total)} ⃁
          </button>
          {lastOrder && (
            <button onClick={() => printReceipt(lastOrder, seller)} className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
              <Printer className="h-3.5 w-3.5" /> إعادة طباعة آخر فاتورة ({lastOrder.invoice_no || lastOrder.order_number})
            </button>
          )}
        </div>
      </div>
      <PagerTicketDialog pager={pagerTicket} onClose={() => setPagerTicket(null)} />
    </div>
  );
}
