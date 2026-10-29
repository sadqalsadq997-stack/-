import QRCode from 'qrcode';
import { format } from 'date-fns';
import { generateZATCAQR } from '@/lib/zatca';
import { getPrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';
import { printHTML, esc, printFonts } from '@/lib/print';
import { vatShort } from '@/lib/vat';

// ══════════════════════════════════════════════════════════════════
// الفاتورة الضريبية المبسطة (الطابعة الحرارية 58/80 مم)
// فيها رمز QR حسب متطلبات هيئة الزكاة (اسم البائع، الرقم الضريبي، الوقت،
// الإجمالي، الضريبة) — يُولَّد في الجهاز بدون إرسال بيانات لأي جهة خارجية
// ══════════════════════════════════════════════════════════════════

const n2 = (v) => Number(v || 0).toFixed(2);
export const PAY = { cash: 'نقدي', card: 'بطاقة', mada: 'مدى', applepay: 'Apple Pay', stcpay: 'STC Pay', transfer: 'تحويل', mixed: 'مختلط', online: 'أونلاين', credit: 'آجل' };
export const TYPES = { dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل', car_wash: 'غسيل سيارة', online: 'أونلاين' };

/** seller = { name, vat_number, address, phone, logo_url }
 *  order.doc_type = 'credit_note' ⇒ إشعار دائن (مرتجع) مع رقم الفاتورة الأصلية والسبب */
export async function buildReceiptHTML(order, seller = {}) {
  const settings = { ...DEFAULT_PRINTER, ...getPrinterSettings() };
  const width = settings.paperWidth === '58mm' ? '58mm' : '80mm';
  const narrow = width === '58mm';
  const issued = order.created_at ? new Date(order.created_at) : new Date();
  const items = Array.isArray(order.items) ? order.items : [];
  const isCN = order.doc_type === 'credit_note';
  const isProforma = order.doc_type === 'proforma';
  const isB2B = Boolean(order.is_b2b);
  const buyer = order.buyer || null;
  const brk = Array.isArray(order.tax_breakdown) ? order.tax_breakdown : [];
  const allStd = brk.length ? brk.every(b => b.category === 'S') : items.every(it => (it.vat_category || 'S') === 'S');

  // QR: المرحلة الثانية (من السيرفر: بصمة + توقيع + مفتاح عام) وإلا المرحلة الأولى
  let qr = '';
  // فاتورة الشركات: QR الهيئة بعد الاعتماد فقط (المرحلة الأولى ما تشترط QR للضريبية)
  if (!isProforma && (!isB2B || order.zatca_qr)) {
    try {
      const tlv = order.zatca_qr || generateZATCAQR({
        sellerName: seller.name || '', vatNumber: seller.vat_number || '',
        invoiceDate: issued.toISOString(), invoiceTotal: order.total, vatAmount: order.tax_amount,
      });
      qr = await QRCode.toDataURL(tlv, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
    } catch { /* بدون QR */ }
  }

  const rows = items.map(it => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unit = Number(it.price ?? it.unit_price ?? 0);
    const line = it.total != null ? Number(it.total) : unit * qty;
    const cat = it.vat_category || 'S';
    const tag = cat !== 'S' ? ` <span class="u">(${vatShort(cat)})</span>` : '';
    return `<tr><td class="nm">${esc(it.name || it.product_name)}${tag}${narrow ? '' : `<div class="u">${n2(unit)} × ${qty}</div>`}</td><td class="c">${qty}</td><td class="l">${n2(line)}</td></tr>`;
  }).join('');
  const count = items.reduce((s2, it) => s2 + Number(it.quantity ?? it.qty ?? 1), 0);
  const logo = /^https:\/\//.test(seller.logo_url || '') ? `<img src="${esc(seller.logo_url)}" alt="" class="logo"/>` : '';
  const title = isCN ? ['إشعار دائن', isB2B ? 'Credit Note — Tax Invoice' : 'Credit Note'] : isProforma ? ['فاتورة مبدئية', 'Pro-forma — ليست فاتورة ضريبية']
    : isB2B ? ['فاتورة ضريبية', 'Tax Invoice'] : ['فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'];
  const buyerHtml = isB2B && buyer ? `<div class="ref"><b>المشتري:</b> ${esc(buyer.name)}<br/>
${buyer.vat_number ? `الرقم الضريبي: <b dir="ltr">${esc(buyer.vat_number)}</b><br/>` : buyer.cr_number ? `السجل التجاري: <b dir="ltr">${esc(buyer.cr_number)}</b><br/>` : ''}
${esc([buyer.building, buyer.street, buyer.district, buyer.city, buyer.postal].filter(Boolean).join('، '))}</div>` : '';
  const exemptRows = brk.filter(b => b.category !== 'S' && Number(b.taxable) > 0)
    .map(b => `<div class="row sm"><span>${b.category === 'Z' ? 'مبيعات بنسبة صفرية' : b.category === 'E' ? 'مبيعات معفاة' : 'خارج نطاق الضريبة'}</span><span>${n2(b.taxable)}</span></div>`).join('');
  const number = order.invoice_no || order.order_number;

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
${printFonts()}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'SaudiRiyal','Cairo',Tahoma,Arial,sans-serif;font-size:${narrow ? 11 : 12}px;line-height:1.45;width:${width};padding:5mm 3mm;color:#000;background:#fff}
.center{text-align:center}.b{font-weight:700}.sm{font-size:10px}.muted{color:#333}
.logo{max-height:50px;max-width:70%;object-fit:contain;margin-bottom:4px}
.name{font-size:${narrow ? 15 : 17}px;font-weight:900}
.title{margin:7px 0;padding:5px 0;border-top:2px solid #000;border-bottom:2px solid #000;text-align:center}
.title b{display:block;font-size:${narrow ? 13 : 14}px}.title span{font-size:9.5px;letter-spacing:.5px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:1px 6px;font-size:10.5px}.meta dd{text-align:left}
.sep{border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}th{font-size:10px;font-weight:700;border-bottom:1px solid #000;padding:2px 0}
td{padding:3px 0;vertical-align:top;border-bottom:1px dotted #bbb}.nm{font-weight:700}.u{font-weight:400;font-size:9.5px;color:#333}
.c{text-align:center;width:13%}.l{text-align:left;width:24%;white-space:nowrap}
.row{display:flex;justify-content:space-between;margin:2px 0}
.box{border:1.5px solid #000;border-radius:4px;padding:4px 6px;margin-top:6px}
.total{font-size:${narrow ? 14 : 16}px;font-weight:900;border-top:1.5px solid #000;padding-top:3px;margin-top:3px}
.qr{display:block;margin:8px auto 2px;width:${narrow ? 110 : 130}px;height:${narrow ? 110 : 130}px}
.ref{border:1px dashed #000;padding:4px;margin-top:6px;font-size:10.5px}
@page{margin:0;size:${width} auto}
</style></head><body>
<header class="center">${logo}<div class="name">${esc(seller.name || 'فلسي')}</div>
${seller.address ? `<div class="sm muted">${esc(seller.address)}</div>` : ''}
${seller.phone ? `<div class="sm muted" dir="ltr">${esc(seller.phone)}</div>` : ''}
${seller.vat_number ? `<div class="sm">الرقم الضريبي <b dir="ltr">${esc(seller.vat_number)}</b></div>` : ''}</header>
<div class="title"><b>${title[0]}</b><span>${title[1]}</span></div>
<dl class="meta">
<dt>${isCN ? 'رقم الإشعار' : isProforma ? 'الطلب' : 'رقم الفاتورة'}</dt><dd dir="ltr" class="b">${esc(number)}</dd>
<dt>التاريخ</dt><dd dir="ltr">${format(issued, 'yyyy-MM-dd  HH:mm')}</dd>
${order.order_type && !isCN ? `<dt>النوع</dt><dd>${esc(TYPES[order.order_type] || order.order_type)}</dd>` : ''}
${order.cashier_name ? `<dt>الكاشير</dt><dd>${esc(order.cashier_name)}</dd>` : ''}
${order.customer_name && !isB2B ? `<dt>العميل</dt><dd>${esc(order.customer_name)}</dd>` : ''}
</dl>
${buyerHtml}
${isCN ? `<div class="ref">مرتجع من الفاتورة: <b dir="ltr">${esc(order.original_number || '')}</b><br/>السبب: ${esc(order.reason || '')}</div>` : ''}
<div class="sep"></div>
<table><thead><tr><th style="text-align:right">الصنف</th><th class="c">كمية</th><th class="l">المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
<div class="row sm muted" style="margin-top:3px"><span>عدد الأصناف</span><span>${count}</span></div>
<div class="box">
${Number(order.discount_amount) > 0 ? `<div class="row"><span>المجموع قبل الخصم (غير شامل)</span><span>${n2(order.lines_net ?? (Number(order.subtotal) + Number(order.discount_net || 0)))}</span></div>
<div class="row"><span>الخصم (غير شامل الضريبة)</span><span>-${n2(order.discount_net ?? order.discount_amount)}</span></div>` : ''}
<div class="row"><span>الإجمالي غير شامل الضريبة</span><span>${n2(order.subtotal)}</span></div>
${exemptRows}
<div class="row"><span>ضريبة القيمة المضافة${allStd ? ' 15%' : ''}</span><span>${n2(order.tax_amount)}</span></div>
${Number(order.rounding_amount || order.rounding) ? `<div class="row sm"><span>تقريب</span><span>${n2(order.rounding_amount ?? order.rounding)}</span></div>` : ''}
<div class="row total"><span>${isCN ? 'المبلغ المسترد' : 'الإجمالي شامل الضريبة'}</span><span>${n2(order.total)} ⃁</span></div>
</div>
${order.payment_method && !isCN ? `<div class="row" style="margin-top:4px"><span>طريقة الدفع</span><span class="b">${esc(PAY[order.payment_method] || order.payment_method)}</span></div>` : ''}
${Number(order.amount_paid) > 0 ? `<div class="row"><span>المدفوع</span><span>${n2(order.amount_paid)}</span></div><div class="row"><span>الباقي</span><span>${n2(order.change_due)}</span></div>` : ''}
${qr ? `<img class="qr" src="${qr}" alt="QR"/>` : ''}
<div class="center b" style="margin-top:4px">${isCN ? 'تم الإرجاع' : 'شكراً لزيارتكم'}</div>
${order.zatca_qr ? '<div class="center sm muted">فاتورة إلكترونية مرسلة لهيئة الزكاة والضريبة والجمارك</div>' : ''}
<div class="center sm muted" style="margin-top:2px">Felsy.org</div>
<div style="height:10mm"></div>
</body></html>`;
}

/** بيانات البائع للفاتورة (اسم المنشأة والرقم الضريبي) من الفرع النشط أو الإعدادات */
export async function loadSeller(supabase) {
  const { data } = await supabase.from('app_settings').select('business_name, vat_number, address, phone, logo_url').limit(1).maybeSingle();
  let br = {};
  try { br = JSON.parse(localStorage.getItem('activeBranch') || '{}'); } catch { /* */ }
  return {
    name: br.zatca_seller_name || data?.business_name || br.name_ar || br.name,
    vat_number: br.zatca_vat_number || br.vat_number || data?.vat_number,
    address: br.address || data?.address, phone: br.phone || data?.phone, logo_url: br.logo_url || data?.logo_url,
  };
}

export async function printReceipt(order, seller) {
  const settings = { ...DEFAULT_PRINTER, ...getPrinterSettings() };
  const html = await buildReceiptHTML(order, seller);
  await printHTML(html, { copies: settings.copies || 1 });
}
