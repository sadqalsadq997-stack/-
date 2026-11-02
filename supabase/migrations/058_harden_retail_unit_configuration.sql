-- 058: Harden retail unit and PLU configuration.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_conversions_array_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_conversions_array_check
  CHECK (CASE WHEN jsonb_typeof(unit_conversions)='array' THEN jsonb_array_length(unit_conversions)<=20 ELSE false END);

CREATE UNIQUE INDEX IF NOT EXISTS products_scale_plu_unique
  ON public.products(tenant_id,scale_prefix,scale_plu)
  WHERE sale_behavior='scale_barcode' AND is_active=true;

CREATE OR REPLACE FUNCTION public.validate_retail_product_configuration()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
DECLARE v_unit JSONB; v_seen TEXT[]:=ARRAY[]::TEXT[]; v_name TEXT; v_factor NUMERIC; v_price NUMERIC;
BEGIN
  IF NEW.sale_behavior='scale_barcode' THEN
    NEW.track_inventory:=true;
    IF nullif(trim(coalesce(NEW.scale_plu,'')),'') IS NULL OR length(trim(NEW.scale_plu))>5 OR trim(NEW.scale_plu)!~'^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'أدخل PLU رقمياً من 1 إلى 5 خانات لمنتج الميزان';
    END IF;
    IF coalesce(NEW.unit_type,'kg') NOT IN ('kg','g') THEN RAISE EXCEPTION 'منتج الميزان يجب أن تكون وحدة مخزونه كيلو أو جرام'; END IF;
  END IF;
  IF NEW.sale_behavior='manual_weight' THEN
    NEW.track_inventory:=true;
    IF coalesce(NEW.unit_type,'kg') NOT IN ('kg','g','liter','ml') THEN RAISE EXCEPTION 'البيع الوزني اليدوي يتطلب وحدة وزن أو حجم'; END IF;
  END IF;
  IF NEW.sale_behavior='multi_unit' THEN
    NEW.track_inventory:=true;
    IF jsonb_array_length(NEW.unit_conversions)=0 THEN RAISE EXCEPTION 'أضف وحدة بيع واحدة على الأقل مع معامل التحويل'; END IF;
  END IF;
  FOR v_unit IN SELECT value FROM jsonb_array_elements(NEW.unit_conversions) LOOP
    v_name:=nullif(trim(v_unit->>'name'),''); v_factor:=nullif(v_unit->>'factor_to_base','')::NUMERIC; v_price:=nullif(v_unit->>'price','')::NUMERIC;
    IF v_name IS NULL OR length(v_name)>40 OR v_factor IS NULL OR v_factor<=0 OR v_factor>1000000 OR v_price IS NULL OR v_price<=0 OR v_price>100000000 THEN
      RAISE EXCEPTION 'تحقق من اسم الوحدة ومعامل التحويل وسعر البيع (يجب أن يكون أكبر من صفر)';
    END IF;
    IF v_name=ANY(v_seen) THEN RAISE EXCEPTION 'اسم وحدة البيع مكرر'; END IF;
    v_seen:=array_append(v_seen,v_name);
  END LOOP;
  RETURN NEW;
END;
$function$;

INSERT INTO public.migration_status(migration,note)
VALUES('058_harden_retail_unit_configuration','Validates multi-unit prices and conversions, prevents duplicate scale PLUs per tenant, and hardens JSON array validation.')
ON CONFLICT(migration) DO NOTHING;