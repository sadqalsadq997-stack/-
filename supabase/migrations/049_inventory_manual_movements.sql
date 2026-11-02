-- 049: Make raw ingredients first-class inventory items and record manual stock movements.
CREATE OR REPLACE FUNCTION public.enforce_ingredient_product_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_ingredient, false) THEN
    NEW.track_inventory := true;
    NEW.show_in_menu := false;
    NEW.show_in_store := false;
  END IF;

  IF TG_OP = 'UPDATE'
     AND EXISTS (
       SELECT 1
       FROM public.product_recipe_items ri
       JOIN public.product_recipes r ON r.id = ri.recipe_id AND r.is_active
       WHERE ri.ingredient_product_id = OLD.id
     )
     AND (
       NOT coalesce(NEW.is_ingredient, false)
       OR NOT coalesce(NEW.track_inventory, false)
       OR NOT coalesce(NEW.is_active, true)
     ) THEN
    RAISE EXCEPTION 'لا يمكن تعطيل مادة خام مرتبطة بوصفات نشطة؛ عدّل الوصفات أولاً';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ingredient_product_rules ON public.products;
CREATE TRIGGER trg_enforce_ingredient_product_rules
BEFORE INSERT OR UPDATE OF is_ingredient, track_inventory, is_active, show_in_menu, show_in_store
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_ingredient_product_rules();

CREATE INDEX IF NOT EXISTS product_recipe_items_ingredient_idx
  ON public.product_recipe_items(tenant_id, ingredient_product_id);

CREATE OR REPLACE FUNCTION public.felsy_stock_move(
  p_tenant UUID, p_branch UUID, p_product UUID, p_delta NUMERIC,
  p_type TEXT, p_reason TEXT, p_ref UUID, p_cost NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr RECORD;
BEGIN
  SELECT id, name_ar, name, stock_quantity, track_inventory
  INTO pr
  FROM public.products
  WHERE id = p_product AND tenant_id = p_tenant
  FOR UPDATE;
  IF pr.id IS NULL OR NOT coalesce(pr.track_inventory, false) OR p_delta = 0 THEN RETURN; END IF;

  UPDATE public.products
  SET stock_quantity = coalesce(stock_quantity, 0) + p_delta
  WHERE id = pr.id;

  INSERT INTO public.inventory_logs (
    tenant_id, branch_id, product_id, product_name, type,
    quantity_change, previous_stock, new_stock, reason,
    wastage_reason, reference_id, unit_cost
  ) VALUES (
    p_tenant, p_branch, pr.id, coalesce(pr.name_ar, pr.name), p_type,
    p_delta, coalesce(pr.stock_quantity, 0),
    coalesce(pr.stock_quantity, 0) + p_delta,
    left(nullif(trim(p_reason), ''), 500),
    CASE WHEN p_type = 'wastage' THEN left(nullif(trim(p_reason), ''), 300) ELSE NULL END,
    p_ref::TEXT, p_cost
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_manual_move(
  p_product UUID,
  p_delta NUMERIC,
  p_type TEXT,
  p_reason TEXT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_branch UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_stock NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 1000000 THEN RAISE EXCEPTION 'الكمية غير صالحة'; END IF;
  IF p_type NOT IN ('restock','consumption','wastage','adjustment') THEN RAISE EXCEPTION 'نوع الحركة غير صالح'; END IF;
  IF (p_type = 'restock' AND p_delta <= 0) OR (p_type <> 'restock' AND p_delta >= 0) THEN
    RAISE EXCEPTION 'إشارة الكمية لا تتوافق مع نوع الحركة';
  END IF;

  SELECT tenant_id INTO v_tenant
  FROM public.products
  WHERE id = p_product AND tenant_id IN (SELECT public.current_paid_tenant_ids())
  FOR UPDATE;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود أو لا تملك صلاحية الوصول'; END IF;

  IF p_branch IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id = p_branch AND b.tenant_id = v_tenant
  ) THEN RAISE EXCEPTION 'الفرع غير تابع للمنشأة'; END IF;

  UPDATE public.products SET track_inventory = true WHERE id = p_product;
  PERFORM public.felsy_stock_move(
    v_tenant, p_branch, p_product, p_delta, p_type,
    left(coalesce(nullif(trim(p_reason), ''),
      CASE p_type WHEN 'restock' THEN 'توريد يدوي' WHEN 'wastage' THEN 'هدر وتالف'
      WHEN 'consumption' THEN 'استهلاك يدوي' ELSE 'تسوية مخزون' END), 500),
    NULL, p_unit_cost
  );
  SELECT stock_quantity INTO v_stock FROM public.products WHERE id = p_product;
  RETURN jsonb_build_object('stock', v_stock, 'movement_type', p_type);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_manual_move(UUID,NUMERIC,TEXT,TEXT,NUMERIC,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_manual_move(UUID,NUMERIC,TEXT,TEXT,NUMERIC,UUID) TO authenticated;

INSERT INTO public.migration_status (migration, note)
VALUES ('049_inventory_manual_movements', 'Adds controlled restock, consumption, wastage and adjustment movements with audit logs; enforces raw ingredient tracking.')
ON CONFLICT (migration) DO NOTHING;