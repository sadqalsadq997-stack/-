-- 046: Fall back to the active branch logo for public menus when legacy settings lack tenant_id.
CREATE OR REPLACE FUNCTION public.public_menu_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_branch UUID;
  v_menu JSONB;
  a RECORD;
  v_logo TEXT;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN NULL; END IF;
  SELECT id INTO v_tenant
  FROM public.tenants
  WHERE lower(slug) = lower(p_slug) OR account_number::TEXT = p_slug
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_branch
  FROM public.branches
  WHERE tenant_id = v_tenant AND coalesce(is_active, true)
  ORDER BY created_at LIMIT 1;
  IF v_branch IS NULL THEN RETURN NULL; END IF;

  v_menu := public.public_menu(v_branch, NULL);
  IF v_menu IS NULL THEN RETURN NULL; END IF;

  SELECT business_name, logo_url, menu_theme, menu_color, phone, address, city
  INTO a
  FROM public.app_settings
  WHERE tenant_id = v_tenant
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT coalesce(a.logo_url, b.logo_url) INTO v_logo
  FROM public.branches b WHERE b.id = v_branch;

  RETURN v_menu || jsonb_build_object(
    'business_name', coalesce(a.business_name, (SELECT name FROM public.tenants WHERE id = v_tenant)),
    'logo_url', v_logo,
    'theme', coalesce(a.menu_theme, 'fresh'),
    'color', a.menu_color,
    'phone', coalesce(a.phone, (SELECT phone FROM public.branches WHERE id = v_branch)),
    'address', coalesce(a.address, (SELECT address FROM public.branches WHERE id = v_branch)),
    'city', a.city,
    'slug', p_slug
  );
END;
$$;
