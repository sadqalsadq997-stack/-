-- Ensure legacy invoices with VAT are never treated as deductible until reviewed.
UPDATE public.purchase_invoices
SET deductible = false,
    tax_review_status = 'pending',
    non_deductible_reason = 'بانتظار مراجعة الفاتورة الضريبية الأصلية قبل خصم ضريبة المدخلات',
    tax_review_notes = coalesce(tax_review_notes, 'يرجى التحقق من المستند الأصلي وبيانات المورد قبل اعتماد ضريبة المدخلات.')
WHERE coalesce(vat_amount, 0) > 0;
