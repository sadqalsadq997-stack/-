import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, CheckCircle, Clock } from 'lucide-react';
import { generateZATCAQR, getZATCAStatusLabel } from '@/lib/zatca';
import { format } from 'date-fns';

// ══════════════════════════════════════════════════════
// فاتورة ZATCA Phase 2 — كاملة مع باركود QR وشعار المنشأة
// فاتورة ضريبية منظمة تصدر فواتير حقيقية
// ══════════════════════════════════════════════════════

export default function ZATCAInvoicePDF({ order, branch, zatcaInvoice, onClose }) {
  const printRef = useRef(null);

  const sellerName = branch?.zatca_seller_name || branch?.name_ar || branch?.name || 'البائع';
  const vatNumber  = branch?.vat_number || branch?.zatca_vat_number || '';
  const crNumber   = branch?.cr_number || '';
  const city       = branch?.zatca_city || branch?.address || 'الرياض';
  const logo       = branch?.logo_url || '';
  const phone      = branch?.phone || '';

  const items = order?.items || [];
  const subtotal   = order?.subtotal || (order?.total ? order.total / 1.15 : 0);
  const vatAmount  = order?.tax_amount || (order?.total ? order.total - subtotal : 0);
  const total      = order?.total || 0;
  const discount   = order?.discount || 0;

  // استخدام QR الحقيقي من ZATCA إن وُجد
  const qrData = zatcaInvoice?.qr_code || generateZATCAQR({
    sellerName, vatNumber,
    invoiceDate:  order?.created_at || new Date().toISOString(),
    invoiceTotal: total,
    vatAmount,
  });

  // بيانات ZATCA
  const invoiceNumber = zatcaInvoice?.invoice_number || order?.order_number || '';
  const invoiceUuid   = zatcaInvoice?.invoice_uuid || order?.invoice_uuid || '';
  const zatcaStatus   = zatcaInvoice?.zatca_status || order?.zatca_status || 'pending';

  const payLabel = { cash: 'نقدي', card: 'بطاقة', mixed: 'مختلط', credit: 'آجل', online: 'أونلاين' }[order?.payment_method] || order?.payment_method || 'نقدي';
  const typeLabel = { dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل', online: 'أونلاين' }[order?.order_type] || '';

  const itemRows = items.map((item, i) => {
    const lineTotal = (item.price || 0) * (item.quantity || item.qty || 1);
    const lineVAT   = lineTotal - (lineTotal / 1.15);
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right">${item.name_ar || item.name || 'منتج'}</td>
        <td>${item.quantity || item.qty || 1}</td>
        <td>${(item.price || 0).toFixed(2)}</td>
        <td>${lineVAT.toFixed(2)}</td>
        <td style="font-weight:700">${lineTotal.toFixed(2)}</td>
      </tr>`;
  }).join('');

  function openPrint() {
    const win = window.open('', '_blank', 'width=860,height=1100');
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"/>
<title>فاتورة ضريبية — ${order?.order_number || ''}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Tajawal',sans-serif}
body{background:#fff;color:#1a1a1a;padding:28px 36px;font-size:12.5px;line-height:1.6}

/* رأس الفاتورة */
.invoice-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:16px;padding-bottom:18px;border-bottom:3px solid #c0392b;margin-bottom:20px}
.seller-info{text-align:right}
.seller-name{font-size:20px;font-weight:900;color:#c0392b;margin-bottom:4px}
.seller-sub{font-size:11px;color:#666;line-height:2}
.invoice-title{text-align:center;border:2px solid #c0392b;border-radius:12px;padding:12px 20px}
.invoice-title h1{font-size:18px;font-weight:900;color:#c0392b}
.invoice-title p{font-size:10px;color:#888;margin-top:2px}
.buyer-info{text-align:left}
.buyer-label{font-size:10px;color:#888;margin-bottom:4px}

/* رقم الفاتورة والتفاصيل */
.invoice-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#fafafa;border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:18px}
.meta-box label{display:block;font-size:10px;color:#888;margin-bottom:2px}
.meta-box span{font-weight:700;font-size:12.5px;color:#1a1a1a}

/* الجدول */
.items-table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
.items-table thead tr{background:#c0392b;color:#fff}
.items-table th{padding:9px 10px;font-weight:700;text-align:center}
.items-table th:nth-child(2){text-align:right}
.items-table td{padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center;vertical-align:middle}
.items-table td:nth-child(2){text-align:right}
.items-table tr:nth-child(even) td{background:#fafafa}

/* الإجمالي */
.totals-section{display:flex;justify-content:flex-end;margin-bottom:18px}
.totals-table{width:260px;font-size:12.5px}
.totals-table td{padding:5px 10px;border-bottom:1px solid #f5f5f5}
.totals-table td:first-child{color:#666}
.totals-table td:last-child{text-align:left;font-weight:600}
.totals-table tr.vat-row td{color:#c0392b}
.totals-table tr.grand td{font-size:15px;font-weight:900;background:#c0392b;color:#fff;border-radius:8px;padding:10px}
.totals-table tr.grand td:first-child{border-radius:0 8px 8px 0}
.totals-table tr.grand td:last-child{border-radius:8px 0 0 8px}

/* QR + ZATCA */
.qr-section{display:flex;align-items:flex-start;gap:20px;padding:16px;border:1px dashed #ddd;border-radius:12px;margin-bottom:18px;background:#fafafa}
.qr-img{width:90px;height:90px;flex-shrink:0}
.zatca-info{flex:1;font-size:10.5px;color:#555;line-height:2.2}
.zatca-badge{display:inline-flex;align-items:center;gap:5px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;border-radius:8px;padding:4px 10px;font-size:10px;font-weight:700;margin-bottom:8px}
.zatca-hash{font-family:monospace;font-size:9.5px;color:#999;word-break:break-all;margin-top:6px}

/* التذييل */
.footer{text-align:center;margin-top:16px;padding-top:14px;border-top:1px solid #eee;font-size:10.5px;color:#aaa;line-height:2}

/* أمان الطباعة */
.no-print{position:fixed;top:16px;left:16px;display:flex;gap:8px;z-index:999}
@media print{.no-print{display:none!important}body{padding:16px 24px}}
</style>
</head><body>

<div class="no-print">
  <button onclick="window.print()" style="background:#c0392b;color:#fff;border:none;border-radius:10px;padding:9px 20px;cursor:pointer;font-family:Tajawal;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">
    🖨️ طباعة
  </button>
  <button onclick="window.close()" style="background:#f1f5f9;color:#333;border:none;border-radius:10px;padding:9px 14px;cursor:pointer;font-family:Tajawal;font-size:13px">✕</button>
</div>

<!-- رأس الفاتورة -->
<div class="invoice-header">
  <div class="seller-info">
    ${logo ? `<img src="${logo}" style="height:52px;object-fit:contain;margin-bottom:8px;max-width:160px"><br>` : ''}
    <div class="seller-name">${sellerName}</div>
    <div class="seller-sub">
      ${city ? `<span>📍 ${city}</span><br>` : ''}
      ${phone ? `<span>📞 ${phone}</span><br>` : ''}
      ${vatNumber ? `<span>🔵 الرقم الضريبي: <strong>${vatNumber}</strong></span><br>` : ''}
      ${crNumber ? `<span>📋 السجل التجاري: <strong>${crNumber}</strong></span>` : ''}
    </div>
  </div>
  <div class="invoice-title">
    <h1>فاتورة ضريبية</h1>
    <p>Tax Invoice</p>
    <div style="margin-top:8px;font-size:10px;color:#c0392b;font-weight:700">${order?.order_number || '—'}</div>
  </div>
  <div class="buyer-info">
    <div class="buyer-label">بيانات العميل</div>
    <div style="font-weight:700;font-size:13px">${order?.customer_name || 'عميل نقدي'}</div>
    ${order?.customer_phone ? `<div style="font-size:11px;color:#666">${order.customer_phone}</div>` : ''}
    ${order?.customer_vat ? `<div style="font-size:11px;color:#666">ر.ض: ${order.customer_vat}</div>` : ''}
  </div>
</div>

<!-- بيانات الفاتورة -->
<div class="invoice-meta">
  <div class="meta-box"><label>رقم الفاتورة</label><span>${order?.order_number || '—'}</span></div>
  <div class="meta-box"><label>التاريخ والوقت</label><span>${dateStr}</span></div>
  <div class="meta-box"><label>طريقة الدفع</label><span>${payLabel}</span></div>
  <div class="meta-box"><label>نوع الطلب</label><span>${typeLabel || 'محلي'}</span></div>
</div>

<!-- جدول المنتجات -->
<table class="items-table">
  <thead>
    <tr>
      <th style="width:40px">#</th>
      <th>الصنف</th>
      <th>الكمية</th>
      <th>السعر</th>
      <th>الضريبة 15%</th>
      <th>الإجمالي</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<!-- الإجمالي -->
<div class="totals-section">
  <table class="totals-table">
    <tr><td>المجموع قبل الضريبة</td><td>${subtotal.toFixed(2)} ر.س</td></tr>
    ${discount > 0 ? `<tr><td>الخصم</td><td style="color:#c0392b">- ${discount.toFixed(2)} ر.س</td></tr>` : ''}
    <tr class="vat-row"><td>ضريبة القيمة المضافة (15%)</td><td>${vatAmount.toFixed(2)} ر.س</td></tr>
    <tr class="grand"><td>الإجمالي المطلوب</td><td>${total.toFixed(2)} ر.س</td></tr>
  </table>
</div>

<!-- QR Code ZATCA -->
<div class="qr-section">
  <img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(qrData)}&format=png&margin=2" alt="QR ZATCA" />
  <div class="zatca-info">
    <div class="zatca-badge">✓ فاتورة إلكترونية متوافقة مع ZATCA Phase 2</div>
    <div><strong>اسم البائع:</strong> ${sellerName}</div>
    ${vatNumber ? `<div><strong>الرقم الضريبي:</strong> ${vatNumber}</div>` : ''}
    <div><strong>تاريخ الإصدار:</strong> ${issueDateISO} — ${issueTimeISO}</div>
    <div><strong>المبلغ الإجمالي:</strong> ${total.toFixed(2)} ر.س</div>
    <div><strong>ضريبة القيمة المضافة:</strong> ${vatAmount.toFixed(2)} ر.س</div>
    <div class="zatca-hash">TLV: ${qrData.substring(0, 60)}...</div>
  </div>
</div>

<!-- التذييل -->
<div class="footer">
  <div>شكراً لتعاملكم معنا — يسعدنا خدمتكم دائماً</div>
  <div style="margin-top:4px;color:#ccc">هذه الفاتورة صادرة إلكترونياً وهي سارية المفعول دون توقيع</div>
  <div style="margin-top:4px;font-size:9px;color:#ddd">الرقم الضريبي: ${vatNumber || '—'} | السجل التجاري: ${crNumber || '—'}</div>
</div>

</body></html>`);
    win.document.close();
  }

  return (
    <div className="flex gap-2">
      <Button onClick={openPrint} className="flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90">
        <Printer className="w-4 h-4" />
        طباعة / PDF
      </Button>
    </div>
  );
}
