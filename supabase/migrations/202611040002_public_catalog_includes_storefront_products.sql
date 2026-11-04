CREATE OR REPLACE FUNCTION public.public_menu(p_branch uuid DEFAULT NULL::uuid, p_host text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_branch JSONB;
  v_tenant UUID;
BEGIN
  IF p_branch IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_branch
    FROM public.branches b
    WHERE b.id = p_branch AND coalesce(b.is_active, true);
  ELSIF p_host IS NOT NULL AND length(p_host) BETWEEN 3 AND 253 THEN
    SELECT to_jsonb(b) INTO v_branch
    FROM public.domains d
    JOIN public.branches b ON b.id = d.branch_id
    WHERE lower(d.domain) = lower(regexp_replace(p_host, '^www\.', ''))
      AND d.is_active
    LIMIT 1;
  END IF;

  IF v_branch IS NULL THEN RETURN NULL; END IF;
  v_tenant := (v_branch->>'tenant_id')::UUID;
  IF v_tenant IS NULL OR NOT public.tenant_is_paid(v_tenant) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'branch', public.strip_private(v_branch),
    'categories', coalesce((
      SELECT jsonb_agg(public.strip_private(to_jsonb(c)) ORDER BY c.sort_order NULLS LAST)
      FROM public.categories c
      WHERE c.tenant_id = v_tenant AND coalesce(c.is_active, true)
    ), '[]'::JSONB),
    'products', coalesce((
      SELECT jsonb_agg(
        public.strip_private(to_jsonb(p)) || jsonb_build_object('price', pp.gross)
        ORDER BY p.sort_order NULLS LAST
      )
      FROM public.products p
      CROSS JOIN LATERAL public.product_price_parts(p.base_price, p.tax_inclusive, p.tax_rate) pp
      WHERE p.tenant_id = v_tenant
        AND coalesce(p.is_active, true)
        AND (coalesce(p.show_in_menu, true) OR coalesce(p.show_in_store, false))
    ), '[]'::JSONB)
  );
END
$function$;

COMMENT ON FUNCTION public.public_menu(uuid, text) IS
'Public catalog resolver for tenant menu/storefront hosts. Returns only active tenant products visible in either menu or store; frontend filters by storefront mode.';
