import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { X, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AddStockDialog({ product, onClose }) {
  const [qty, setQty]         = useState('');
  const [type, setType]       = useState('add');
  const [notes, setNotes]     = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(qty);
      if (!amount || amount <= 0) throw new Error('الكمية غير صحيحة');
      const currentStock = product.stock_quantity || 0;
      const newStock = type === 'add' ? currentStock + amount : Math.max(0, currentStock - amount);

      const { error: updateError } = await supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from('inventory_logs').insert({
        product_id: product.id,
        change_type: type,
        quantity_change: type === 'add' ? amount : -amount,
        quantity_before: currentStock,
        quantity_after: newStock,
        notes,
      });
      if (logError) console.warn('log error:', logError);
    },
    onSuccess: () => { toast.success('تم تحديث المخزون'); onClose(); },
    onError: (e) => toast.error(e.message || 'فشل التحديث'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">تعديل المخزون</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="text-sm text-muted-foreground">المنتج: <span className="font-medium text-foreground">{product.name_ar || product.name}</span></p>
        <p className="text-sm text-muted-foreground">المخزون الحالي: <span className="font-bold text-foreground">{product.stock_quantity || 0}</span></p>

        <div className="flex gap-2">
          {[['add','إضافة'],['remove','خصم']].map(([v, l]) => (
            <button key={v} onClick={() => setType(v)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${type === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>
          <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-muted">إلغاء</button>
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
