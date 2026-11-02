ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS zatca_tax_category_code char(1) NOT NULL DEFAULT 'S'
    CHECK (zatca_tax_category_code IN ('S','Z','E','O'));

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_invoice_counter text,
  ADD CONSTRAINT purchase_invoice_counter_digits CHECK (supplier_invoice_counter IS NULL OR supplier_invoice_counter ~ '^[0-9]+$');

UPDATE public.purchase_invoice_items
SET zatca_tax_category_code = CASE tax_category
  WHEN 'standard' THEN 'S' WHEN 'zero_rated' THEN 'Z'
  WHEN 'exempt' THEN 'E' WHEN 'out_of_scope' THEN 'O' ELSE 'S' END;

DO $migration$
DECLARE
  v_definition text;
  v_old_columns text := 'tax_rate,tax_category,
      exemption_reason_code';
  v_new_columns text := 'tax_rate,tax_category,zatca_tax_category_code,
      exemption_reason_code';
  v_old_values text := 'v_factor,v_base_qty,v_unit_cost,v_base_cost,v_tax_rate,v_category,
      v_reason_code';
  v_new_values text := 'v_factor,v_base_qty,v_unit_cost,v_base_cost,v_tax_rate,v_category,
      CASE v_category WHEN ''standard'' THEN ''S'' WHEN ''zero_rated'' THEN ''Z'' WHEN ''exempt'' THEN ''E'' WHEN ''out_of_scope'' THEN ''O'' END,
      v_reason_code';
BEGIN
  SELECT pg_get_functiondef('public.create_purchase_receipt(uuid,uuid,uuid,text,text,text,date,numeric,text,jsonb)'::regprocedure)
    INTO v_definition;
  IF position(v_old_columns in v_definition)=0 OR position(v_old_values in v_definition)=0 THEN
    RAISE EXCEPTION 'Could not¶»§q«^