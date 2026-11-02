-- 045: Ensure the daily display counter is always allocated server-side.
ALTER TABLE public.daily_order_counters ALTER COLUMN last_number SET DEFAULT 1;
CREATE OR REPLACE FUNCTION public.assign_daily_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_industry TEXT; v_timezone TEXT; v_business_date DATE;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.order_type,'') NOT IN ('dine_in','takeaway','delivery','online') THEN
    NEW.daily_order_number := NULL; NEW.daily_order_date := NULL; RETURN NEW;
  END IF;
  SELECT coalesce(nullif((SELECT b.industry_type FROM public.branches b WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id),'general'),
      (SELECT s.industry_type FROM public.app_settings s WHERE s.tenant_id=NEW.tenant_id ORDER BY s.created_at DESC LIMIT 1),'general'),
    coalesce((SELECT nullif(b.timezone,'') FROM public.branches b WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id),'Asia/Riyadh')
  INTO v_industry,v_timezone;
  IF lower(coalesce(v_industry,'general')) NOT IN ('restaurant','cafe') THEN
    NEW.daily_order_number := NULL; NEW.daily_order_date := NULL; RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN v_timezone:='Asia/Riyadh'; END IF;
  v_business_date := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;
  NEW.daily_order_number := public.next_daily_order_number(NEW.tenant_id,NEW.branch_id,v_business_date);
  NEW.daily_order_date := v_business_date;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.assign_daily_order_number() IS 'Allocates a server-controlled restaurant/cafe display number 1..100 for each branch business day.';
