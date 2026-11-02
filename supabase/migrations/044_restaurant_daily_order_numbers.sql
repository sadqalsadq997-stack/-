-- 044: Add a restaurant/cafe daily display number separate from the legal tax invoice sequence.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS daily_order_number SMALLINT,
  ADD COLUMN IF NOT EXISTS daily_order_date DATE;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh';

CREATE TABLE IF NOT EXISTS public.daily_order_counters (
  scope_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  branch_id UUID,
  business_date DATE NOT NULL,
  last_number SMALLINT NOT NULL DEFAULT 0 CHECK (last_number BETWEEN 1 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, business_date)
);

ALTER TABLE public.daily_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_order_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_daily_order_number(p_tenant_id UUID,p_branch_id UUID,p_business_date DATE)
RETURNS SMALLINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_number SMALLINT; v_scope_id UUID := coalesce(p_branch_id, p_tenant_id);
BEGIN
  INSERT INTO public.daily_order_counters(scope_id,tenant_id,branch_id,business_date,last_number)
  VALUES(v_scope_id,p_tenant_id,p_branch_id,p_business_date,1)
  ON CONFLICT(scope_id,business_date) DO UPDATE SET
    last_number = CASE WHEN public.daily_order_counters.last_number >= 100 THEN 1 ELSE public.daily_order_counters.last_number + 1 END,
    updated_at = now()
  RETURNING last_number INTO v_number;
  RETURN v_number;
END;
$$;
REVOKE ALL ON FUNCTION public.next_daily_order_number(UUID,UUID,DATE) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.assign_daily_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_industry TEXT; v_timezone TEXT; v_business_date DATE;
BEGIN
  IF NEW.daily_order_number IS NOT NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.order_type,'') NOT IN ('dine_in','takeaway','delivery','online') THEN RETURN NEW; END IF;
  SELECT coalesce(nullif((SELECT b.industry_type FROM public.branches b WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id),'general'),
      (SELECT s.industry_type FROM public.app_settings s WHERE s.tenant_id=NEW.tenant_id ORDER BY s.created_at DESC LIMIT 1),'general'),
    coalesce((SELECT nullif(b.timezone,'') FROM public.branches b WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id),'Asia/Riyadh')
  INTO v_industry,v_timezone;
  IF lower(coalesce(v_industry,'general')) NOT IN ('restaurant','cafe') THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN v_timezone:='Asia/Riyadh'; END IF;
  v_business_date := (clock_timestamp() AT TIME ZONE v_timezone)::DATE;
  NEW.daily_order_number := public.next_daily_order_number(NEW.tenant_id,NEW.branch_id,v_business_date);
  NEW.daily_order_date := v_business_date;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_daily_order_number ON public.orders;
CREATE TRIGGER trg_assign_daily_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.assign_daily_order_number();
COMMENT ON COLUMN public.orders.daily_order_number IS 'Restaurant/cafe display ticket number 1..100, reset by branch business date; not the legal tax invoice number.';
COMMENT ON COLUMN public.orders.daily_order_date IS 'Local business date used for the restaurant/cafe display ticket counter.';
