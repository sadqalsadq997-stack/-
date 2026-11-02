-- 057: Use the actual weighed/converted inventory quantity for cost and stock.
CREATE OR REPLACE FUNCTION public.felsy_items_cost(p_tenant UUID, p_items JSONB)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT coalesce(sum(
    coalesce((e->>'inventory_quantity')::NUMERIC, (e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1)
    * CASE
        WHEN r.id IS NOT NULL THEN coalesce(rc.recipe_cost, 0)
        WHEN coalesce(pr.track_inventory, false) THEN coalesce(pr.cost_price, 0)
        ELSE 0
      END
  ), 0)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::JSONB)) e
  JOIN public.products pr ON pr.tenant_id=p_tenant
   AND (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND pr.id=(e->>'product_id')::UUID
  LEFT JOIN public.product_recipes r ON r.tenant_id=p_tenant AND r.product_id=pr.id AND r.is_active
  LEFT JOIN LATERAL (
    SELECT sum(ri.quantity_per_sale*(1+ri.waste_percent/100)*coalesce(ingredient.cost_price,0)) AS recipe_cost
    FROM public.product_recipe_items ri
    JOIN public.products ingredient ON ingredient.id=ri.ingredient_product_id AND ingredient.tenant_id=p_tenant
    WHERE ri.recipe_id=r.id AND ri.tenant_id=p_tenant
  ) rc ON true;
$function$;

CREATE OR REPLACE FUNCTION public.orders_after_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE pay TEXT; e JSONB; v_cost NUMERIC; v_qty NUMERIC; v_product UUID;
  v_product_name TEXT; v_recipe_id UUID; v_recipe_item RECORD;
BEGIN
  IF NEW.invoice_seq IS NULL OR (TG_OP='UPDATE' AND OLD.invoice_seq IS NOT NULL) THEN RETURN NULL; END IF;
  pay:=public.felsy_pay_account(NEW.payment_method);
  v_cost:=public.felsy_items_cost(NEW.tenant_id,NEW.items);
  PERFORM public.felsy_post(NEW.tenant_id,NEW.branch_id,'order:'||NEW.id,NEW.invoiced_at,
    'مبيعات '||NEW.invoice_no,jsonb_build_array(
      jsonb_build_object('dr',pay,'cr','4100','amount',NEW.subtotal+coalesce(NEW.rounding_amount,0),'desc','مبيعات '||NEW.invoice_no),
      jsonb_build_object('dr',pay,'cr','2200','amount',NEW.tax_amount,'desc','ضريبة مخرجات '||NEW.invoice_no),
      jsonb_build_object('dr','5100','cr','1300','amount',v_cost,'desc','تكلفة مبيعات '||NEW.invoice_no)));
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(NEW.items,'[]'::JSONB)) LOOP
    IF (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_product:=(e->>'product_id')::UUID;
      v_qty:=coalesce((e->>'inventory_quantity')::NUMERIC,(e->>'quantity')::NUMERIC,(e->>'qty')::NUMERIC,1);
      IF v_qty<=0 OR v_qty>1000000 THEN RAISE EXCEPTION 'كمية المخزون في سطر الفاتورة غير صالحة'; END IF;
      SELECT coalesce(name_ar,name) INTO v_product_name FROM public.products WHERE id=v_product AND tenant_id=NEW.tenant_id;
      SELECT id INTO v_recipe_id FROM public.product_recipes WHERE tenant_id=NEW.tenant_id AND product_id=v_product AND is_active LIMIT 1;
      IF v_recipe_id IS NOT NULL THEN
        FOR v_recipe_item IN
          SELECT ri.ingredient_product_id,ri.quantity_per_sale,ri.waste_percent,ingredient.cost_price,
                 coalesce(ingredient.name_ar,ingredient.name) AS ingredient_name
          FROM public.product_recipe_items ri
          JOIN public.products ingredient ON ingredient.id=ri.ingredient_product_id AND ingredient.tenant_id=NEW.tenant_id
          WHERE ri.recipe_id=v_recipe_id AND ri.tenant_id=NEW.tenant_id
        LOOP
          PERFORM public.felsy_stock_move(NEW.tenant_id,NEW.branch_id,v_recipe_item.ingredient_product_id,
            -(v_qty*v_recipe_item.quantity_per_sale*(1+v_recipe_item.waste_percent/100)),'sale',
            'استهلاك وصفة '||coalesce(v_product_name,'')||' — '||NEW.invoice_no,NEW.id,v_recipe_item.cost_price);
        END LOOP;
      ELSE
        PERFORM public.felsy_stock_move(NEW.tenant_id,NEW.branch_id,v_product,-v_qty,'sale',
          'بيع '||NEW.invoice_no||coalesce(' — '||nullif(e->>'unit_name',''),''),NEW.id);
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.felsy_stock_move(
  p_tenant UUID,p_branch UUID,p_product UUID,p_delta NUMERIC,p_type TEXT,p_reason TEXT,p_ref UUID,p_cost NUMERIC DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE pr RECORD;
BEGIN
  SELECT id,name_ar,name,stock_quantity,track_inventory INTO pr
  FROM public.products WHERE id=p_product AND tenant_id=p_tenant FOR UPDATE;
  IF pr.id IS NULL OR NOT coalesce(pr.track_inventory,false) OR p_delta=0 THEN RETURN; END IF;
  IF p_delta<0 AND coalesce(pr.stock_quantity,0)+p_delta<0 THEN
    RAISE EXCEPTION 'المخزون غير كافٍ للصنف % — المتاح % والمطلوب %',coalesce(pr.name_ar,pr.name),coalesce(pr.stock_quantity,0),abs(p_delta);
  END IF;
  UPDATE public.products SET stock_quantity=coalesce(stock_quantity,0)+p_delta WHERE id=pr.id;
  INSERT INTO public.inventory_logs(tenant_id,branch_id,product_id,product_name,type,quantity_change,previous_stock,new_stock,reason,wastage_reason,reference_id,unit_cost)
  VALUES(p_tenant,p_branch,pr.id,coalesce(pr.name_ar,pr.name),p_type,p_delta,coalesce(pr.stock_quantity,0),
    coalesce(pr.stock_quantity,0)+p_delta,left(nullif(trim(p_reason),''),500),
    CASE WHEN p_type='wastage' THEN left(nullif(trim(p_reason),''),300) ELSE NULL END,p_ref::TEXT,p_cost);
END;
$function$;

INSERT INTO public.migration_status(migration,note)
VALUES('057_weighted_sales_inventory_quantities','Uses inventory_quantity for weighed and multi-unit items, and prevents inventory from becoming negative when a stock-tracked item is sold.')
ON CONFLICT(migration) DO NOTHING;