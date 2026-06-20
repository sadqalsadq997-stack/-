import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Minus, Trash2, CreditCard, Banknote, Receipt, User, Percent, Stamp, Gift } from 'lucide-react';
import { toast } from 'sonner';
import ThermalReceipt from '@/components/ThermalReceipt';
import { getPrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';

export default function POSCart({
  cart, setCart,
  customerName, setCustomerName,
  customerPhone, setCustomerPhone,
  orderType, tableNumber, plateNumber,
  onOrderComplete
}) {
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  const [foundCustomer, setFoundCustomer] = useState(null);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [itemNotes, setItemNotes] = useState({});
  const [activeBranch] = useState(() => { try { return JSON.parse(localStorage.getItem('activeBranch') || 'null'); } catch { return null; } });
  const queryClient = useQueryClient();

  const { data: loyaltySettings = [] } = useQuery({
    queryKey: ['loyaltySettings'],
    queryFn: async () => { const { data } = await supabase.from('loyalty_settings').select('*').limit(1); return data || []; },
  });
  const autoPrint = loyaltySettings[0]?.auto_print || getPrinterSettings().autoPrint || false;
  const stampsThreshold = loyaltySettings[0]?.stamps_threshold || 10;

  const searchCustomer = async (phone) => {
    if (phone.length < 7) { setFoundCustomer(null); return; }
    const { data } = await supabase.from('customers').select('*').eq('phone', phone).limit(1);
    if (data && data.length > 0) {
      setFoundCustomer(data[0]);
      setCustomerName(data[0].name);
    } else {
      setFoundCustomer(null);
    }
  };

  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => searchCustomer(val), 600));
  };

  // Auto-create new customer at checkout if phone provided but not found
  const ensureCustomer = async () => {
    if (foundCustomer) return foundCustomer;
    if (!customerPhone || customerPhone.length < 7) return null;
    const { data: created, error } = await supabase.from('customers').insert({
      name: customerName || `عميل ${customerPhone.slice(-4)}`,
      phone: customerPhone,
      stamps: 0,
    }).select().single();
    if (error) { console.warn('customer create error:', error); return null; }
    setFoundCustomer(created);
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success(`✓ تم إنشاء حساب عميل جديد تلقائياً`);
    return created;
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.unit_price + item.modifiers_total) * item.quantity, 0);
  const discount = discountType === 'percentage' ? subtotal * (discountAmount / 100) : discountAmount;
  const afterDiscount = subtotal - discount;
  const taxAmount = afterDiscount * 0.15;
  const total = afterDiscount + taxAmount;
  const changeDue = Number(amountPaid) - total;

  // Stamps
  const currentStamps = foundCustomer?.stamps || 0;
  const newStamps = currentStamps + 1;
  const isStampReward = foundCustomer && newStamps >= stampsThreshold;
  const progressPercent = Math.min(100, Math.round((currentStamps / stampsThreshold) * 100));

  const updateQty = (key, delta) => {
    setCart(prev => prev.map(item => {
      if (item.key !== key) return item;
      const newQty = item.quantity + delta;
      return newQty > 0 ? { ...item, quantity: newQty } : item;
    }).filter(item => item.quantity > 0));
  };
  const removeItem = (key) => setCart(prev => prev.filter(item => item.key !== key));

  const orderMutation = useMutation({
    mutationFn: async (data) => {
      const { _autoCustomer, _autoNewStamps, _autoStampReward, ...payload } = data;
      const { data: createdOrder, error } = await supabase.from('orders').insert(payload).select().single();
      if (error) throw error;

      // ── إرسال الفاتورة لـ ZATCA بعد إنشاء الطلب ──────────────────────
      // يعمل في الخلفية ولا يوقف عملية البيع
      try {
        // جلب إعدادات ZATCA للفرع
        const { data: branch } = await supabase
          .from('branches').select('id, zatca_enabled').eq('is_active', true).single();

        if (branch?.zatca_enabled) {
          const { data: zatcaConfig } = await supabase
            .from('zatca_config')
            .select('id')
            .eq('branch_id', branch.id)
            .eq('onboarding_status', 'active')
            .single();

          if (zatcaConfig) {
            // إرسال للـ Edge Function بشكل غير متزامن
            supabase.functions.invoke('zatca-invoice', {
              body: {
                action: 'report_invoice',
                branchId: branch.id,
                orderId: createdOrder.id,
                invoiceData: {
                  invoiceType: (createdOrder.is_b2b || payload.is_b2b) ? 'standard' : 'simplified',
                  buyer: createdOrder.customer_name ? {
                    name: createdOrder.customer_name,
                    vatNumber: payload.buyer_vat || undefined,
                  } : undefined,
                  items: (createdOrder.items || []).map((item, idx) => ({
                    id: idx + 1,
                    name: item.product_name || item.name || 'منتج',
                    quantity: item.quantity || 1,
                    unitCode: 'PCE',
                    unitPrice: item.unit_price || item.price || 0,
                    lineTotal: item.total || ((item.unit_price || 0) * (item.quantity || 1)),
                    vatRate: 15,
                    vatAmount: Math.round((item.total || 0) - ((item.total || 0) / 1.15) * 100) / 100,
                    vatCategory: 'S',
                  })),
                  subtotal: createdOrder.subtotal || createdOrder.total / 1.15,
                  discountTotal: createdOrder.discount_amount || 0,
                  vatAmount: createdOrder.tax_amount || (createdOrder.total - createdOrder.total / 1.15),
                  total: createdOrder.total,
                  paymentMethod: createdOrder.payment_method || 'cash',
                },
              },
            }).catch(err => console.warn('ZATCA background submission failed:', err));
          }
        }
      } catch (zatcaErr) {
        // لا نوقف عملية البيع إذا فشل إرسال ZATCA
        console.warn('ZATCA submission skipped:', zatcaErr);
      }
      // ──────────────────────────────────────────────────────────────────

      return { ...createdOrder, _autoCustomer, _autoNewStamps, _autoStampReward };
    },
    onSuccess: (createdOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('تم إنشاء الطلب بنجاح');
      setCompletedOrder(createdOrder);
      setPaymentDialog(false);
      setAmountPaid('');
      setDiscountAmount(0);
      setItemNotes({});

      const cust = createdOrder._autoCustomer;
      if (cust) {
        const updatedStamps = createdOrder._autoStampReward ? 0 : createdOrder._autoNewStamps;
        supabase.from('customers').update({
          stamps: updatedStamps,
        }).eq('id', cust.id);
        toast.success(`⭐ تم إضافة طابع لـ ${cust.name} (${updatedStamps}/${stampsThreshold})`, { duration: 4000 });
        if (createdOrder._autoStampReward) toast.success(`🎉 ${cust.name} اكتملت طوابعه!`, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      }
      setFoundCustomer(null);
      setCustomerPhone('');
      if (onOrderComplete) onOrderComplete();
    },
  });

  const handleCheckout = async () => {
    // Ensure customer exists (auto-create if phone provided)
    const customer = await ensureCustomer();
    const customerNewStamps = customer ? (customer.stamps || 0) + 1 : 0;
    const customerStampReward = customer && customerNewStamps >= stampsThreshold;

    const orderNumber = 'ORD-' + Date.now().toString().slice(-8);
    orderMutation.mutate({
      order_number: orderNumber,
      order_type: orderType,
      status: 'completed',
      customer_name: customer?.name || customerName || 'زائر',
      customer_id: customer?.id,
      table_number: tableNumber || undefined,
      plate_number: plateNumber || undefined,
      items: cart.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        modifiers: item.modifiers,
        notes: itemNotes[item.key] || '',
        total: (item.unit_price + item.modifiers_total) * item.quantity,
      })),
      subtotal,
      tax_amount: taxAmount,
      discount_amount: discount,
      discount_type: discountType,
      total,
      payment_method: paymentMethod,
      amount_paid: Number(amountPaid) || total,
      change_due: Math.max(0, changeDue),
      loyalty_points_earned: 0,
      // Pass for orderMutation onSuccess to use:
      _autoCustomer: customer,
      _autoNewStamps: customerNewStamps,
      _autoStampReward: customerStampReward,
    });
  };

  // Auto-print effect
  useEffect(() => {
    if (completedOrder && autoPrint) {
      // Trigger print after short delay to allow dialog to render
      setTimeout(() => {
        const printBtn = document.getElementById('auto-print-btn');
        if (printBtn) printBtn.click();
      }, 300);
    }
  }, [completedOrder, autoPrint]);

  return (
    <>
      <div className="w-full bg-card flex flex-col overflow-hidden h-full">
        {/* Cart Header */}
        <div className="p-4 border-b border-border bg-gradient-to-l from-primary/5 to-transparent space-y-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">سلة المشتريات</span>
            <span className="mr-auto text-xs text-muted-foreground">{cart.length} عنصر</span>
          </div>

          {/* Phone lookup */}
          <div className="relative">
            <User className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="رقم جوال العميل"
              value={customerPhone}
              onChange={e => handlePhoneChange(e.target.value)}
              className="h-9 pr-8 text-sm"
              type="tel"
            />
          </div>

          {foundCustomer ? (
            <div className="space-y-1.5">
              {/* Customer info */}
              <div className="bg-primary/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                <Stamp className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-primary truncate">{foundCustomer.name}</p>
                  <p className="text-muted-foreground">{currentStamps} / {stampsThreshold} طابع</p>
                </div>
                {isStampReward && (
                  <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-bold text-[11px] animate-pulse">
                    <Gift className="w-3.5 h-3.5" /> جائزة!
                  </div>
                )}
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="relative">
              <User className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="اسم العميل"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="h-9 pr-8 text-sm"
              />
            </div>
          )}
        </div>

        {/* Cart Items */}
        <ScrollArea className="flex-1 p-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Receipt className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">السلة فارغة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.key} className="bg-muted/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{item.product_name}</p>
                      {item.modifiers?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.modifiers.map((m, i) => (
                            <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                              {m.name} {m.price > 0 && `+${m.price}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeItem(item.key)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="font-bold text-sm">{((item.unit_price + item.modifiers_total) * item.quantity).toFixed(2)}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="ملاحظة (اختياري)"
                    value={itemNotes[item.key] || ''}
                    onChange={e => setItemNotes(prev => ({ ...prev, [item.key]: e.target.value }))}
                    className="w-full text-xs border border-dashed border-border rounded-lg px-2 py-1 bg-transparent placeholder-muted-foreground/50 outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Cart Footer */}
        <div className="p-4 border-t border-border space-y-3">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <Percent className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="number"
              placeholder="خصم"
              value={discountAmount || ''}
              onChange={e => setDiscountAmount(Number(e.target.value))}
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant={discountType === 'fixed' ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setDiscountType('fixed')}>﷼</Button>
            <Button size="sm" variant={discountType === 'percentage' ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setDiscountType('percentage')}>%</Button>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>المجموع الفرعي</span><span>{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>الخصم</span><span>-{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>الضريبة (15%)</span><span>{taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-1 border-t">
              <span>الإجمالي</span>
              <span className="text-primary">{total.toFixed(2)} ﷼</span>
            </div>
          </div>

          <Button
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-base font-bold"
            disabled={cart.length === 0}
            onClick={() => { setAmountPaid(''); setPaymentDialog(true); }}
          >
            <Receipt className="w-5 h-5 ml-2" />
            ادفع {total.toFixed(2)} ﷼
          </Button>
        </div>
      </div>

      {/* Completed Order Dialog */}
      <Dialog open={!!completedOrder} onOpenChange={() => setCompletedOrder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Receipt className="w-5 h-5" /> تم الدفع بنجاح ✓
            </DialogTitle>
          </DialogHeader>
          {completedOrder && (
            <div className="space-y-3">
              {completedOrder?._autoStampReward && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                  <Gift className="w-8 h-8 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-amber-700">🎁 مبروك! اكتملت الطوابع</p>
                    <p className="text-xs text-amber-600">العميل وصل للحد المطلوب ويستحق جائزة.</p>
                  </div>
                </div>
              )}
              <div className="bg-muted rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>رقم الطلب</span><span className="font-bold">{completedOrder.order_number}</span></div>
                <div className="flex justify-between"><span>الإجمالي</span><span className="font-bold text-primary">{(completedOrder.total || 0).toFixed(2)} ﷼</span></div>
                {completedOrder.change_due > 0 && <div className="flex justify-between"><span>الباقي</span><span className="font-bold text-green-600">{completedOrder.change_due.toFixed(2)} ﷼</span></div>}
              </div>
              <div className="flex gap-2">
                <span id="auto-print-trigger">
                  <ThermalReceipt order={completedOrder} branch={activeBranch} id="auto-print-btn" />
                </span>
                <Button variant="outline" className="flex-1" onClick={() => setCompletedOrder(null)}>إغلاق</Button>
              </div>
              {autoPrint && <p className="text-xs text-center text-muted-foreground">🖨️ تم الإرسال للطابعة تلقائياً</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>اختر طريقة الدفع</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'cash', label: 'نقدي', icon: Banknote },
                { value: 'card', label: 'بطاقة', icon: CreditCard },
              ].map(m => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === m.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                >
                  <m.icon className={`w-6 h-6 ${paymentMethod === m.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">المبلغ المدفوع</label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder={total.toFixed(2)}
                  className="text-center text-lg font-bold"
                  autoFocus
                />
                {Number(amountPaid) >= total && (
                  <p className="text-center mt-2 text-lg font-bold text-green-600">
                    الباقي: {changeDue.toFixed(2)} ﷼
                  </p>
                )}
              </div>
            )}

            <div className="text-center p-3 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">الإجمالي المطلوب</p>
              <p className="text-2xl font-bold text-primary">{total.toFixed(2)} ﷼</p>
              {foundCustomer && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-primary">
                    <Stamp className="w-3 h-3 inline ml-1" />
                    سيُضاف طابع واحد • الرصيد بعد: {newStamps}
                  </p>
                  {isStampReward && (
                    <p className="text-xs font-bold text-amber-600 bg-amber-50 rounded-lg py-1 px-2">
                      🎁 ستكتمل الطوابع!
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold"
              onClick={handleCheckout}
              disabled={orderMutation.isPending || (paymentMethod === 'cash' && Number(amountPaid) > 0 && Number(amountPaid) < total)}
            >
              {orderMutation.isPending ? 'جارٍ المعالجة...' : 'تأكيد الدفع'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}