-- Preserve incoming supplier tax invoice evidence and review input VAT before deduction.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_address text,
  ADD COLUMN IF NOT EXISTS supplier_cr_number text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_type text NOT NULL DEFAULT 'tax'
    CHECK (supplier_invoice_type IN ('tax','simplified')),
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS buyer_vat_number text,
  ADD COLUMN IF NOT EXISTS invoice_currency text NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS supply_date date,
  ADD COLUMN IF NOT EXISTS supplier_invoice_uuid text,
  ADD COLUMN IF NOT EXISTS zatca_qr text,
  ADD COLUMN IF NOT EXISTS xml_attachment_path text,
  ADD COLUMN IF NOT EXISTS tax_review_status text NOT NULL DEFAULT 'pending'
    CHECK (tax_review_status IN ('pending','eligible','not_eligible','not_applicable')),
  ADD COLUMN IF NOT EXISTS tax_review_notes text;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'standard'
    CHECK (tax_category IN ('standard','zero_rated','exempt','out_of_scope')),
  ADD COLUMN IF NOT EXISTS exemption_reason_code text,
  ADD COLUMN IF NOT EXISTS exemption_reason text;

-- Historical VAT entries remain pending review; do not silently claim input VAT.
UPDATE public.purchase_invoices
SET tax_review_status = CASE WHEN coalesce(vat_amount,0) > 0 THEN 'pending' ELSE 'not_applicable' END,
    deductible = CASE WHEN coalesce(vat¶»§q«^