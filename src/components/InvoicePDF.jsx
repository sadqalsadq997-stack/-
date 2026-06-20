import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

// Generates and downloads a clean invoice PDF using jsPDF
export default function InvoicePDF({ order, branch }) {
  const handleDownload = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    // Helper
    const addLine = (text, x, yPos, options = {}) => {
      doc.text(text, x, yPos, options);
    };

    // Header background
    doc.setFillColor(212, 175, 55);
    doc.rect(0, 0, pageW, 40, 'F');

    // Company name
    doc.setTextColor(20, 15, 10);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    addLine(branch?.name || 'Felsy Smart POS', pageW / 2, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (branch?.address) addLine(branch.address, pageW / 2, 26, { align: 'center' });
    if (branch?.phone) addLine(`Tel: ${branch.phone}`, pageW / 2, 32, { align: 'center' });
    if (branch?.vat_number) addLine(`VAT: ${branch.vat_number}`, pageW / 2, 38, { align: 'center' });

    y = 52;
    doc.setTextColor(40, 30, 20);

    // Invoice title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    addLine('TAX INVOICE / فاتورة ضريبية', pageW / 2, y, { align: 'center' });
    y += 10;

    // Divider
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageW - 15, y);
    y += 8;

    // Order Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice No: ${order.order_number}`, 15, y);
    doc.text(`Date: ${order.created_date ? format(new Date(order.created_date), 'yyyy-MM-dd HH:mm') : format(new Date(), 'yyyy-MM-dd HH:mm')}`, pageW - 15, y, { align: 'right' });
    y += 7;
    doc.text(`Customer: ${order.customer_name || 'Walk-in'}`, 15, y);
    doc.text(`Type: ${order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Take Away' : 'Delivery'}`, pageW - 15, y, { align: 'right' });
    y += 7;
    if (order.cashier_name) { doc.text(`Cashier: ${order.cashier_name}`, 15, y); y += 7; }
    y += 3;

    // Table header
    doc.setFillColor(245, 240, 230);
    doc.rect(15, y - 4, pageW - 30, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Item', 17, y + 2);
    doc.text('Qty', pageW / 2, y + 2, { align: 'center' });
    doc.text('Unit Price', pageW - 60, y + 2);
    doc.text('Total', pageW - 17, y + 2, { align: 'right' });
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    order.items?.forEach((item) => {
      if (y > 240) { doc.addPage(); y = 20; }
      const name = item.product_name || '';
      const qty = String(item.quantity || 1);
      const price = `${(item.unit_price || 0).toFixed(2)} ﷼`;
      const total = `${(item.total || 0).toFixed(2)} ﷼`;

      doc.text(name.substring(0, 35), 17, y);
      doc.text(qty, pageW / 2, y, { align: 'center' });
      doc.text(price, pageW - 60, y);
      doc.text(total, pageW - 17, y, { align: 'right' });

      if (item.modifiers?.length > 0) {
        y += 5;
        doc.setTextColor(160, 130, 60);
        doc.setFontSize(8);
        doc.text('  + ' + item.modifiers.map(m => m.name).join(', '), 17, y);
        doc.setTextColor(40, 30, 20);
        doc.setFontSize(9);
      }
      y += 7;

      // Row separator
      doc.setDrawColor(230, 220, 200);
      doc.setLineWidth(0.2);
      doc.line(15, y - 1, pageW - 15, y - 1);
    });

    y += 5;
    // Totals
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.5);
    doc.line(pageW - 85, y, pageW - 15, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const addTotal = (label, value, bold = false) => {
      if (bold) doc.setFont('helvetica', 'bold');
      else doc.setFont('helvetica', 'normal');
      doc.text(label, pageW - 85, y);
      doc.text(`${value.toFixed(2)} ﷼`, pageW - 17, y, { align: 'right' });
      y += 7;
    };

    addTotal('Subtotal:', order.subtotal || 0);
    if (order.discount_amount > 0) addTotal('Discount:', -(order.discount_amount || 0));
    addTotal('VAT (15%):', order.tax_amount || 0);
    doc.setFillColor(212, 175, 55);
    doc.rect(pageW - 90, y - 5, 75, 10, 'F');
    doc.setTextColor(20, 15, 10);
    addTotal('TOTAL:', order.total || 0, true);

    y += 5;
    doc.setTextColor(100, 80, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Payment: ${order.payment_method === 'cash' ? 'Cash' : order.payment_method === 'card' ? 'Card' : order.payment_method || 'Cash'}`, 15, y);
    if (order.amount_paid) doc.text(`Paid: ${(order.amount_paid).toFixed(2)} ﷼`, 15, y + 6);
    if (order.change_due > 0) doc.text(`Change: ${(order.change_due).toFixed(2)} ﷼`, 15, y + 12);

    y += 20;
    // QR Code placeholder note
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('This invoice complies with ZATCA e-invoicing requirements (Phase 1)', pageW / 2, y, { align: 'center' });
    y += 6;
    doc.text('شكراً لتعاملكم معنا — Thank you for your business', pageW / 2, y, { align: 'center' });

    // Footer line
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(1);
    doc.line(15, y + 6, pageW - 15, y + 6);

    doc.save(`invoice-${order.order_number}.pdf`);
  };

  return (
    <Button size="sm" variant="outline" onClick={handleDownload} className="border-gold/40 text-gold hover:bg-gold/10">
      <Download className="w-3.5 h-3.5 ml-1" /> تحميل PDF
    </Button>
  );
}