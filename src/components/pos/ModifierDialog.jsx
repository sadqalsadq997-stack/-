import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

export default function ModifierDialog({ product, open, onClose, onConfirm }) {
  const [selected, setSelected] = useState({});

  const toggleOption = (groupIdx, option, multiSelect) => {
    setSelected(prev => {
      const key = `g${groupIdx}`;
      if (multiSelect) {
        const current = prev[key] || [];
        const exists = current.find(o => o.name === option.name_ar || o.name === option.name);
        if (exists) return { ...prev, [key]: current.filter(o => o.name !== (option.name_ar || option.name)) };
        return { ...prev, [key]: [...current, { name: option.name_ar || option.name, price: option.price || 0 }] };
      }
      return { ...prev, [key]: [{ name: option.name_ar || option.name, price: option.price || 0 }] };
    });
  };

  const handleConfirm = () => {
    const allModifiers = Object.values(selected).flat();
    onConfirm(allModifiers);
  };

  const totalExtra = Object.values(selected).flat().reduce((sum, m) => sum + (m.price || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{product.name_ar || product.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">اختر الإضافات والتعديلات</p>
        </DialogHeader>

        <div className="space-y-5">
          {product.modifiers?.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm">{group.group_name_ar || group.group_name}</h4>
                {group.required && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">مطلوب</span>}
              </div>

              {group.multi_select ? (
                <div className="space-y-2">
                  {group.options?.map((opt, oIdx) => (
                    <label key={oIdx} className="flex items-center gap-3 p-2.5 rounded-lg border hover:border-gold/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selected[`g${gIdx}`]?.some(o => o.name === (opt.name_ar || opt.name)) || false}
                        onCheckedChange={() => toggleOption(gIdx, opt, true)}
                      />
                      <span className="text-sm flex-1">{opt.name_ar || opt.name}</span>
                      {opt.price > 0 && <span className="text-xs text-gold font-bold">+{opt.price} ﷼</span>}
                      {opt.price === 0 && <span className="text-xs text-muted-foreground">مجاني</span>}
                    </label>
                  ))}
                </div>
              ) : (
                <RadioGroup
                  value={selected[`g${gIdx}`]?.[0]?.name || ''}
                  onValueChange={(val) => {
                    const opt = group.options.find(o => (o.name_ar || o.name) === val);
                    if (opt) toggleOption(gIdx, opt, false);
                  }}
                >
                  {group.options?.map((opt, oIdx) => (
                    <label key={oIdx} className="flex items-center gap-3 p-2.5 rounded-lg border hover:border-gold/50 cursor-pointer transition-colors">
                      <RadioGroupItem value={opt.name_ar || opt.name} />
                      <span className="text-sm flex-1">{opt.name_ar || opt.name}</span>
                      {opt.price > 0 && <span className="text-xs text-gold font-bold">+{opt.price} ﷼</span>}
                    </label>
                  ))}
                </RadioGroup>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <div>
            <p className="text-sm text-muted-foreground">السعر الإجمالي</p>
            <p className="font-tajawal font-bold text-gold text-lg">{((product.base_price || 0) + totalExtra).toFixed(2)} ﷼</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button className="bg-gold hover:bg-gold-dark text-foreground" onClick={handleConfirm}>
              أضف للسلة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}