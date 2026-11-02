-- 046: Public branch-specific pager link; customers can enter an invoice number.
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS pager_public_token TEXT;

UPDATE public.branches
SET pager_public_token = replace(gen_random_uuid()::text, '-', '')
WHERE pager_public_token IS NULL OR length(pager_public_token) < 32;

CREATE UNIQUE INDEX IF NOT EXISTS branches_pager_public_token_uidx
  ON public.branches(pager_public_token);

CREATE OR REPLACE FUNCTION public.pager_public_branch(p_public_token TEXT)
RETURNS TABLE (business_name TEXT, logo_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(b.zatca_seller_name, b.name_ar, b.name), b.logo_url
  FROM public.branches b
  WHERE b.pager_public_token = p_public_token
    AND length(p_public_token) BETWEEN 32 AND 64
    AND coalesce(b.is_active, true)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pager_start_for_invoice(
  p_public_token TEXT,
  p_invoice_no TEXT
)
RETURNS TABLE (pager_token TEXT, display_number INTEGER, pager_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_pager public.order_pagers%ROWTYPE;
  v_number INTEGER;
  v_status TEXT;
  v_token TEXT;
BEGIN
  IF p_public_token IS NULL OR length(p_public_token) NOT BETWEEN 32 AND 64
     OR p_invoice_no IS NULL OR length(trim(p_invoice_no)) NOT BETWEEN 3 AND 64 THEN
    RAISE EXCEPTION 'تعذر العثور على الفاتورة';
  END IF;

  SELECT * INTO v_branch
  FROM public.branches b
  WHERE b.pager_public_token = p_public_token
    AND coalesce(b.is_active, true)
    AND public.tenant_is_paid(b.tenant_id)
  LIMIT 1;

  IF v_branch.id IS NULL THEN RAISE EXCEPTION 'رابط المنشأة غير متاح'; END IF;

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.branch_id = v_branch.id
    AND o.tenant_id = v_branch.tenant_id
    AND o.invoice_no = trim(p_invoice_no)
    AND o.invoice_seq IS NOT NULL
    AND o.status <> 'cancelled'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_order.id IS NULL THEN RAISE EXCEPTION 'تعذر العثور على الفاتورة. تحقق من الرقم وحاول مرة أخرى'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pager-order:' || v_order.id::text));

  SELECT * INTO v_pager
  FROM public.order_pagers p
  WHERE p.order_id = v_order.id
    AND p.created_at > now() - interval '24 hours'
    AND p.status <> 'cancelled'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pager.id IS NOT NULL THEN
    RETURN QUERY SELECT v_pager.token, v_pager.display_number, v_pager.status;
    RETURN;
  END IF;

  v_status := CASE
    WHEN v_order.status IN ('ready', 'completed') THEN 'ready'
    WHEN v_order.status = 'preparing' THEN 'preparing'
    ELSE 'waiting'
  END;

  v_number := v_order.daily_order_number;
  IF v_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('pager-branch:' || v_branch.id::text));
    SELECT coalesce(max(p.display_number), 0) + 1 INTO v_number
    FROM public.order_pagers p
    WHERE p.branch_id = v_branch.id
      AND p.created_at >= date_trunc('day', now() AT TIME ZONE coalesce(v_branch.timezone, 'Asia/Riyadh'))
                           AT TIME ZONE coalesce(v_branch.timezone, 'Asia/Riyadh');
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.order_pagers (
    tenant_id, branch_id, order_id, token, display_number, label, status, ready_at
  ) VALUES (
    v_branch.tenant_id, v_branch.id, v_order.id, v_token, v_number,
    left(coalesce(v_order.invoice_no, v_order.order_number), 40), v_status,
    CASE WHEN v_status = 'ready' THEN now() ELSE NULL END
  ) RETURNING * INTO v_pager;

  RETURN QUERY SELECT v_pager.token, v_pager.display_number, v_pager.status;
END;
$$;

REVOKE ALL ON FUNCTION public.pager_public_branch(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pager_start_for_invoice(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pager_public_branch(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pager_start_for_invoice(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.pager_start_for_invoice(TEXT, TEXT)
IS 'Finds an issued invoice within an unguessable branch pager link and returns a private customer pager token without exposing order details.';

INSERT INTO public.migration_status (migration, note)
VALUES ('046_pager_invoice_lookup', 'Adds an unguessable public link per branch where customers enter an invoice number to open their private digital pager.')
ON CONFLICT (migration) DO NOTHING;