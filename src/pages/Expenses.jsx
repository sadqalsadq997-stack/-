import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Plus, Search, Trash2, Edit3, Loader2, X, Save } from 'lucide-react';
import { toast } from 'sonner';

const CATS = ['إيجار','رواتب','فواتير','مواد خام','صيانة','تسويق','شحن','مستلزمات','أخرى'];
const METHODS = ['نقدي','بطاقة','تحويل','شيك'];

function ExpenseForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ title: '', amount: '', category: 'أخرى', payment_method: 'نقدي', notes: '', frequency: 'once', ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial?.id ? 'تعديل المصروف' : 'مصروف جديد'}</h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">العنوان <span className="text-red-500">*</span></label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        <div><label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س)</label>
          <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        <div><label className="text-xs text-muted-foreground mb-1 block">التصنيف</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-muted-foreground mb-1 block">طريقة الدفع</label>
          <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-muted-foreground mb-1 block">التكرار</label>
          <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
            <option value="once">مرة واحدة</option>
            <option value="daily">يومي</option>
            <option value="weekly">أسبوعي</option>
            <option value="monthly">شهري</option>
          </select>
        </div>
      </div>
      <div><label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
        <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} rows={2}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" /></div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
        <button onClick={() => { if (!form.title || !form.amount) return toast.error('العنوان والمبلغ مطلوبان'); onSave({ ...form, amount: Number(form.amount) }); }}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">
          <Save className="w-4 h-4" />حفظ
        </button>
      </div>
    </div>
  );
}

export default function Expenses() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (form) => {
      const { id, ...rest } = form;
      if (id) { const { error } = await supabase.from('expenses').update(rest).eq('id', id); if (error) throw error; }
      else { const { error } = await supabase.from('expenses').insert(rest); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setShowForm(false); setEditing(null); toast.success('تم الحفظ'); },
    onError: () => toast.error('فشل الحفظ'),
  });

  const del = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('expenses').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('تم الحذف'); },
    onError: () => toast.error('فشل الحذف'),
  });

  const filtered = expenses.filter(e => !search || e.title?.toLowerCase().includes(search.toLowerCase()) || e.category?.includes(search));
  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const formatSAR = n => `${Number(n || 0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />المصروفات
        </h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />مصروف جديد
        </button>
      </div>

      {(showForm || editing) && <ExpenseForm initial={editing || {}} onSave={save.mutate} onCancel={() => { setShowForm(false); setEditing(null); }} />}

      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between">
        <p className="text-sm text-red-700">إجمالي المصروفات المعروضة</p>
        <p className="text-xl font-black text-red-600">{formatSAR(total)}</p>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
          className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />لا توجد مصروفات
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(e => (
              <div key={e.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{e.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {e.category && <span className="bg-muted px-2 py-0.5 rounded-full">{e.category}</span>}
                    {e.payment_method && <span>{e.payment_method}</span>}
                    <span>{new Date(e.created_at).toLocaleDateString('ar')}</span>
                  </div>
                </div>
                <p className="font-bold text-red-600">{formatSAR(e.amount)}</p>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(e); setShowForm(false); }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm('حذف المصروف؟')) del.mutate(e.id); }} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
