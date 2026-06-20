import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Truck, Plus, Search, Trash2, Edit3, Loader2, X, Save, Phone, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

function SupplierForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', vat_number: '', notes: '', ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial?.id ? 'تعديل المورد' : 'مورد جديد'}</h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[['name','اسم المورد',true],['phone','الجوال',false],['email','البريد',false],['vat_number','الرقم الضريبي',false],['address','العنوان',false]].map(([k,l,req]) => (
          <div key={k}><label className="text-xs text-muted-foreground mb-1 block">{l}{req && <span className="text-red-500">*</span>}</label>
            <input value={form[k]||''} onChange={e => set(k, e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        ))}
      </div>
      <div><label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
        <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} rows={2}
          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" /></div>
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

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (form) => {
      const { id, ...rest } = form;
      if (id) { const { error } = await supabase.from('suppliers').update(rest).eq('id', id); if (error) throw error; }
      else { const { error } = await supabase.from('suppliers').insert(rest); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setShowForm(false); setEditing(null); toast.success('تم الحفظ'); },
    onError: () => toast.error('فشل الحفظ'),
  });

  const del = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('suppliers').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('تم الحذف'); },
    onError: () => toast.error('فشل الحذف'),
  });

  const filtered = suppliers.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search));
  const formatSAR = n => `${Number(n || 0).toLocaleString('ar')} ر.س`;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />الموردون
        </h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />مورد جديد
        </button>
      </div>

      {(showForm || editing) && <SupplierForm initial={editing || {}} onSave={save.mutate} onCancel={() => { setShowForm(false); setEditing(null); }} />}

      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
          className="w-full h-10 bg-card border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />لا يوجد موردون
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(s => (
              <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">
                  {s.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{s.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                    {s.vat_number && <span>الرقم الضريبي: {s.vat_number}</span>}
                  </div>
                </div>
                <div className="text-left">
                  {s.balance_due > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />مستحق: {formatSAR(s.balance_due)}
                    </span>
                  )}
                  {s.total_paid > 0 && <p className="text-xs text-muted-foreground">مدفوع: {formatSAR(s.total_paid)}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(s); setShowForm(false); }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm('حذف المورد؟')) del.mutate(s.id); }} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
