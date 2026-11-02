-- 050: Fix the recipe-consumption trigger's PL/pgSQL record/SQL alias collision.
CREATE OR REPLACE FUNCTION public.orders_after_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pay TEXT;
  e JSONB;
  v_cost NUMERIC;
  v_qty NUMERIC;
  v_product UUID;
  v_product_name TEXT;
  v_recipe_id UUID;
  v_recipe_item RECORD;
BEGIN
  IF NEW.invoice_seq IS NULL OR (TG_OP = 'UPDATE' AND OLD.invoice_seq IS NOT NULL) THEN
    RETURN NULL;
  END IF;

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
      SELECT coalesce(name_ar, name) INTO v_product_name
      FROM public.products WHERE id = v_product AND tenant_id = NEW.tenant_id;

      SELECT id INTO v_recipe_id
      FROM public.product_recipes
      WHERE tenant_id = NEW.tenant_id AND product_id = v_product AND is_active
      LIMIT 1;

      IF v_recipe_id IS NOT NULL THEN
        FOR v_recipe_item IN
          SELECT recipe_item.ingredient_product_id,
                 recipe_item.quantity_per_sale,
                 recipe_item.waste_percent,
                 ingredient.cost_price,
                 coalesce(ingredient.name_ar, ingredient.name) AS ingredient_name
          FROM public.product_recipe_items recipe_item
          JOIN public.products ingredient
            ON ingredient.id = recipe_item.ingredient_product_id
           AND ingredient.tenant_id = NEW.tenant_id
          WHERE recipe_item.recipe_id = v_recipe_id
            AND recipe_item.tenant_id = NEW.tenant_id
        LOOP
          PERFORM public.felsy_stock_move(
            NEW.tenant_id, NEW.branch_id, v_recipe_item.ingredient_product_id,
            -(v_qty * v_recipe_item.quantity_per_sale * (1 + v_recipe_item.waste_percent / 100)),
            'sale', 'استهلاك وصفة ' || coalesce(v_product_name, '') || ' — ' || NEW.invoice_no,
            NEW.id, v_recipe_item.cost_price
          );
        END LOOP;
      ELSE
        PERFORM public.felsy_stock_move(
          NEW.tenant_id, NEW.branch_id, v_product, -v_qty,
          'sale', 'بيع ' || NEW.invoice_no, NEW.id
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

INSERT INTO public.migration_status (migration, note)
VALUES ('050_fix_recipe_consumption_trigger', 'Fixes the PL/pgSQL record alias collision that prevented invoice issuance when a sold product had a recipe.')
ON CONFLICT (migration) DO NOTHING;