import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import {
  Activity, AlertTriangle, BarChart3, Calculator, Loader2, Package,
  RefreshCw, ShoppingCart, TrendingUp, Users, Sparkles, Boxes
} from 'lucide-react';

const sar = value => new Intl.NumberFormat('ar-SA', {
  style: 'currency', currency: 'SAR', maximumFractionDigits: 0,
}).format(Number(value || 0));
const num = value => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 1 }).format(Number(value || 0));
const pct = value => `${num(value)}%`;

function readBranchId() {
  try { return JSON.parse(localStorage.getItem('activeBranch') || '{}')?.id || null; }
  catch { return null; }
}

const COPY = {
  ar: {
    title: 'ذكاء المنشأة', subtitle: 'رؤية عملية مبنية على بيانات منشأتك المسجلة في فلسي',
    pulse: 'نبض المنشأة', pricing: 'ذكاء التسعير', procurement: 'المشتريات الذكية',
    customers: 'ذاكرة العملاء', simulator: 'محاكي القرارات',
    sales30: 'مبيعات مكتملة خلال 30 يوماً', orders30: 'الطلبات المكتملة',
    expenses30: 'المصروفات المسجلة', lowStock: 'منتجات تحتاج إعادة طلب',
    pulseNote: 'تعرض المبيعات من الطلبات المكتملة فقط، ولا تعتبر الطلبات المعلقة مبيعات محققة.',
    priceTitle: 'مراجعة أسعار المنتجات', priceNote: 'الحساب يعتمد على سعر البيع وتكلفة المنتج المسجلين. لا يشمل المصروفات التشغيلية أو أي تكاليف غير مدخلة.',
    product: 'المنتج', price: 'سعر البيع', cost: 'التكلفة المسجلة', margin: 'فرق السعر', marginRate: 'النسبة',
    missingCost: 'أضف تكلفة المنتج لتحليل السعر', noProducts: 'لا توجد منتجات مسجلة بعد.',
    procurementTitle: 'قائمة إعادة الطلب المقترحة', procurementNote: 'الكمية المقترحة ترفع الرصيد إلى ضعفي حد التنبيه المسجل. عدّلها وفق معدل الاستهلاك الفعلي قبل اعتماد الشراء.',
    stock: 'المتوفر', min: 'حد التنبيه', suggested: 'كمية مقترحة', status: 'الحالة',
    low: 'أقل من الحد', ok: 'ضمن الحد', noLow: 'لا توجد منتجات تحت حد التنبيه حالياً.',
    customerTitle: 'العملاء الأكثر شراءً', customerNote: 'الترتيب يعتمد على إجمالي الإنفاق المسجل في ملف العميل، وليس على استنتاجات عن تفضيلاته.',
    customer: 'العميل', spent: 'إجمالي الإنفاق', visits: 'الزيارات', points: 'النقاط',
    noCustomers: 'لا توجد ملفات عملاء كافية للعرض.',
    simulatorTitle: 'جرّب القرار قبل تطبيقه', simulatorNote: 'محاكاة تقريبية وليست توقعاً محاسبياً. تعتمد على مبيعات آخر 30 يوماً ومتوسط هامش المنتجات التي لها تكلفة مسجلة.',
    priceChange: 'تغيير سعر البيع', volumeChange: 'تغيير حجم المبيعات', costChange: 'تغيير تكلفة البضاعة', extraCost: 'مصروف ثابت إضافي (ريال)',
    baseline: 'مبيعات الأساس', projected: 'المبيعات بعد السيناريو', gross: 'هامش إجمالي تقديري بعد المصروفات', assumption: 'افتراضات المحاكاة لا تغيّر أسعار المنتجات أو قيود المحاسبة الفعلية.',
    loading: 'جارٍ تحميل بيانات المنشأة...', error: 'تعذر تحميل البيانات. تحقق من اتصالك وصلاحيات حسابك ثم أعد المحاولة.',
    retry: 'إعادة المحاولة', empty: 'لا توجد بيانات كافية للفترة المحددة.',
    dataScope: 'البيانات محكومة بصلاحيات المنشأة والفرع النشط عبر سياسات قاعدة البيانات.',
    noSales: 'لا توجد طلبات مكتملة خلال آخر 30 يوماً.',
    catalogMargin: 'متوسط فرق السعر المسجل',
  },
  en: {
    title: 'Business Intelligence', subtitle: 'Practical insights based on your Felsy business data',
    pulse: 'Business Pulse', pricing: 'Price Intelligence', procurement: 'Smart Procurement',
    customers: 'Customer Memory', simulator: 'Decision Simulator',
    sales30: 'Completed sales · 30 days', orders30: 'Completed orders',
    expenses30: 'Recorded expenses', lowStock: 'Products to reorder',
    pulseNote: 'Sales include completed orders only; pending orders are not treated as realized sales.',
    priceTitle: 'Product price review', priceNote: 'Uses recorded selling price and product cost. Excludes operating expenses and costs not entered in Felsy.',
    product: 'Product', price: 'Selling price', cost: 'Recorded cost', margin: 'Price difference', marginRate: 'Rate',
    missingCost: 'Add product cost to analyze pricing', noProducts: 'No products are registered yet.',
    procurementTitle: 'Suggested reorder list', procurementNote: 'Suggested quantity raises stock to twice the saved alert threshold. Review actual consumption before approving purchases.',
    stock: 'On hand', min: 'Alert threshold', suggested: 'Suggested qty', status: 'Status',
    low: 'Below threshold', ok: 'Within threshold', noLow: 'No products are currently below their alert threshold.',
    customerTitle: 'Top customers by spend', customerNote: 'Ranking uses recorded customer spend, not inferred preferences.',
    customer: 'Customer', spent: 'Total spend', visits: 'Visits', points: 'Points',
    noCustomers: 'Not enough customer profiles to display.',
    simulatorTitle: 'Test a decision before applying it', simulatorNote: 'An indicative simulation, not an accounting forecast. Uses completed sales from the last 30 days and average margin from products with recorded cost.',
    priceChange: 'Selling price change', volumeChange: 'Sales volume change', costChange: 'Cost of goods change', extraCost: 'Additional fixed expense (SAR)',
    baseline: 'Baseline sales', projected: 'Scenario sales', gross: 'Estimated gross result after expenses', assumption: 'Simulation assumptions do not change product prices or actual accounting records.',
    loading: 'Loading business data...', error: 'Could not load data. Check your connection and account permissions, then retry.',
    retry: 'Retry', empty: 'Not enough data for the selected period.',
    dataScope: 'Data is restricted by tenant and active-branch database policies.',
    noSales: 'No completed orders in the last 30 days.',
    catalogMargin: 'Average recorded price difference',
  },
};

function Stat({ icon: Icon, label, value, hint }) {
  return <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
    </div>
    <div className="text-2xl font-black text-foreground">{value}</div>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

export default function BusinessIntelligence() {
  const { lang } = useI18n();
  const en = lang === 'en';
  const c = COPY[en ? 'en' : 'ar'];
  const [tab, setTab] = useState('pulse');
  const [priceChange, setPriceChange] = useState(0);
  const [volumeChange, setVolumeChange] = useState(0);
  const [costChange, setCostChange] = useState(0);
  const [extraCost, setExtraCost] = useState('0');

  const query = useQuery({
    queryKey: ['felsy-business-intelligence', readBranchId()],
    queryFn: async () => {
      const branchId = readBranchId();
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      let ordersQ = supabase.from('orders').select('id,total,status,created_at,customer_id,customer_name').gte('created_at', from).order('created_at', { ascending: false }).limit(1000);
      let expensesQ = supabase.from('expenses').select('id,amount,created_at,branch_id').gte('created_at', from).limit(1000);
      let customersQ = supabase.from('customers').select('id,name,total_spent,visit_count,loyalty_points,branch_id').order('total_spent', { ascending: false }).limit(100);
      if (branchId) {
        ordersQ = ordersQ.eq('branch_id', branchId);
        expensesQ = expensesQ.eq('branch_id', branchId);
        customersQ = customersQ.eq('branch_id', branchId);
      }
      const [ordersRes, productsRes, customersRes, expensesRes] = await Promise.all([
        ordersQ,
        supabase.from('products').select('id,name,name_ar,base_price,cost_price,stock_quantity,min_stock_alert,track_inventory,is_active').eq('is_active', true).limit(1000),
        customersQ,
        expensesQ,
      ]);
      for (const r of [ordersRes, productsRes, customersRes, expensesRes]) if (r.error) throw r.error;
      return {
        orders: ordersRes.data || [],
        products: productsRes.data || [],
        customers: customersRes.data || [],
        expenses: expensesRes.data || [],
      };
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const data = query.data || { orders: [], products: [], customers: [], expenses: [] };
  const completed = data.orders.filter(o => o.status === 'completed');
  const sales = completed.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const expenses = data.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const lowStock = data.products.filter(p => p.track_inventory !== false && Number(p.stock_quantity || 0) <= Number(p.min_stock_alert ?? 0));
  const margins = data.products.filter(p => Number(p.base_price) > 0 && p.cost_price !== null && p.cost_price !== undefined);
  const avgMarginRate = margins.length
    ? margins.reduce((sum, p) => sum + ((Number(p.base_price) - Number(p.cost_price)) / Number(p.base_price)), 0) / margins.length
    : null;
  const avgDifference = margins.length
    ? margins.reduce((sum, p) => sum + (Number(p.base_price) - Number(p.cost_price)), 0) / margins.length
    : null;

  const simulation = useMemo(() => {
    const volumeFactor = 1 + Number(volumeChange) / 100;
    const priceFactor = 1 + Number(priceChange) / 100;
    const costFactor = 1 + Number(costChange) / 100;
    const projectedSales = sales * volumeFactor * priceFactor;
    const estimatedCogs = avgMarginRate === null ? null : sales * volumeFactor * (1 - avgMarginRate) * costFactor;
    const result = estimatedCogs === null ? null : projectedSales - estimatedCogs - expenses - Math.max(0, Number(extraCost || 0));
    return { projectedSales, result };
  }, [sales, avgMarginRate, expenses, priceChange, volumeChange, costChange, extraCost]);

  const tabs = [
    ['pulse', Activity, c.pulse], ['pricing', TrendingUp, c.pricing],
    ['procurement', Boxes, c.procurement], ['customers', Users, c.customers],
    ['simulator', Calculator, c.simulator],
  ];

  if (query.isLoading) return <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{c.loading}</div>;
  if (query.isError) return <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center space-y-3"><AlertTriangle className="mx-auto h-8 w-8 text-destructive" /><p>{c.error}</p><button onClick={() => query.refetch()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground"><RefreshCw className="h-4 w-4" />{c.retry}</button></div>;

  return <div className="space-y-6" dir={en ? 'ltr' : 'rtl'}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 flex items-center gap-2 text-primary"><Sparkles className="h-5 w-5" /><span className="text-xs font-bold tracking-wide">FELSY INTELLIGENCE</span></div><h1 className="text-2xl font-black text-foreground">{c.title}</h1><p className="mt-1 text-sm text-muted-foreground">{c.subtitle}</p></div>
      <button onClick={() => query.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />{c.retry}</button>
    </header>

    <nav className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map(([id, Icon, label]) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}
    </nav>

    {tab === 'pulse' && <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingUp} label={c.sales30} value={sar(sales)} />
        <Stat icon={ShoppingCart} label={c.orders30} value={num(completed.length)} />
        <Stat icon={BarChart3} label={c.expenses30} value={sar(expenses)} />
        <Stat icon={AlertTriangle} label={c.lowStock} value={num(lowStock.length)} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{c.pulseNote}</p><p className="mt-2 text-xs text-muted-foreground">{c.dataScope}</p>{!completed.length && <p className="mt-3 text-sm">{c.noSales}</p>}</div>
    </section>}

    {tab === 'pricing' && <section className="space-y-3">
      <div><h2 className="text-lg font-bold">{c.priceTitle}</h2><p className="text-sm text-muted-foreground">{c.priceNote}</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><Stat icon={TrendingUp} label={c.catalogMargin} value={avgDifference === null ? '—' : sar(avgDifference)} hint={avgMarginRate === null ? c.missingCost : pct(avgMarginRate * 100)} /><Stat icon={Package} label={c.product} value={num(margins.length)} hint={c.marginRate} /></div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{[c.product,c.price,c.cost,c.margin,c.marginRate].map(x=><th key={x} className="p-3 text-start">{x}</th>)}</tr></thead><tbody>{data.products.slice().sort((a,b)=>Number(a.base_price||0)-Number(b.base_price||0)).map(p=>{const valid=p.base_price!==null&&p.cost_price!==null&&Number(p.base_price)>0;const diff=valid?Number(p.base_price)-Number(p.cost_price):null;return <tr key={p.id} className="border-t border-border"><td className="p-3 font-medium">{en?(p.name||p.name_ar):(p.name_ar||p.name)}</td><td className="p-3">{sar(p.base_price)}</td><td className="p-3">{p.cost_price===null?'—':sar(p.cost_price)}</td><td className="p-3">{diff===null?'—':sar(diff)}</td><td className="p-3">{valid?pct(diff/Number(p.base_price)*100):c.missingCost}</td></tr>})}</tbody></table>{!data.products.length&&<p className="p-6 text-center text-muted-foreground">{c.noProducts}</p>}</div>
    </section>}

    {tab === 'procurement' && <section className="space-y-3">
      <div><h2 className="text-lg font-bold">{c.procurementTitle}</h2><p className="text-sm text-muted-foreground">{c.procurementNote}</p></div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[520px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{[c.product,c.stock,c.min,c.suggested,c.status].map(x=><th key={x} className="p-3 text-start">{x}</th>)}</tr></thead><tbody>{lowStock.map(p=>{const stock=Number(p.stock_quantity||0),min=Number(p.min_stock_alert||0),suggested=Math.max(0,Math.ceil(min*2-stock));return <tr key={p.id} className="border-t border-border"><td className="p-3 font-medium">{en?(p.name||p.name_ar):(p.name_ar||p.name)}</td><td className="p-3">{num(stock)}</td><td className="p-3">{num(min)}</td><td className="p-3 font-bold">{num(suggested)}</td><td className="p-3"><span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700">{c.low}</span></td></tr>})}</tbody></table>{!lowStock.length&&<p className="p-6 text-center text-muted-foreground">{c.noLow}</p>}</div>
    </section>}

    {tab === 'customers' && <section className="space-y-3">
      <div><h2 className="text-lg font-bold">{c.customerTitle}</h2><p className="text-sm text-muted-foreground">{c.customerNote}</p></div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[520px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{[c.customer,c.spent,c.visits,c.points].map(x=><th key={x} className="p-3 text-start">{x}</th>)}</tr></thead><tbody>{data.customers.slice(0,30).map(customer=><tr key={customer.id} className="border-t border-border"><td className="p-3 font-medium">{customer.name||'—'}</td><td className="p-3">{sar(customer.total_spent)}</td><td className="p-3">{num(customer.visit_count)}</td><td className="p-3">{num(customer.loyalty_points)}</td></tr>)}</tbody></table>{!data.customers.length&&<p className="p-6 text-center text-muted-foreground">{c.noCustomers}</p>}</div>
    </section>}

    {tab === 'simulator' && <section className="space-y-4">
      <div><h2 className="text-lg font-bold">{c.simulatorTitle}</h2><p className="text-sm text-muted-foreground">{c.simulatorNote}</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-4">
          {[[c.priceChange,priceChange,setPriceChange], [c.volumeChange,volumeChange,setVolumeChange], [c.costChange,costChange,setCostChange]].map(([label,value,setter])=><label key={label} className="block space-y-2"><span className="flex justify-between text-sm font-medium"><span>{label}</span><span dir="ltr">{value>0?'+':''}{value}%</span></span><input type="range" min="-30" max="30" step="1" value={value} onChange={e=>setter(Number(e.target.value))} className="w-full accent-primary" /></label>)}
          <label className="block space-y-2 text-sm font-medium">{c.extraCost}<input type="number" min="0" value={extraCost} onChange={e=>setExtraCost(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
        </div>
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div><p className="text-sm text-muted-foreground">{c.baseline}</p><p className="text-xl font-black">{sar(sales)}</p></div>
          <div><p className="text-sm text-muted-foreground">{c.projected}</p><p className="text-2xl font-black text-primary">{sar(simulation.projectedSales)}</p></div>
          <div><p className="text-sm text-muted-foreground">{c.gross}</p><p className="text-xl font-black">{simulation.result===null?'—':sar(simulation.result)}</p></div>
          {avgMarginRate===null&&<p className="text-xs text-amber-700">{c.missingCost}</p>}
          <p className="text-xs text-muted-foreground">{c.assumption}</p>
        </div>
      </div>
    </section>}
  </div>;
}
