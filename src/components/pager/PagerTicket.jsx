import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { printHTML, printFonts } from '@/lib/print';
import { Printer, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { getPrinterSettings, DEFAULT_PRINTER } from '@/lib/printerSettings';

export function pagerUrl(token) {
  return `${window.location.origin}/p/${token}`;
}

export function usePagerQR(token, size = 320) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!token) return;
    QRCode.toDataURL(pagerUrl(token), { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then(setSrc).catch(() => setSrc(''));
  }, [token, size]);
  return src;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** طباعة تذكرة البيجر على الطابعة الحرارية */
export async function printPagerTicket(pager, businessName = '') {
  const settings = { ...DEFAULT_PRINTER, ...getPrinterSettings() };
  const width = settings.paperWidth || '80mm';
  const qr = await QRCode.toDataURL(pagerUrl(pager.token), { width: 360, margin: 1 });
  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><title>بيجر ${esc(pager.display_number)}</title>
<style>
${printFonts()}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Cairo,Arial,sans-serif;width:${width};padding:8px;text-align:center;color:#000}
.n{font-size:56px;font-weight:900;line-height:1;margin:6px 0}
.s{font-size:12px}.b{font-weight:700}
img{width:70%;margin:8px auto;display:block}
.sep{border-top:1px dashed #000;margin:6px 0}
@media print{@page{margin:0;size:${width} auto}}
</style></head><body>
<p class="b">${esc(businessName)}</p>
<div class="sep"></div>
<p class="s">رقم طلبك</p>
<p class="n">${esc(pager.display_number)}</p>

<img src="${qr}" alt="QR"/>
<p class="b">امسح الباركود بكاميرا الجوال</p>
<p class="s">ونبلغك بنغمة وإشعار أول ما يجهز طلبك</p>
<div class="sep"></div>
<p class="s">بيجر إلكتروني — فلسي</p>
</body></html>`;
  await printHTML(html, { copies: 1 });
}

/** بطاقة تعرض QR كبير للعميل يمسحه من الشاشة مباشرة + طباعة */
export function PagerTicketDialog({ pager, businessName, onClose }) {
  const qr = usePagerQR(pager?.token, 360);
  if (!pager) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute left-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        <p className="text-sm text-slate-500">بيجر الطلب</p>
        <p className="text-6xl font-black leading-tight">{pager.display_number}</p>
        <div className="mx-auto my-4 flex h-64 w-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2">
          {qr ? <img src={qr} alt="باركود البيجر" className="h-full w-full" /> : <span className="text-sm text-slate-400">جارٍ التوليد...</span>}
        </div>
        <p className="text-sm text-slate-600">خلّ العميل يمسح الباركود بكاميرا جواله</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => printPagerTicket(pager, businessName)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#d92d20] font-bold text-white hover:bg-[#b42318]">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(pagerUrl(pager.token)); toast.success('تم نسخ الرابط'); }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">
            <Copy className="h-4 w-4" /> نسخ الرابط
          </button>
        </div>
      </div>
    </div>
  );
}
