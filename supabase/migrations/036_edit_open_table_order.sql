-- 036: Allow editing an unpaid open dine-in table bill before preparation starts.
CREATE OR REPLACE FUNCTION public.replace_open_table_order(
  p_order_id UUID,
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
  v_qty INTEGER;
  v_items JSONB := '[]'::JSONB;
  v_net NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_gross NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 80 THEN
    RAISE EXCEPTION 'قائمة المنتجات غير صالحة';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND order_type = 'dine_in'
  FOR UPDATE;

  IF v_order.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود أو لا تملك صلاحية الوصول'; END IF;
  IF v_order.status <> 'pending' OR v_order.invoice_no IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن تعديل الطلب بعد بدء التجهيز أو إصدار الفاتورة';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := greatest(0, least(99, coalesce((v_item->>'qty')::INTEGER, 0)));
    IF v_qty = 0 THEN CONTINUE; END IF;

    SELECT p.id, coalesce(p.name_ar, p.name) AS product_name,
           p.vat_category,
           pp.net, pp.vat, pp.gross
    INTO v_product
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(
      p.base_price, p.tax_inclusive,
      CASE WHEN upper(coalesce(p.vat_category, 'S')) = 'S' THEN 15 ELSE 0 END
    ) pp
    WHERE p.id = (v_item->>'id')::UUID
      AND p.tenant_id = v_order.tenant_id
      AND coalesce(p.is_active, true);

    IF v_product.id IS NULL THEN RAISE EXCEPTION 'يوجد منتج غير متاح'; END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
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

  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'أضف منتجاً واحداً على الأقل'; END IF;

  UPDATE public.orders
  SET items = v_items,
      subtotal = v_net,
      tax_amount = v_vat,
      total = v_gross,
      notes = left(nullif(trim(p_notes), ''), 1000),
      updated_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('order', to_jsonb(v_order));
END;
$$;

REVOKE ALL ON FUNCTION public.replace_open_table_order(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_open_table_order(UUID, JSONB, TEXT) TO authenticated;
