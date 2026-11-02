-- 045: Edit one pending dine-in round without replacing the full table bill.
CREATE OR REPLACE FUNCTION public.replace_table_order_round(
  p_order_id UUID,
  p_round_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_product RECORD;
  v_old JSONB;
  v_qty INTEGER;
  v_new_items JSONB := '[]'::JSONB;
  v_all_items JSONB;
  v_net NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_gross NUMERIC := 0;
  v_item_gross NUMERIC;
  v_item_net NUMERIC;
  v_item_vat NUMERIC;
  v_item_cat TEXT;
  v_item_id UUID;
  v_item_qty NUMERIC;
  v_item_price NUMERIC;
  v_round_number INTEGER;
  v_added_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'معرّف الجولة مطلوب'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 80 THEN
    RAISE EXCEPTION 'قائمة المنتجات غير صالحة';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND order_type = 'dine_in'
    AND status NOT IN ('completed', 'cancelled')
    AND invoice_no IS NULL
  FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير مفتوحة أو لا تملك صلاحية الوصول'; END IF;

  SELECT max(nullif(item->>'round_number','')::INTEGER)
  INTO v_round_number
  FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item
  WHERE item->>'round_id' = p_round_id::TEXT;
  IF v_round_number IS NULL THEN RAISE EXCEPTION 'الجولة غير موجودة'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item
    WHERE item->>'round_id' = p_round_id::TEXT
      AND coalesce(item->>'round_status', 'pending') <> 'pending'
  ) THEN
    RAISE EXCEPTION 'لا يمكن تعديل جولة بدأ تجهيزها';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := greatest(0, least(99, coalesce((v_item->>'qty')::INTEGER, 0)));
    IF v_qty = 0 THEN CONTINUE; END IF;

    SELECT p.id, coalesce(p.name_ar, p.name) AS product_name,
           coalesce(old_item.gross, pp.gross) AS gross,
           coalesce(old_item.vat_category, p.vat_category, 'S') AS vat_category
    INTO v_product
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(
      p.base_price, p.tax_inclusive,
      CASE WHEN upper(coalesce(p.vat_category, 'S')) = 'S' THEN 15 ELSE 0 END
    ) pp
    LEFT JOIN LATERAL (
      SELECT nullif(x->>'price','')::NUMERIC AS gross,
             nullif(x->>'vat_category','') AS vat_category
      FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) x
      WHERE x->>'round_id' = p_round_id::TEXT
        AND x->>'product_id' = p.id::TEXT
      LIMIT 1
    ) old_item ON true
    WHERE p.id = (v_item->>'id')::UUID
      AND p.tenant_id = v_order.tenant_id
      AND coalesce(p.is_active, true);
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'يوجد منتج غير متاح'; END IF;

    v_item_gross := v_product.gross;
    IF upper(coalesce(v_product.vat_category, 'S')) = 'S' THEN
      v_item_net := round(v_item_gross / 1.15, 2);
      v_item_vat := v_item_gross - v_item_net;
    ELSE
      v_item_net := v_item_gross;
      v_item_vat := 0;
    END IF;

    v_new_items := v_new_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.product_name,
      'price', v_item_gross, 'qty', v_qty, 'quantity', v_qty,
      'total', round(v_item_gross * v_qty, 2),
      'vat_category', v_product.vat_category,
      'round_id', p_round_id, 'round_number', v_round_number,
      'round_status', 'pending', 'round_added_at', v_added_at,
      'round_notes', left(nullif(trim(p_notes), ''), 1000)
    ));
  END LOOP;
  IF jsonb_array_length(v_new_items) = 0 THEN RAISE EXCEPTION 'أضف منتجاً واحداً على الأقل'; END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::JSONB)
  INTO v_all_items
  FROM (
    SELECT item, ord
    FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) WITH ORDINALITY e(item, ord)
    WHERE item->>'round_id' <> p_round_id::TEXT
    UNION ALL
    SELECT item, 1000000 + ord
    FROM jsonb_array_elements(v_new_items) WITH ORDINALITY e(item, ord)
  ) merged;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_all_items) LOOP
    v_item_id := nullif(v_item->>'product_id','')::UUID;
    v_item_qty := greatest(0, coalesce(nullif(v_item->>'qty','')::NUMERIC, nullif(v_item->>'quantity','')::NUMERIC, 1));
    v_item_price := coalesce(nullif(v_item->>'price','')::NUMERIC, 0);
    SELECT coalesce(nullif(v_item->>'vat_category',''), p.vat_category, 'S')
    INTO v_item_cat
    FROM public.products p
    WHERE p.id = v_item_id AND p.tenant_id = v_order.tenant_id;
    v_item_cat := coalesce(v_item_cat, 'S');
    v_item_gross := round(v_item_price * v_item_qty, 2);
    IF upper(v_item_cat) = 'S' THEN
      v_item_net := round(v_item_gross / 1.15, 2);
      v_item_vat := v_item_gross - v_item_net;
    ELSE
      v_item_net := v_item_gross;
      v_item_vat := 0;
    END IF;
    v_net := v_net + v_item_net;
    v_vat := v_vat + v_item_vat;
    v_gross := v_gross + v_item_gross;
  END LOOP;

  UPDATE public.orders
  SET items = v_all_items,
      subtotal = round(v_net, 2),
      tax_amount = round(v_vat, 2),
      total = round(v_gross, 2),
      updated_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'round_id', p_round_id,
                            'round_number', v_round_number);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_table_order_round(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_table_order_round(UUID, UUID, JSONB, TEXT) TO authenticated;
COMMENT ON FUNCTION public.replace_table_order_round(UUID, UUID, JSONB, TEXT)
IS 'Replaces only one unstarted dine-in round and recalculates the aggregate open bill.';
INSERT INTO public.migration_status (migration, note)
VALUES ('045_edit_dine_in_round', 'Allows editing a single pending dine-in round without replacing the full open table bill.')
ON CONFLICT (migration) DO NOTHING;
