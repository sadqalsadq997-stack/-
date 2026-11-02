ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_street text,
  ADD COLUMN IF NOT EXISTS supplier_building_number text,
  ADD COLUMN IF NOT EXISTS supplier_district text,
  ADD COLUMN IF NOT EXISTS supplier_city text,
  ADD COLUMN IF NOT EXISTS supplier_postal_code text,
  ADD COLUMN IF NOT EXISTS supplier_country text NOT NULL DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS buyer_street text,
  ADD COLUMN IF NOT EXISTS buyer_building_number text,
  ADD COLUMN IF NOT EXISTS buyer_district text,
  ADD COLUMN IF NOT EXISTS buyer_city text,
  ADD COLUMN IF NOT EXISTS buyer_postal_code text,
  ADD COLUMN IF NOT EXISTS buyer_country text NOT NULL DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS buyer_id_scheme text,
  ADD COLUMN IF NOT EXISTS buyer_id_number text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_issue_time text;

ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT purchase_supplier_building_format CHECK (supplier_building_number IS NULL OR supplier_building_number ~ '^[0-9]{4}$'),
  ADD CONSTRAINT purchase_supplier_postal_format CHECK (supplier_postal_code IS NULL OR supplier_postal_code ~ '^[0-9]{5}$'),
  ADD CONSTRAINT purchase_buyer_building_format CHECK (buyer_building_number IS NULL OR buyer_building_number ~ '^[0-9]{4}$'),
  ADD CONSTRAINT purchase_buyer_postal_format CHECK (buyer_postal_code IS NULL OR buyer_postal_code ~ '^[0-9]{5}$');

DO $migration$
DECLARE
  v_definition text;
  v_old text := 'IF v_supplier_vat IS NOT NULL AND v_supplier_vat !~ ''¶»§q«^