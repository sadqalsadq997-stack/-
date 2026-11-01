-- Felsy 031: Keep unpaid public orders out of the kitchen queue.
-- Public menu orders are not paid merely because the customer submits the cart.
CREATE OR REPLACE FUNCTION public.public_place_order(
  p_branch UUID,
  p_items JSONB,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_ip TEXT := coalesce(public.request_ip(), 'unknown');
  v_items JSONB := '[]'::JSONB;
  v_net NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_gross NUMERIC := 0;
  v_it JSONB;
  v_prod RECORD;
  v_qty INT;
  v_num TEXT;
  v_order_id UUID;
BEGIN
  SELECT b.tenant_id INTO v_tenant
  FROM public.branches b
  WHERE b.id = p_branch AND coalesce(b.is_active, true);

  IF v_tenant IS NULL OR NOT public.tenant_is_paid(v_tenant) THEN
    RAISE EXCEPTION 'المتجر غير متاح حالياً';
  END IF;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'السلة غير صالحة';
  END IF;

  IF (SELECT count(*) FROM public.public_order_rate
      WHERE ip = v_ip AND created_at > now() - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'طلبات كثيرة — حاول بعد قليل';
  END IF;

  IF p_phone IS NOT NULL AND p_phone !~ '^\+?[0-9 ]{7,16}$' THEN
    RAISE EXCEPTION 'رقم الجوال غير صحيح';
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := least(greatest(coalesce((v_it->>'qty')::INT, 0), 0), 99);
    IF v_qty = 0 THEN CONTINUE; END IF;

    SELECT p.id, coalesce(p.name_ar, p.name) AS name, pp.net, pp.vat, pp.gross
    INTO v_prod
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(p.base_price, p.tax_inclusive, p.tax_rate) pp
    WHERE p.id = (v_it->>'id')::UUID
      AND p.tenant_id = v_tenant
      AND coalesce(p.is_active, true);

    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'منتج غير متاح'; END IF;

    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id,
      'name', v_prod.name,
      'price', v_prod.gross,
      'quantity', v_qty,
      'total', v_prod.gross * v_qty
    );
    v_net := v_net + v_prod.net * v_qty;
    v_vat := v_vat + v_prod.vat * v_qty;
    v_gross := v_gross + v_prod.gross * v_qty;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;

  v_num := 'ONL-' || upper(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT));

  INSERT INTO public.orders (
    tenant_id, branch_id, items, subtotal, tax_amount, total,
    status, order_type, payment_method, amount_paid,
    customer_phone, notes, order_number, source
  )
  VALUES (
    v_tenant, p_branch, v_items, v_net, v_vat, v_gross,
    'awaiting_payment', 'online', NULL, 0,
    nullif(trim(p_phone), ''), left(nullif(trim(p_notes), ''), 500),
    v_num, 'online'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.public_order_rate (ip, branch_id) VALUES (v_ip, p_branch);

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_num,
    'status', 'awaiting_payment',
    'total', v_gross
  );
END;
$$;

COMMENT ON FUNCTION public.public_place_order(UUID, JSONB, TEXT, TEXT)
IS 'Creates an unpaid online order in awaiting_payment; cashier approval is required before kitchen preparation.';
