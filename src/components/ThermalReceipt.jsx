import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { format } from 'date-fns';
import { getPrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';

export default function ThermalReceipt({ order, branch, label = 'طباعة', size = 'sm' }) {
  const buildHTML = () => {
    const settings = { ...DEFAULT_PRINTER, ...getPrinterSettings() };
    const items = order.items || [];
    const branchName = branch?.name_ar || branch?.name || 'فيلسي';
    const dateStr = order.created_date
      ? format(new Date(order.created_date), 'dd/MM/yyyy HH:mm')
      : format(new Date(), 'dd/MM/yyyy HH:mm');

    const orderTypeMap = {
      dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل',
      car_wash: 'غسيل سيارة', online: 'أونلاين',
    };
    const payMap = {
      cash: 'نقدي', card: 'بطاقة', mixed: 'مختلط',
      online: 'أونلاين', credit: 'آجل',
    };

    const width = settings.paperWidth || '80mm';

    return `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Tajawal',Arial,sans-serif;font-size:13px;width:${width};max-width:${width};padding:6px 8px;color:#000;background:#fff;}
  .center{text-align:center;}.bold{font-weight:700;}.sm{font-size:11px;}.lg{font-size:18px;}
  .row{display:flex;justify-content:space-between;margin:2px 0;}
  .sep{border-top:1px dashed #000;margin:5px 0;}
  @media print{body{width:${width};}@page{margin:0;size:${width} auto;}.no-print{display:none;}}
</style>
</head>
<body>
  <div class="center" style="padding:4px 0 6px;">
    ${branch?.logo_url ? `<img src="${branch.logo_url}" alt="logo" style="height:50px;object-fit:contain;margin-bottom:4px;" />` : ''}
    <div class="lg bold" style="color:#c0392b;">${branchName}</div>
    ${branch?.address ? `<div class="sm">${branch.address}</div>` : ''}
    ${branch?.phone ? `<div class="sm">📞 ${branch.phone}</div>` : ''}
    ${branch?.vat_number ? `<div class="sm">الرقم الضريبي: ${branch.vat_number}</div>` : ''}
  </div>
  <div class="sep"></div>
  <div class="center bold" style="font-size:14px;margin:3px 0;">فاتورة ضريبية</div>
  <div class="sep"></div>
  <div style="font-size:12px;">
    <div class="row"><span>رقم الطلب: <b>${order.order_number}</b></span><span>${dateStr}</span></div>
    ${order.customer_name ? `<div>العميل: ${order.customer_name}</div>` : ''}
    ${order.table_number ? `<div>الطاولة: ${order.table_number}</div>` : ''}
    ${order.plate_number ? `<div>لوحة السيارة: ${order.plate_number}</div>` : ''}
    <div>النوع: ${orderTypeMap[order.order_type] || order.order_type || ''}</div>
    ${order.cashier_name ? `<div>الكاشير: ${order.cashier_name}</div>` : ''}
  </div>
  <div class="sep"></div>
  <div style="font-size:12px;">
    <div class="row" style="font-weight:700;margin-bottom:3px;">
      <span style="flex:3;">الصنف</span><span style="flex:1;text-align:center;">كمية</span><span style="flex:2;text-align:left;">المجموع</span>
    </div>
    ${items.map(item => `
      <div class="row" style="border-bottom:1px dotted #ccc;padding-bottom:2px;">
        <span style="flex:3;">${item.product_name || ''}</span>
        <span style="flex:1;text-align:center;">${item.quantity}</span>
        <span style="flex:2;text-align:left;">${(item.total || 0).toFixed(2)}</span>
      </div>
      ${item.modifiers?.length ? `<div style="font-size:10px;color:#555;padding-right:8px;">+ ${item.modifiers.map(m => m.name).join('، ')}</div>` : ''}
      ${item.notes ? `<div style="font-size:10px;color:#777;padding-right:8px;">📝 ${item.notes}</div>` : ''}
    `).join('')}
  </div>
  <div class="sep"></div>
  <div style="font-size:12px;">
    <div class="row"><span>المجموع الفرعي</span><span>${(order.subtotal || 0).toFixed(2)} ﷼</span></div>
    ${(order.discount_amount || 0) > 0 ? `<div class="row"><span>الخصم</span><span>-${(order.discount_amount || 0).toFixed(2)} ﷼</span></div>` : ''}
    <div class="row"><span>ضريبة 15%</span><span>${(order.tax_amount || 0).toFixed(2)} ﷼</span></div>
  </div>
  <div class="row" style="font-size:15px;font-weight:700;border-top:2px solid #000;margin-top:4px;padding-top:4px;">
    <span>الإجمالي</span><span>${(order.total || 0).toFixed(2)} ﷼</span>
  </div>
  ${order.amount_paid ? `
  <div style="font-size:12px;margin-top:4px;">
    <div class="row"><span>المدفوع</span><span>${(order.amount_paid || 0).toFixed(2)} ﷼</span></div>
    ${(order.change_due || 0) > 0 ? `<div class="row"><span>الباقي</span><span>${(order.change_due || 0).toFixed(2)} ﷼</span></div>` : ''}
    <div class="row"><span>طريقة الدفع</span><span>${payMap[order.payment_method] || order.payment_method || ''}</span></div>
  </div>` : ''}
  <div class="sep"></div>
  <div class="center sm" style="margin-top:4px;">
    <div>متوافق مع هيئة الزكاة والضريبة والجمارك</div>
    <div style="margin-top:4px;color:#666;">شكراً لتعاملكم معنا — Thank you</div>
  </div>
  <div style="height:15mm;"></div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),800);}</script>
</body></html>`;
  };

  const handlePrint = () => {
    const settings = { ...DEFAULT_PRINTER, ...getPrinterSettings() };
    const html = buildHTML();
    const copies = Math.max(1, settings.copies || 1);
    for (let i = 0; i < copies; i++) {
      const win = window.open('', '_blank', 'width=380,height=650');
      if (!win) { alert('يُرجى السماح بالنوافذ المنبثقة لتفعيل الطباعة'); return; }
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <Button size={size} variant="outline" onClick={handlePrint} className="border-primary/40 text-primary hover:bg-primary/10">
      <Printer className="w-3.5 h-3.5 ml-1" /> {label}
    </Button>
  );
}
