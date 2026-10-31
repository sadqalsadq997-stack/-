-- Atomic Moyasar checkout activation.
-- External payment verification happens in the Edge Function; all database
-- side effects below commit together or roll back together.
CREATE OR REPLACE FUNCTION public.billing_activate_checkout(
  p_checkout UUID,
  p_payment_id TEXT,
  p_payment_status TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_card_company TEXT DEFAULT NULL,
  p_card_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.billing_checkouts;
  pl public.billing_plans;
  promo public.billing_promotions;
  sub public.tenant_subscriptions;
  v_start TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
  v_trial_remaining INTEGER := 0;
  v_next_charge NUMERIC(10,2);
BEGIN
  SELECT * INTO c
  FROM public.billing_checkouts
  WHERE id = p_checkout
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'عملية الدفع غير موجودة';
  END IF;

  IF c.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyActive', true);
  END IF;

  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'عملية الدفع ليست معلقة';
  END IF;

  IF p_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'لم تكتمل عملية الدفع';
  END IF;

  IF p_payment_id IS NULL OR p_payment_id = '' OR c.moyasar_payment_id IS NULL OR c.moyasar_payment_id <> p_payment_id THEN
    RAISE EXCEPTION 'الدفعة لا تخص هذه العملية';
  END IF;

  IF p_currency IS DISTINCT FROM 'SAR' OR p_amount_minor IS NULL OR p_amount_minor <> round(c.amount * 100)::BIGINT THEN
    UPDATE public.billing_checkouts
    SET status = 'amount_mismatch'
    WHERE id = c.id;
    RETURN jsonb_build_object('ok', false, 'error', 'مبلغ الدفعة لا يطابق سعر الخطة');
  END IF;

  SELECT * INTO pl
  FROM public.billing_plans
  WHERE id = c.billing_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'خطة الاشتراك غير موجودة';
  END IF;

  IF c.promotion_id IS NOT NULL THEN
    SELECT * INTO promo
    FROM public.billing_promotions
    WHERE id = c.promotion_id;
  END IF;

  v_end := v_start;
  v_next_charge := pl.price_monthly;

  IF promo.id IS NOT NULL THEN
    IF promo.trial_period_unit = 'day' THEN
      v_end := v_end + make_interval(days => promo.trial_period_count);
    ELSE
      v_end := v_end + make_interval(months => 1);
    END IF;
    v_trial_remaining := GREATEST(0, promo.trial_period_count - 1);
    IF v_trial_remaining > 0 THEN
      v_next_charge := promo.trial_price;
    END IF;
  ELSE
    v_end := v_end + make_interval(months => 1);
  END IF;

  INSERT INTO public.tenant_subscriptions (
    tenant_id, billing_plan_id, promotion_id, status,
    current_period_start, current_period_end, next_charge_amount,
    trial_periods_remaining, moyasar_token, moyasar_card_brand,
    moyasar_card_last_four, failed_attempts, last_payment_id,
    cancelled_at, updated_at
  ) VALUES (
    c.tenant_id, pl.id, promo.id,
    CASE WHEN v_trial_remaining > 0 THEN 'trialing' ELSE 'active' END,
    v_start, v_end, v_next_charge, v_trial_remaining,
    c.moyasar_token, p_card_company, right(coalesce(p_card_number, ''), 4),
    0, p_payment_id, NULL, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    billing_plan_id = EXCLUDED.billing_plan_id,
    promotion_id = EXCLUDED.promotion_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    next_charge_amount = EXCLUDED.next_charge_amount,
    trial_periods_remaining = EXCLUDED.trial_periods_remaining,
    moyasar_token = EXCLUDED.moyasar_token,
    moyasar_card_brand = EXCLUDED.moyasar_card_brand,
    moyasar_card_last_four = EXCLUDED.moyasar_card_last_four,
    failed_attempts = 0,
    last_payment_id = EXCLUDED.last_payment_id,
    cancelled_at = NULL,
    updated_at = now()
  RETURNING * INTO sub;

  INSERT INTO public.billing_invoices (
    tenant_id, subscription_id, amount, status, moyasar_payment_id,
    period_start, period_end, paid_at
  ) VALUES (
    c.tenant_id, sub.id, c.amount, 'paid', p_payment_id,
    v_start, v_end, now()
  );

  UPDATE public.tenants
  SET status = 'active', plan = pl.plan_code, updated_at = now()
  WHERE id = c.tenant_id;

  IF promo.id IS NOT NULL THEN
    UPDATE public.billing_promotions
    SET redemptions_count = redemptions_count + 1
    WHERE id = promo.id;
  END IF;

  UPDATE public.billing_checkouts
  SET status = 'completed', completed_at = now()
  WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'alreadyActive', false, 'subscriptionId', sub.id);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_activate_checkout(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_activate_checkout(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT)
  TO service_role;

INSERT INTO public.migration_status (migration, note) VALUES (
  '029_atomic_checkout_activation',
  'تفعيل اشتراك Moyasar ومعاملة الفاتورة والمنشأة والـ checkout ضمن معاملة ذرية واحدة'
) ON CONFLICT (migration) DO NOTHING;
