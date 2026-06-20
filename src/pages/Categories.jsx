import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tag, Plus, Trash2, Edit3, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#64748b'];

function CategoryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', name_ar: '', color: '#6366f1', icon: '', ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial?.id ? 'تعديل التصنيف' : 'تصنيف جديد'}</h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-muted-foreground mb-1 block">الاسم بالعربي</label>
          <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} placeholder="مثال: مشروبات"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
        <div><label className="text-xs text-muted-foreground mb-1 block">الاسم بالإنجليزي</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Beverages"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" /></div>
      </div>
      <div><label className="text-xs text-muted-foreground mb-2 block">اللون</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} onClick={() => set('color', c)}
              className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-primary' : ''}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
        <button onClick={() => onSave(form)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">
          <Save className="w-4 h-4" />حفظ
        </button>
      </div>
    </div>
  );
}

export default function Categories() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (form) => {
      const payload = { name: form.name || form.name_ar, name_ar: form.name_ar, color: form.color, icon: form.icon, is_active: true };
      if (form.id) {
        const { error } = await supabase.from('categories').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setShowForm(false); setEditing(null); toast.success('تم الحفظ'); },
    onError: () => toast.error('فشل الحفظ'),
  });

  const del = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('categories').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('تم الحذف'); },
    onError: () => toast.error('فشل الحذف'),
  });

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Tag className="w-6 h-6 text-primary" />التصنيفات
        </h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />تصنيف جديد
        </button>
      </div>

      {(showForm || editing) && (
        <CategoryForm initial={editing || {}} onSave={(f) => save.mutate(f)} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cats.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                style={{ background: c.color || '#6366f1' }}>
                {c.icon || (c.name_ar || c.name)?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{c.name_ar || c.name}</p>
                {c.name_ar && c.name && <p className="text-xs text-muted-foreground truncate">{c.name}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(c); setShowForm(false); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={() => { if (confirm('حذف التصنيف؟')) del.mutate(c.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
