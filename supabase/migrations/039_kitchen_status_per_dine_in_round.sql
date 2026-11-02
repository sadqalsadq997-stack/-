-- 039: Keep kitchen state per dine-in round, not per whole table bill.
CREATE OR REPLACE FUNCTION public.add_table_order_round(
  p_table_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO v_table
  FROM public.tables_map
  WHERE id = p_table_id
    AND tenant_id IN (SELECT public.current_paid_tenant_ids())
  FOR UPDATE;

  IF v_table.id IS NULL THEN RAISE EXCEPTION 'الطاولة غير متاحة أو لا تملك صلاحية الوصول'; END IF;
  IF v_table.branch_id IS NULL THEN RAISE EXCEPTION 'يجب ربط الطاولة بفرع'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := greatest(0, least(99, coalesce((v_item->>'qty')::INTEGER, 0)));
    IF v_qty = 0 THEN CONTINUE; END IF;

    SELECT p.id, coalesce(p.name_ar, p.name) AS product_name,
           p.vat_category, pp.net, pp.vat, pp.gross
    INTO v_product
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(
      p.base_price, p.tax_inclusive,
      CASE WHEN upper(coalesce(p.vat_category, 'S')) = 'S' THEN 15 ELSE 0 END
    ) pp
    WHERE p.id = (v_item->>'id')::UUID
      AND p.tenant_id = v_table.tenant_id
      AND coalesce(p.is_active, true);

    IF v_product.id IS NULL THEN RAISE EXCEPTION 'يوجد منتج غير متاح'; END IF;

    v_round_items := v_round_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.product_name,
      'price', v_product.gross,
      'qty', v_qty,
      'quantity', v_qty,
      'total', round(v_product.gross * v_qty, 2),
      'vat_category', coalesce(v_product.vat_category, 'S')
    ));
    v_net := v_net + v_product.net * v_qty;
    v_vat := v_vat + v_product.vat * v_qty;
    v_gross := v_gross + v_product.gross * v_qty;
  END LOOP;

  IF jsonb_array_length(v_round_items) = 0 THEN RAISE EXCEPTION 'أضف منتجاً واحداً على الأقل'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE tenant_id = v_table.tenant_id
    AND branch_id = v_table.branch_id
    AND order_type = 'dine_in'
    AND table_number = v_table.table_number
    AND status NOT IN ('completed', 'cancelled')
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    v_round_no := 1;
    v_order_no := 'T' || v_table.table_number || '-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  ELSE
    SELECT coalesce(max(
      CASE WHEN (item->>'round_number') ~ '^[0-9]+$'
        THEN (item->>'round_number')::INTEGER ELSE 1 END
    ), 1) + 1
    INTO v_round_no
    FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item;

    SELECT coalesce(jsonb_agg(
      CASE WHEN item ? 'round_id' THEN item
      ELSE item || jsonb_build_object(
        'round_number', 1,
        'round_id', v_legacy_round_id,
        'round_status', coalesce(v_order.status, 'pending'),
        'round_added_at', v_order.created_at,
        'round_added_by', v_order.cashier_name
      ) END
    ), '[]'::JSONB)
    INTO v_existing_items
    FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item;
  END IF;

  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'round_number', v_round_no,
    'round_id', v_round_id,
    'round_status', 'pending',
    'round_added_at', v_added_at,
    'round_added_by', nullif(trim(p_cashier_name), ''),
    'round_notes', nullif(left(trim(p_notes), 1000), '')
  )), '[]'::JSONB)
  INTO v_round_items
  FROM jsonb_array_elements(v_round_items) item;

  IF v_order.id IS NULL THEN
    INSERT INTO public.orders (
      tenant_id, branch_id, order_number, table_number, order_type,
      status, items, subtotal, tax_amount, total, payment_method,
      amount_paid, notes, cashier_name, source
    ) VALUES (
      v_table.tenant_id, v_table.branch_id, v_order_no, v_table.table_number, 'dine_in',
      'pending', v_round_items, v_net, v_vat, v_gross, NULL,
      0, left(nullif(trim(p_notes), ''), 1000), p_cashier_name, 'pos'
    ) RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders
    SET items = coalesce(v_existing_items, '[]'::JSONB) || v_round_items,
        subtotal = coalesce(subtotal, 0) + v_net,
        tax_amount = coalesce(tax_amount, 0) + v_vat,
        total = total + v_gross,
        status = CASE WHEN status = 'ready' THEN 'pending' ELSE status END,
        notes = concat_ws(E'\n', nullif(notes, ''), nullif(left(trim(p_notes), 1000), '')),
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  UPDATE public.tables_map
  SET status = 'occupied', current_order_id = v_order.id, updated_at = now()
  WHERE id = v_table.id;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'round_number', v_round_no, 'round_id', v_round_id, 'round_total', v_gross);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_table_order_round_status(p_order_id UUID, p_round_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items JSONB;
  v_new_round_id UUID := coalesce(p_round_id, gen_random_uuid());
  v_old_status TEXT;
  v_order_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_status NOT IN ('preparing', 'ready') THEN RAISE EXCEPTION 'حالة المطبخ غير صالحة'; END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND order_type = 'dine_in'
    AND status IN ('pending', 'preparing')
  FOR UPDATE;

  IF v_order.id IS NULL THEN RAISE EXCEPTION 'الطلب غير متاح للمطبخ'; END IF;

  SELECT coalesce(max(item->>'round_status'), v_order.status)
  INTO v_old_status
  FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item
  WHERE (p_round_id IS NOT NULL AND item->>'round_id' = p_round_id::TEXT)
     OR (p_round_id IS NULL AND NOT (item ? 'round_id'));

  IF v_old_status IS NULL THEN RAISE EXCEPTION 'جولة الطلب غير موجودة'; END IF;
  IF p_status = 'preparing' AND v_old_status <> 'pending' THEN RAISE EXCEPTION 'يمكن بدء تجهيز الجولة المنتظرة فقط'; END IF;
  IF p_status = 'ready' AND v_old_status <> 'preparing' THEN RAISE EXCEPTION 'يجب بدء التجهيز قبل اعتماد الجاهزية'; END IF;

  SELECT coalesce(jsonb_agg(
    CASE
      WHEN (p_round_id IS NOT NULL AND item->>'round_id' = p_round_id::TEXT)
        OR (p_round_id IS NULL AND NOT (item ? 'round_id'))
      THEN item || jsonb_build_object('round_id', v_new_round_id, 'round_number', coalesce(nullif(item->>'round_number','')::INTEGER, 1), 'round_status', p_status)
      ELSE item
    END
  ), '[]'::JSONB)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE coalesce(x->>'round_status','pending') = 'pending') THEN 'pending'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE coalesce(x->>'round_status','pending') = 'preparing') THEN 'preparing'
    ELSE 'ready'
  END INTO v_order_status;

  UPDATE public.orders SET items = v_items, status = v_order_status, updated_at = now()
  WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'round_id', v_new_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.add_table_order_round(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_table_order_round(UUID, JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_table_order_round_status(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_table_order_round_status(UUID, UUID, TEXT) TO authenticated;
