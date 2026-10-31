-- Keep only the three approved public subscription plans active.
-- Existing subscriptions keep their existing billing_plan_id and terms.
UPDATE public.billing_plans
SET is_active = false
WHERE plan_code NOT IN ('starter', 'pro', 'enterprise')
  AND is_active = true;

-- Ensure only the latest approved version of each canonical plan is active.
WITH latest AS (
  SELECT plan_code, max(version) AS version
  FROM public.billing_plans
  WHERE plan_code IN ('starter', 'pro', 'enterprise')
  GROUP BY plan_code
)
UPDATE public.billing_plans p
SET is_active = (p.version = latest.version)
FROM latest
WHERE p.plan_code = latest.plan_code
  AND p.is_active IS DISTINCT FROM (p.version = latest.version);

-- Guard against accidentally shipping an incomplete price catalog.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_code = 'starter' AND is_active AND price_monthly = 29) THEN
    RAISE EXCEPTION 'Approved Starter plan (29 SAR) is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_code = 'pro' AND is_active AND price_monthly = 59) THEN
    RAISE EXCEPTION 'Approved Pro plan (59 SAR) is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_code = 'enterprise' AND is_active AND price_monthly = 119) THEN
    RAISE EXCEPTION 'Approved Enterprise plan (119 SAR) is missing';
  END IF;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '030_canonical_subscription_plans',
  'Deactivate legacy plan codes and keep only the approved 29/59/119 SAR catalog active'
) ON CONFLICT (migration) DO NOTHING;
