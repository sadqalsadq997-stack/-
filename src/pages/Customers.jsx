import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, Plus, Search, Trash2, Edit3, Loader2, Star,
  Phone, X, Save, CreditCard, TrendingUp, Filter,
  ChevronDown, Hash, DollarSign, Wallet, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('ar-SA');
const fmtSAR = (n) => `${fmt(n)} ر.س`;

// ── زر إصدار بطاقة Google Wallet للعميل ─────────────────
function WalletButton({ customer, tenantId }) {
  const [loading, setLoading] = useState(false);
  const [issuedUrl, setIssuedUrl] = useState(null);

  async function issue() {
    if (!tenantId) { toast.error('لم يتم تحديد المنشأة الحالية'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-wallet-issue', {
        body: { tenant_id: tenantId, customer_id: customer.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل الإصدار');
      setIssuedUrl(data.qr_page_url);
      toast.success('تم إصدار بطاقة Google Wallet — يمكنك مشاركة رابط QR مع العميل الآن');
    } catch (err) {
      toast.error('فشل إصدار البطاقة: ' + (err.message || ''));
    }
    setLoading(false);
  }

  if (issuedUrl) {
    return (
      <button onClick={() => { navigator.clipboard?.writeText(issuedUrl); toast.success('تم نسخ رابط البطاقة'); }}
        title={issuedUrl}
        className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600">
        <Check className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button onClick={issue} disabled={loading} title="إصدار بطاقة Google Wallet"
      className="p-1.5 hover:bg-blue-50 rounded-lg text-muted-foreground hover:text-blue-600 disabled:opacity-50">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
    </button>
  );
}

function CustomerForm({ initial, onSave, onCancel, branches }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '', notes: '',
    customer_type: 'individual', branch_id: '', ...initial
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial?.id ? 'تعديل العميل' : 'عميل جديد'}</h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[['name','الاسم','text',true],['phone','الجوال','tel',false],['email','البريد الإلكتروني','email',false],['address','العنوان','text',false]].map(([k,l,t,req]) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground mb-1 block">{l}{req && <span className="text-red-500">*</span>}</label>
            <input type={t} value={form[k]||''} onChange={e => set(k, e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
          <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)}
            className="h-10 bg-background border border-border rounded-xl px-3 text-sm w-full focus:outline-none focus:border-primary">
            <option value="individual">فرد</option>
            <option value="corporate">شركة</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الفرع المرتبط</label>
          <select value={form.branch_id||''} onChange={e => set('branch_id', e.target.value)}
            className="h-10 bg-background border border-border rounded-xl px-3 text-sm w-full focus:outline-none focus:border-primary">
            <option value="">— بدون تحديد —</option>
            {(branches||[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
        <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} rows={2}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
        <button onClick={() => { if (!form.name) return toast.error('الاسم مطلوب'); onSave(form); }}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">
          <Save className="w-4 h-4" />حفظ
        </button>
      </div>
    </div>
  );
}

// ── لوحة السدادات ─────────────────────────────────────
function PaymentsPanel({ customers }) {
  const totalPoints   = customers.reduce((s,c) => s + (c.loyalty_points||0), 0);
  const totalPurchase = customers.reduce((s,c) => s + (c.total_purchases||0), 0);
  const corporate     = customers.filter(c => c.customer_type === 'corporate').length;
  const individual    = customers.filter(c => c.customer_type === 'individual').length;

  const topCustomers = [...customers]
    .filter(c => (c.total_purchases||0) > 0)
    .sort((a,b) => (b.total_purchases||0) - (a.total_purchases||0))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* إحصاءات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users,     label: 'إجمالي العملاء',   value: fmt(customers.length),    color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
          { icon: DollarSign,label: 'إجمالي المشتريات', value: fmtSAR(totalPurchase),    color: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400' },
          { icon: Star,      label: 'نقاط الولاء',      value: fmt(totalPoints),         color: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' },
          { icon: TrendingUp,label: 'عملاء شركات',      value: fmt(corporate),           color: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-2`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* أعلى العملاء */}
      {topCustomers.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">أعلى العملاء شراءً</h3>
          </div>
          <div className="divide-y divide-border">
            {topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  i === 0 ? 'bg-amber-100 text-amber-700' :
                  i === 1 ? 'bg-gray-100 text-gray-600' :
                  i === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-muted text-muted-foreground'
                }`}>{i+1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone||'—'}</p>
                </div>
                <span className="text-sm font-bold text-green-600">{fmtSAR(c.total_purchases)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const { session } = useAuth();
  const [search, setSearch]     = useState('');
  const [searchType, setSearchType] = useState('name'); // name | phone | branch
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [activeTab, setActiveTab] = useState('list'); // list | payments
  const qc = useQueryClient();

  const { data: myTenant } = useQuery({
    queryKey: ['my-tenant-customers-page'],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data } = await supabase.from('tenant_users').select('tenant_id')
        .eq('auth_id', session.user.id).eq('is_active', true).limit(1).maybeSingle();
      return data;
    },
    enabled: !!session?.user?.id,
  });
  const tenantId = myTenant?.tenant_id || null;

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await supabase.from('branches').select('id,name');
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (form) => {
      const { id, ...rest } = form;
      if (id) { const { error } = await supabase.from('customers').update(rest).eq('id', id); if (error) throw error; }
      else     { const { error } = await supabase.from('customers').insert(rest); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false); setEditing(null); toast.success('تم الحفظ'); },
    onError:   () => toast.error('فشل الحفظ'),
  });

  const del = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('customers').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('تم الحذف'); },
    onError:   () => toast.error('فشل الحذف'),
  });

  // بحث متقدم — بالاسم أو رقم الجوال أو رقم الفرع
  const filtered = customers.filter(c => {
    if (!search) return true;
    if (searchType === 'name')   return c.name?.toLowerCase().includes(search.toLowerCase());
    if (searchType === 'phone')  return c.phone?.replace(/\s|-/g, '').includes(search.replace(/\s|-/g, ''));
    if (searchType === 'branch') {
      const branch = branches.find(b => b.id === c.branch_id);
      return branch?.name?.toLowerCase().includes(search.toLowerCase()) || c.branch_id?.includes(search);
    }
    return true;
  });

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> العملاء
        </h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> عميل جديد
        </button>
      </div>

      {showForm && (
        <CustomerForm
          initial={editing}
          branches={branches}
          onSave={(f) => save.mutate(f)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* تبويبات */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {[{ id:'list', label:'قائمة العملاء' }, { id:'payments', label:'لوحة السدادات' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'payments' ? (
        <PaymentsPanel customers={customers} />
      ) : (
        <>
          {/* بحث متقدم */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 bg-muted p-1 rounded-xl">
              <button onClick={() => setSearchType('name')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  searchType==='name' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}>
                <Users className="w-3 h-3" /> بحث بالاسم
              </button>
              <button onClick={() => setSearchType('phone')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  searchType==='phone' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}>
                <Phone className="w-3 h-3" /> بحث برقم الجوال
              </button>
              <button onClick={() => setSearchType('branch')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  searchType==='branch' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}>
                <Hash className="w-3 h-3" /> بحث برقم الفرع
              </button>
            </div>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={searchType === 'name' ? 'ابحث بالاسم...' : searchType === 'phone' ? 'ابحث برقم الجوال...' : 'ابحث برقم أو اسم الفرع...'}
                className="w-full h-10 bg-background border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          {/* جدول العملاء */}
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-muted/30">
                      {['الاسم','الجوال','الفرع','النوع','نقاط الولاء','إجمالي الشراء','Google Wallet','إجراءات'].map(h => (
                        <th key={h} className="text-right px-4 py-3 font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد نتائج</td></tr>
                    ) : filtered.map(c => {
                      const branch = branches.find(b => b.id === c.branch_id);
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.phone||'—'}</td>
                          <td className="px-4 py-3">
                            {branch ? (
                              <span className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full">{branch.name}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              c.customer_type==='corporate' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>{c.customer_type==='corporate' ? 'شركة' : 'فرد'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-amber-600">
                              <Star className="w-3 h-3" />{fmt(c.loyalty_points||0)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-green-600">{fmtSAR(c.total_purchases||0)}</td>
                          <td className="px-4 py-3">
                            <WalletButton customer={c} tenantId={tenantId} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => { setEditing(c); setShowForm(true); }}
                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm('حذف العميل؟')) del.mutate(c.id); }}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
