-- 048: Ingredient products, recipe definitions, and recipe-aware stock/COGS posting.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_ingredient BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.product_recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.product_recipes(id) ON DELETE CASCADE,
  ingredient_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_per_sale NUMERIC NOT NULL CHECK (quantity_per_sale > 0 AND quantity_per_sale <= 100000),
  unit TEXT NOT NULL,
  waste_percent NUMERIC NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, ingredient_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_tenant_product ON public.product_recipes(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_recipe ON public.product_recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_ingredient ON public.product_recipe_items(tenant_id, ingredient_product_id);

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_recipes_read ON public.product_recipes;
CREATE POLICY product_recipes_read ON public.product_recipes
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS product_recipe_items_read ON public.product_recipe_items;
CREATE POLICY product_recipe_items_read ON public.product_recipe_items
FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.current_tenant_ids()));

REVOKE ALL ON public.product_recipes, public.product_recipe_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_recipes, public.product_recipe_items TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_ingredient_product_flags()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_ingredient THEN
    IF EXISTS (SELECT 1 FROM public.product_recipes WHERE product_id = NEW.id) THEN
      RAISE EXCEPTION 'لا يمكن تحويل منتج له وصفة إلى مادة خام';
    END IF;
    NEW.track_inventory := true;
    NEW.show_in_menu := false;
    NEW.show_in_store := false;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_ingredient AND NOT NEW.is_ingredient
     AND EXISTS (SELECT 1 FROM public.product_recipe_items WHERE ingredient_product_id = OLD.id) THEN
    RAISE EXCEPTION 'لا يمكن تحويل مادة خام مستخدمة في وصفات إلى منتج بيع';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ingredient_product_flags ON public.products;
CREATE TRIGGER trg_enforce_ingredient_product_flags
BEFORE INSERT OR UPDATE OF is_ingredient, track_inventory, show_in_menu, show_in_store
ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_ingredient_product_flags();

CREATE OR REPLACE FUNCTION public.save_product_recipe(p_product_id UUID, p_items JSONB, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID; v_recipe_id UUID; v_item JSONB; v_ingredient RECORD;
  v_quantity NUMERIC; v_waste NUMERIC; v_unit TEXT; v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'قائمة مقادير الوصفة غير صالحة';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.products
  WHERE id = p_product_id AND tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND NOT coalesce(is_ingredient, false);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود أو لا تملك صلاحية تعديله'; END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    DELETE FROM public.product_recipes WHERE tenant_id = v_tenant AND product_id = p_product_id;
    RETURN jsonb_build_object('deleted', true, 'items', 0);
  END IF;

  INSERT INTO public.product_recipes(tenant_id, product_id, notes, is_active)
  VALUES (v_tenant, p_product_id, left(nullif(trim(p_notes), ''), 1000), true)
  ON CONFLICT (tenant_id, product_id)
  DO UPDATE SET notes = EXCLUDED.notes, is_active = true, updated_at = now()
  RETURNING id INTO v_recipe_id;
  DELETE FROM public.product_recipe_items WHERE recipe_id = v_recipe_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := coalesce((v_item->>'quantity_per_sale')::NUMERIC, 0);
    v_waste := coalesce((v_item->>'waste_percent')::NUMERIC, 0);
    IF v_quantity <= 0 OR v_quantity > 100000 OR v_waste < 0 OR v_waste > 100 THEN
      RAISE EXCEPTION 'تحقق من كمية المكوّن ونسبة الهدر';
    END IF;
    SELECT id, unit_type INTO v_ingredient FROM public.products
    WHERE id = (v_item->>'ingredient_product_id')::UUID
      AND tenant_id = v_tenant AND is_ingredient = true AND track_inventory = true AND is_active = true;
    IF v_ingredient.id IS NULL THEN RAISE EXCEPTION 'كل مكوّن يجب أن يكون مادة خام نشطة ومربوطة بالمخزون'; END IF;
    v_unit := coalesce(nullif(trim(v_item->>'unit'), ''), v_ingredient.unit_type, 'piece');
    IF v_unit <> coalesce(v_ingredient.unit_type, 'piece') THEN
      RAISE EXCEPTION 'وحدة المكوّن يجب أن تطابق وحدة مخزونه';
    END IF;
    INSERT INTO public.product_recipe_items(tenant_id, recipe_id, ingredient_product_id, quantity_per_sale, unit, waste_percent)
    VALUES (v_tenant, v_recipe_id, v_ingredient.id, v_quantity, v_unit, v_waste);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('recipe_id', v_recipe_id, 'items', v_count, 'saved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_recipe(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_recipe(UUID, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.felsy_items_cost(p_tenant UUID, p_items JSONB)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(
    coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1)
    * CASE
        WHEN r.id IS NOT NULL THEN coalesce(rc.recipe_cost, 0)
        WHEN coalesce(pr.track_inventory, false) THEN coalesce(pr.cost_price, 0)
        ELSE 0
      END
  ), 0)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::JSONB)) e
  JOIN public.products pr ON pr.tenant_id = p_tenant
   AND (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND pr.id = (e->>'product_id')::UUID
  LEFT JOIN public.product_recipes r ON r.tenant_id = p_tenant AND r.product_id = pr.id AND r.is_active
  LEFT JOIN LATERAL (
    SELECT sum(ri.quantity_per_sale * (1 + ri.waste_percent / 100) * coalesce(ingredient.cost_price, 0)) AS recipe_cost
    FROM public.product_recipe_items ri
    JOIN public.products ingredient ON ingredient.id = ri.ingredient_product_id AND ingredient.tenant_id = p_tenant
    WHERE ri.recipe_id = r.id AND ri.tenant_id = p_tenant
  ) rc ON true;
$$;

CREATE OR REPLACE FUNCTION public.orders_after_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay TEXT; e JSONB; v_cost NUMERIC; v_qty NUMERIC; v_product UUID;
  v_product_name TEXT; v_recipe_id UUID; ri RECORD;
BEGIN
  IF NEW.invoice_seq IS NULL OR (TG_OP = 'UPDATE' AND OLD.invoice_seq IS NOT NULL) THEN RETURN NULL; END IF;
  pay := public.felsy_pay_account(NEW.payment_method);
  v_cost := public.felsy_items_cost(NEW.tenant_id, NEW.items);
  PERFORM public.felsy_post(
    NEW.tenant_id, NEW.branch_id, 'order:' || NEW.id, NEW.invoiced_at,
    'مبيعات ' || NEW.invoice_no,
    jsonb_build_array(
      jsonb_build_object('dr', pay, 'cr', '4100', 'amount', NEW.subtotal + coalesce(NEW.rounding_amount, 0), 'desc', 'مبيعات ' || NEW.invoice_no),
      jsonb_build_object('dr', pay, 'cr', '2200', 'amount', NEW.tax_amount, 'desc', 'ضريبة مخرجات ' || NEW.invoice_no),
      jsonb_build_object('dr', '5100', 'cr', '1300', 'amount', v_cost, 'desc', 'تكلفة مبيعات ' || NEW.invoice_no)
    )
  );

  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(NEW.items, '[]'::JSONB)) LOOP
    IF (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_product := (e->>'product_id')::UUID;
      v_qty := coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1);
      SELECT coalesce(name_ar, name) INTO v_product_name FROM public.products
      WHERE id = v_product AND tenant_id = NEW.tenant_id;
      SELECT id INTO v_recipe_id FROM public.product_recipes
      WHERE tenant_id = NEW.tenant_id AND product_id = v_product AND is_active LIMIT 1;

      IF v_recipe_id IS NOT NULL THEN
        FOR ri IN
          SELECT ri.ingredient_product_id, ri.quantity_per_sale, ri.waste_percent, ingredient.cost_price
          FROM public.product_recipe_items ri
          JOIN public.products ingredient ON ingredient.id = ri.ingredient_product_id AND ingredient.tenant_id = NEW.tenant_id
          WHERE ri.recipe_id = v_recipe_id AND ri.tenant_id = NEW.tenant_id
        LOOP
          PERFORM public.felsy_stock_move(
            NEW.tenant_id, NEW.branch_id, ri.ingredient_product_id,
            -(v_qty * ri.quantity_per_sale * (1 + ri.waste_percent / 100)),
            'sale', 'استهلاك وصفة ' || coalesce(v_product_name, '') || ' — ' || NEW.invoice_no,
            NEW.id, ri.cost_price
          );
        END LOOP;
      ELSE
        PERFORM public.felsy_stock_move(NEW.tenant_id, NEW.branch_id, v_product, -v_qty,
          'sale', 'بيع ' || NEW.invoice_no, NEW.id);
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

COMMENT ON TABLE public.product_recipes IS 'One recipe per sellable product; ingredient quantities are expressed in the ingredient stock unit.';
COMMENT ON TABLE public.product_recipe_items IS 'Per-sale ingredient quantities and wastage percentages used for stock deduction and COGS.';
