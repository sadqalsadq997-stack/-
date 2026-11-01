-- Felsy: one-time 30-day Pro trial for new tenant signups.
-- Trial is prepaid/no-card: no automatic Moyasar charge is possible.
CREATE TABLE IF NOT EXISTS public.free_trial_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_auth_id UUID NOT NULL UNIQUE,
  contact_phone TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS free_trial_claims_phone_unique
  ON public.free_trial_claims(contact_phone) WHERE contact_phone IS NOT NULL;
ALTER TABLE public.free_trial_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_trial_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_tenant_free_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.billing_plans%ROWTYPE;
  v_claim_id UUID;
BEGIN
  IF NEW.plan <> 'trial_pro' THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_auth_id IS NULL THEN
    RAISE EXCEPTION 'Free trial requires an authenticated owner';
  END IF;

  SELECT * INTO v_plan
  FROM public.billing_plans
  WHERE plan_code = 'pro' AND is_active = true
  ORDER BY version DESC
  LIMIT 1;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'The Pro plan is not configured';
  END IF;

  INSERT INTO public.free_trial_claims (tenant_id, owner_auth_id, contact_phone)
  VALUES (NEW.id, NEW.owner_auth_id, NULLIF(regexp_replace(COALESCE(NEW.contact_phone, ''), '[^0-9]', '', 'g'), ''))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'A free trial has already been used by this account or phone number';
  END IF;

  INSERT INTO public.tenant_subscriptions (
    tenant_id, billing_plan_id, status,
    current_period_start, current_period_end,
    next_charge_amount, trial_periods_remaining, billing_mode
  ) VALUES (
    NEW.id, v_plan.id, 'trialing',
    now(), now() + interval '30 days',
    v_plan.price_monthly, 0, 'prepaid'
  );

  UPDATE public.tenants
  SET plan = 'pro', status = 'active', updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_tenant_free_trial ON public.tenants;
CREATE TRIGGER trg_start_tenant_free_trial
AFTER INSERT ON public.tenants
FOR EACH ROW
WHEN (NEW.plan = 'trial_pro')
EXECUTE FUNCTION public.start_tenant_free_trial();

INSERT INTO public.migration_status (migration, note)
VALUES ('033_30_day_pro_free_trial', 'One-time 30-day Pro trial for new signups; prepaid billing mode prevents automatic charges.')
ON CONFLICT (migration) DO NOTHING;
