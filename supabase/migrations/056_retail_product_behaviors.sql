-- 056: Retail product behaviors, scale barcode configuration and unit conversions.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_behavior TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS scale_plu TEXT,
  ADD COLUMN IF NOT EXISTS scale_prefix TEXT NOT NULL DEFAULT '20',
  ADD COLUMN IF NOT EXISTS scale_value_type TEXT NOT NULL DEFAULT 'price',
  ADD COLUMN IF NOT EXISTS scale_value_divisor NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS unit_conversions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allow_manual_weight BOOLEAN NOT NULL DEFAULT false;

DO $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_sale_behavior_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sale_behavior_check
      CHECK (sale_behavior IN ('standard','scale_barcode','manual_weight','multi_unit'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_scale_value_type_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_scale_value_type_check
      CHECK (scale_value_type IN ('price','weight'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_scale_prefix_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_scale_prefix_check
      CHECK (scale_prefix ~ '^[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_scale_divisor_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_scale_divisor_check
      CHECK (scale_value_divisor > 0 AND scale_value_divisor <= 1000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_unit_conversions_array_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_unit_conversions_array_check
      CHECK (jsonb_typeof(unit_conversions)='array' AND jsonb_array_length(unit_conversions)<=20);
  END IF;
END;
$function$;

CREATE INDEX IF NOT EXISTS products_scale_plu_idx
  ON public.products(tenant_id, scale_prefix, scale_plu)
  WHERE sale_behavior='scale_barcode' AND is_active=true;

CREATE OR REPLACE FUNCTION public.validate_retail_product_configuration()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
DECLARE v_unit JSONB; v_seen TEXT[] := ARRAY[]::TEXT[]; v_name TEXT; v_factor NUMERIC;
BEGIN
  IF NEW.sale_behavior='scale_barcode' THEN
    NEW.track_inventory := true;
    IF nullif(trim(coalesce(NEW.scale_plu,'')),'') IS NULL
       OR length(trim(NEW.scale_plu)) > 5 OR trim(NEW.scale_plu) !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'أدخل PLU رقمياً من 1 إلى 5 خانات لمنتج الميزان';
    END IF;
    IF coalesce(NEW.unit_type,'kg') NOT IN ('kg','g') THEN
      RAISE EXCEPTION 'منتج الميزان يجب أن تكون وحدة مخزونه كيلو أو جرام';
    END IF;
  END IF;
  IF NEW.sale_behavior='manual_weight' THEN
    NEW.track_inventory := true;
    IF coalesce(NEW.unit_type,'kg') NOT IN ('kg','g','liter','ml') THEN
      RAISE EXCEPTION 'البيع الوزني اليدوي يتطلب وحدة وزن أو حجم';
    END IF;
  END IF;
  IF NEW.sale_behavior='multi_unit' THEN
    IF jsonb_array_length(NEW.unit_conversions)=0 THEN RAISE EXCEPTION 'أضف وحدة بيع واحدة على الأقل مع معامل التحويل'; END IF;
    FOR v_unit IN SELECT value FROM jsonb_array_elements(NEW.unit_conversions) LOOP
      v_name := nullif(trim(v_unit->>'name'),''); v_factor := nullif(v_unit->>'factor_to_base','')::NUMERIC;
      IF v_name IS NULL OR length(v_name)>40 OR v_factor IS NULL OR v_factor<=0 OR v_factor>1000000 THEN
        RAISE EXCEPTION 'بيانات وحدة البيع أو معامل التحويل غير صحيحة';
      END IF;
      IF v_name = ANY(v_seen) THEN RAISE EXCEPTION 'اسم وحدة البيع مكرر'; END IF;
      v_seen := array_append(v_seen,v_name);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_retail_product_configuration ON public.products;
CREATE TRIGGER trg_validate_retail_product_configuration
BEFORE INSERT OR UPDATE OF sale_behavior, scale_plu, scale_prefix, scale_value_type,
  scale_value_divisor, unit_type, unit_conversions ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_retail_product_configuration();

INSERT INTO public.migration_status(migration,note)
VALUES('056_retail_product_behaviors','Adds standard, scale barcode, manual weight and multi-unit product configuration for retail POS.')
ON CONFLICT(migration) DO NOTHING;