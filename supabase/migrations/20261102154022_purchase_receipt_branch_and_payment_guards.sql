-- Harden the transactional receipt against cross-branch warehouses and negative payments.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'IF NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse AND w.tenant_id=v_tenant AND w.is_active) THEN RAISE EXCEPTION ''المستودع غير صحيح''; END IF;';
  v_new text := 'IF coalesce(p_paid_amount,0)<0 THEN RAISE EXCEPTION ''المبلغ المدفوع لا يمكن أن يكون سالباً''; END IF; IF NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse AND w.tenant_id=v_tenant AND (w.branch_id=p_branch OR w.branch_id IS NULL) AND w.is_active) THEN RAISE EXCEPTION ''المستودع غير تابع للفرع المختار''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.create_purchase_receipt(uuid,uuid,uuid,text,text,text,date,numeric,text,jsonb)'::regprocedure)
    INTO v_definition;
  IF position(v_old in v_definition)=0 THEN
    RAISE EXCEPTION 'Could not locate expected warehouse validation in create_purchase_receipt';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$migration$;
