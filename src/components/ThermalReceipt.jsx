import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { printReceipt } from '@/lib/receipt';

// زر طباعة فاتورة طلب (يُستخدم في الطلبات/الفواتير)
export default function ThermalReceipt({ order, branch, seller, label = 'طباعة', size = 'sm' }) {
  const [busy, setBusy] = useState(false);
  const s = seller || {
    name: branch?.zatca_seller_name || branch?.name_ar || branch?.name,
    vat_number: branch?.zatca_vat_number || branch?.vat_number,
    address: branch?.address, phone: branch?.phone, logo_url: branch?.logo_url,
  };
  async function go() { setBusy(true); try { await printReceipt(order, s); } finally { setBusy(false); } }
  return (
    <Button size={size} variant="outline" onClick={go} disabled={busy} className="border-primary/40 text-primary hover:bg-primary/10">
      {busy ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 ml-1" />} {label}
    </Button>
  );
}
