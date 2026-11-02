ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS buyer_address text;

-- A zero-rated/exempt/out-of-scope line needs both its legal reason and ZATCA reason code.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'IF v_category<>''standard'' AND v_reason IS NULL THEN RAISE EXCEPTION ''سبب الإعفاء أو نسبة الصفر مطلوب لكل سطر غير خاضع للنسبة الأساسية''; END IF;';
  v_new text := 'IF v_category<>''standard'' AND (v_reason IS NULL OR v_reason_code IS NULL) THEN RAISE EXCEPTION ''سبب ورمز الإعفاء أو نسبة الصفر مطلوبان لكل سطر غير خاضع للنسبة الأساسية''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.create_purchase_receipt(uuid,uuid,uuid,text,text,text,date,numeric,text,jsonb)'::regprocedure)
    INTO v_definition;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Could not locate expected tax reason validation in create_purchase_receipt';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$migration$;
