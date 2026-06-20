import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  UserCheck, Plus, Search, Trash2, Edit3, Loader2,
  X, Save, ToggleLeft, ToggleRight, ShieldCheck, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/lib/permissions';

const ROLES = ['admin','branch_manager','cashier','waiter','kitchen','employee','support_agent'];

// الصفحات المتاحة لمنح/سحب الصلاحيات
const ALL_PAGES = [
  { path: '/',            label: 'لوحة التحكم'    },
  { path: '/pos',         label: 'نقطة البيع'     },
  { path: '/orders',      label: 'الطلبات'         },
  { path: '/tables',      label: 'الطاولات'        },
  { path: '/kitchen',     label: 'المطبخ'          },
  { path: '/products',    label: 'المنتجات'        },
  { path: '/categories',  label: 'التصنيفات'       },
  { path: '/inventory',   label: 'المخزون'         },
  { path: '/customers',   label: 'العملاء'         },
  { path: '/invoices',    label: 'الفواتير'        },
  { path: '/suppliers',   label: 'الموردون'        },
  { path: '/expenses',    label: 'المصروفات'       },
  { path: '/analytics',   label: 'التقارير'        },
  { path: '/employees',   label: 'الموظفون'        },
  { path: '/support',     label: 'الدعم الفني'    },
  { path: '/admin-support', label: 'دعم — رد المدير' },
  { path: '/ai',          label: 'المساعد الذكي'  },
  { path: '/estore',      label: 'المتجر الإلكتروني' },
  { path: '/loyalty',     label: 'الولاء'          },
  { path: '/settings',    label: 'الإعدادات'       },
  { path: '/zatca-settings', label: 'ZATCA — الإعداد' },
];

const ROLE_COLORS = {
  admin:          'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  branch_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  cashier:        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  waiter:         'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  kitchen:        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  employee:       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  support_agent:  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
};

// ── لوحة الصلاحيات المخصصة ────────────────────────────────
function PermissionsPanel({ perms, onChange }) {
  const [open, setOpen] = useState(false);
  const granted = Object.values(perms).filter(Boolean).length;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium">
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          صلاحيات مخصصة
          {granted > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">{granted}</span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3 grid grid-cols-2 gap-1.5">
          <p className="col-span-2 text-xs text-muted-foreground mb-1">
            تفعيل أو تعطيل صلاحية الوصول لكل صفحة بشكل منفصل (يتجاوز صلاحيات الدور)
          </p>
          {ALL_PAGES.map(({ path, label }) => {
            const val = perms[path];
            return (
              <label key={path} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-xs">
                <input type="checkbox" checked={val === true} onChange={e => onChange(path, e.target.checked ? true : undefined)}
                  className="rounded" />
                <span className={val === true ? 'text-foreground font-medium' : 'text-muted-foreground'}>{label}</span>
                {val === false && <span className="text-red-500 text-xs">محظور</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmployeeForm({ initial, onSave, onCancel, branches }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', role: 'cashier', pin: '',
    salary: '', notes: '', branch_id: '', ...initial,
    permissions: initial?.permissions || {},
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial?.id ? 'تعديل الموظف' : 'موظف جديد'}</h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[['name','الاسم',true],['phone','الجوال',false],['email','البريد',false]].map(([k,l,req]) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground mb-1 block">{l}{req && <span className="text-red-500">*</span>}</label>
            <input value={form[k]||''} onChange={e => set(k, e.target.value)}
              className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الدور</label>
          <select value={form.role} onChange={e => set('role', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]||r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">رقم PIN (4 أرقام)</label>
          <input type="password" inputMode="numeric" maxLength={4} value={form.pin||''} onChange={e => set('pin', e.target.value.replace(/\D/g,'').slice(0,4))}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الراتب (ر.س)</label>
          <input type="number" value={form.salary||''} onChange={e => set('salary', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
          <select value={form.branch_id||''} onChange={e => set('branch_id', e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary">
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
      {/* صلاحيات مخصصة */}
      <PermissionsPanel
        perms={form.permissions}
        onChange={(path, val) => set('permissions', { ...form.permissions, [path]: val })}
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
        <button onClick={() => {
          if (!form.name) return toast.error('الاسم مطلوب');
          onSave({ ...form, salary: form.salary ? Number(form.salary) : null });
        }} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">
          <Save className="w-4 h-4" />حفظ
        </button>
      </div>
    </div>
  );
}

export default function Employees() {
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const qc = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_profiles').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => { const { data } = await supabase.from('branches').select('id,name'); return data||[]; },
  });

  const save = useMutation({
    mutationFn: async (form) => {
      const { id, ...rest } = form;
      if (id) { const { error } = await supabase.from('employee_profiles').update(rest).eq('id', id); if (error) throw error; }
      else     { const { error } = await supabase.from('employee_profiles').insert(rest); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setShowForm(false); setEditing(null); toast.success('تم الحفظ'); },
    onError:   () => toast.error('فشل الحفظ'),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabase.from('employee_profiles').update({ is_active: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });

  const del = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('employee_profiles').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('تم الحذف'); },
    onError:   () => toast.error('فشل الحذف'),
  });

  const filtered = employees.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.phone?.includes(search)
  );

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-primary" /> الموظفون
        </h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> موظف جديد
        </button>
      </div>

      {showForm && (
        <EmployeeForm
          initial={editing}
          branches={branches}
          onSave={(f) => save.mutate(f)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الجوال..."
          className="w-full h-10 bg-background border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground bg-muted/30">
                  {['الاسم','الدور','الفرع','الصلاحيات المخصصة','الحالة','إجراءات'].map(h => (
                    <th key={h} className="text-right px-4 py-3 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد موظفين</td></tr>
                ) : filtered.map(e => {
                  const branch = branches.find(b => b.id === e.branch_id);
                  const customPerms = Object.values(e.permissions||{}).filter(Boolean).length;
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[e.role]||ROLE_COLORS.employee}`}>
                          {ROLE_LABELS[e.role]||e.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{branch?.name||'—'}</td>
                      <td className="px-4 py-3">
                        {customPerms > 0 ? (
                          <span className="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 text-xs px-2 py-0.5 rounded-full">
                            {customPerms} صلاحية مخصصة
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggle.mutate({ id: e.id, is_active: e.is_active })}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                            e.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
                          }`}>
                          {e.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          {e.is_active ? 'نشط' : 'موقوف'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(e); setShowForm(true); }}
                            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (confirm('حذف الموظف؟')) del.mutate(e.id); }}
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
    </div>
  );
}
