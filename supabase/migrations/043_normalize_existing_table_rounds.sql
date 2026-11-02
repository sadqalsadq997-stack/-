-- 043: Normalize partially migrated dine-in items before appending a new round.
CREATE OR REPLACE FUNCTION public.add_table_order_round(
  p_table_id UUID, p_items JSONB, p_notes TEXT DEFAULT NULL, p_cashier_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table public.tables_map%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_product RECORD;
  v_qty INTEGER;
  v_net NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_gross NUMERIC := 0;
  v_round_items JSONB := '[]'::JSONB;
  v_existing_items JSONB := '[]'::JSONB;
  v_round_no INTEGER := 1;
  v_round_id UUID := gen_random_uuid();
  v_legacy_round_id UUID := gen_random_uuid();
  v_added_at TIMESTAMPTZ := now();
  v_order_no TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 80 THEN
    RAISE EXCEPTION 'قائمة المنتجات غير صالحة';
  END IF;

  SELECT * INTO v_table FROM public.tables_map
  WHERE id = p_table_id AND tenant_id IN (SELECT public.current_paid_tenant_ids()) FOR UPDATE;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'الطاولة غير متاحة أو لا تملك صلاحية الوصول'; END IF;
  IF v_table.branch_id IS NULL THEN RAISE EXCEPTION 'يجب ربط الطاولة بفرع'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := greatest(0, least(99, coalesce((v_item->>'qty')::INTEGER, 0)));
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT p.id, coalesce(p.name_ar, p.name) AS product_name, p.vat_category, pp.net, pp.vat, pp.gross
    INTO v_product
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(p.base_price, p.tax_inclusive,
      CASE WHEN upper(coalesce(p.vat_category, 'S')) = 'S' THEN 15 ELSE 0 END) pp
    WHERE p.id = (v_item->>'id')::UUID AND p.tenant_id = v_table.tenant_id AND coalesce(p.is_active, true);
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'يوجد منتج غير متاح'; END IF;
    v_round_items := v_round_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.product_name,
      'price', v_product.gross, 'qty', v_qty, 'quantity', v_qty,
      'total', round(v_product.gross * v_qty, 2), 'vat_category', coalesce(v_product.vat_category, 'S')
    ));
    v_net := v_net + v_product.net * v_qty;
    v_vat := v_vat + v_product.vat * v_qty;
    v_gross := v_gross + v_product.gross * v_qty;
  END LOOP;
  IF jsonb_array_length(v_round_items) = 0 THEN RAISE EXCEPTION 'أضف منتجاً واحداً على الأقل'; END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE tenant_id = v_table.tenant_id AND branch_id = v_table.branch_id
    AND order_type = 'dine_in' AND table_number = v_table.table_number
    AND status NOT IN ('completed', 'cancelled')
  ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF v_order.id IS NULL THEN
    v_round_no := 1;
    v_order_no := 'T' || v_table.table_number || '-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  ELSE
    SELECT coalesce(max(CASE WHEN (item->>'round_number') ~ '^[0-9]+$'
      THEN (item->>'round_number')::INTEGER ELSE 1 END), 1) + 1
    INTO v_round_no
    FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item;

    SELECT coalesce(jsonb_agg(item || jsonb_build_object(
      'round_number', coalesce(CASE WHEN (item->>'round_number') ~ '^[0-9]+$' THEN (item->>'round_number')::INTEGER END, 1),
      'round_id', coalesce(CASE WHEN (item->>'round_id') ~* '^[0-9a-f-]{36}$' THEN (item->>'round_id')::UUID END, v_legacy_round_id),
      'round_status', CASE WHEN v_order.status = 'ready' THEN 'ready'
        ELSE coalesce(item->>'round_status', v_order.status, 'pending') END,
      'round_added_at', coalesce(item->>'round_added_at', v_order.created_at::TEXT),
      'round_added_by', coalesce(item->>'round_added_by', v_order.cashier_name)
    )), '[]'::JSONB)
    INTO v_existing_items
    FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item;
  END IF;

  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'round_number', v_round_no, 'round_id', v_round_id, 'round_status', 'pending',
    'round_added_at', v_added_at, 'round_added_by', nullif(trim(p_cashier_name), ''),
    'round_notes', nullif(left(trim(p_notes), 1000), '')
  )), '[]'::JSONB) INTO v_round_items
  FROM jsonb_array_elements(v_round_items) item;

  IF v_order.id IS NULL THEN
    INSERT INTO public.orders (tenant_id, branch_id, order_number, table_number, order_type,
      status, items, subtotal, tax_amount, total, payment_method, amount_paid, notes, cashier_name, source)
    VALUES (v_table.tenant_id, v_table.branch_id, v_order_no, v_table.table_number, 'dine_in',
      'pending', v_round_items, v_net, v_vat, v_gross, NULL, 0,
      left(nullif(trim(p_notes), ''), 1000), p_cashier_name, 'pos') RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders SET
      items = coalesce(v_existing_items, '[]'::JSONB) || v_round_items,
      subtotal = coalesce(subtotal, 0) + v_net,
      tax_amount = coalesce(tax_amount, 0) + v_vat,
      total = total + v_gross,
      status = CASE WHEN status = 'ready' THEN 'pending' ELSE status END,
      notes = concat_ws(E'\n', nullif(notes, ''), nullif(left(trim(p_notes), 1000), '')),
      updated_at = now()
    WHERE id = v_order.id RETURNING * INTO v_order;
  END IF;

  UPDATE public.tables_map SET status = 'occupied', current_order_id = v_order.id, updated_at = now()
  WHERE id = v_table.id;
  RETURN jsonb_build_object('order', to_jsonb(v_order), 'round_number', v_round_no, 'round_id', v_round_id, 'round_total', v_gross);
END;
$$;

REVOKE ALL ON FUNCTION public.add_table_order_round(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_table_order_round(UUID, JSONB, TEXT, TEXT) TO authenticated;
