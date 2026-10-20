-- ══════════════════════════════════════════════════════════════════
-- فلسي v17 — إغلاق طرق الدخول بدون دفع + بوابة دفع واحدة (Moyasar)
-- ══════════════════════════════════════════════════════════════════
-- شغّل هذا الملف بعد 016. آمن للتشغيل أكثر من مرة.
--
-- ما يغلقه:
--   1) أي مستخدم كان يقدر يكتب لنفسه اشتراك "active" مباشرة من المتصفح
--      (subscriptions / tenant_subscriptions كانت FOR ALL)
--   2) أي مستخدم كان يقدر يقرأ رموز الدفع غير المستخدمة ويستعملها
--   3) أي مستخدم كان يقدر يضيف نفسه لأي منشأة (tenant_users بدون RLS)
--   4) التحقق من PIN كان يتم في المتصفح بعد تنزيل كل الرموز
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) tenants / tenant_users — كانت بدون RLS إطلاقاً
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_read_own ON public.tenants;
CREATE POLICY tenants_read_own ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS tenant_users_read_own ON public.tenant_users;
CREATE POLICY tenant_users_read_own ON public.tenant_users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());
-- لا INSERT/UPDATE/DELETE من المتصفح — الإنشاء فقط عبر create_my_tenant()

-- ─────────────────────────────────────────────────────────────────
-- 2) نظام رموز الدفع القديم — مقفل بالكامل (لم يعد مستخدماً)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('payment_codes', 'subscriptions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
ALTER TABLE IF EXISTS public.payment_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
-- بدون سياسات = لا قراءة ولا كتابة لـ anon/authenticated (service_role فقط)

-- ─────────────────────────────────────────────────────────────────
-- 3) الاشتراكات والفواتير — قراءة فقط من المتصفح
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_ts ON public.tenant_subscriptions;
DROP POLICY IF EXISTS tenant_subscriptions_read_own ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_read_own ON public.tenant_subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS tenant_isolation_bi ON public.billing_invoices;
DROP POLICY IF EXISTS billing_invoices_read_own ON public.billing_invoices;
CREATE POLICY billing_invoices_read_own ON public.billing_invoices
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));

ALTER TABLE public.moyasar_webhook_events ENABLE ROW LEVEL SECURITY; -- service_role فقط

-- ─────────────────────────────────────────────────────────────────
-- 4) عمليات الدفع المعلّقة (لتأكيد 3D Secure بأمان)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_checkouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_id             UUID NOT NULL,
  billing_plan_id     UUID NOT NULL REFERENCES public.billing_plans(id),
  promotion_id        UUID REFERENCES public.billing_promotions(id) ON DELETE SET NULL,
  amount              NUMERIC(10,2) NOT NULL,
  moyasar_token       TEXT NOT NULL,
  moyasar_payment_id  TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed | amount_mismatch
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_checkouts_tenant_idx ON public.billing_checkouts(tenant_id);
ALTER TABLE public.billing_checkouts ENABLE ROW LEVEL SECURITY; -- service_role فقط

-- ─────────────────────────────────────────────────────────────────
-- 5) دوال آمنة للواجهة
-- ─────────────────────────────────────────────────────────────────

-- هل المنشأة باشتراك فعّال الآن؟
CREATE OR REPLACE FUNCTION public.tenant_is_paid(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_subscriptions s
    WHERE s.tenant_id = p_tenant
      AND s.status IN ('active', 'trialing')
      AND s.current_period_end > now()
  );
$$;

-- حالة الفوترة للمستخدم الحالي (تقرأها PaymentGate)
CREATE OR REPLACE FUNCTION public.my_billing_status()
RETURNS TABLE (tenant_id UUID, tenant_name TEXT, role TEXT, sub_status TEXT, period_end TIMESTAMPTZ, plan_code TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tu.tenant_id, t.name, tu.role, s.status, s.current_period_end, bp.plan_code
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = tu.tenant_id
  LEFT JOIN public.billing_plans bp ON bp.id = s.billing_plan_id
  WHERE tu.auth_id = auth.uid() AND tu.is_active = true
  ORDER BY (s.status IN ('active','trialing') AND s.current_period_end > now()) DESC NULLS LAST, tu.created_at
  LIMIT 1;
$$;

-- إنشاء منشأة جديدة للحساب (مرة واحدة فقط لكل مستخدم)
CREATE OR REPLACE FUNCTION public.create_my_tenant(p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 OR length(p_name) > 80 THEN
    RAISE EXCEPTION 'اسم المنشأة غير صالح';
  END IF;
  SELECT tenant_id INTO v_id FROM public.tenant_users WHERE auth_id = v_uid AND is_active LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.tenants (name, name_ar, status, plan, owner_auth_id, contact_email)
  VALUES (trim(p_name), trim(p_name), 'pending_payment', 'none', v_uid,
          (SELECT email FROM auth.users WHERE id = v_uid))
  RETURNING id INTO v_id;

  INSERT INTO public.tenant_users (tenant_id, auth_id, role) VALUES (v_id, v_uid, 'owner');
  RETURN v_id;
END $$;

-- زيادة عدّاد العرض بشكل ذرّي (للسيرفر فقط)
CREATE OR REPLACE FUNCTION public.increment_promotion_redemption(p_promotion_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.billing_promotions SET redemptions_count = redemptions_count + 1 WHERE id = p_promotion_id;
$$;
REVOKE ALL ON FUNCTION public.increment_promotion_redemption(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promotion_redemption(UUID) TO service_role;

-- ── PIN: التحقق في السيرفر بدل تنزيل كل الرموز للمتصفح ──────────
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id         BIGSERIAL PRIMARY KEY,
  auth_id    UUID NOT NULL,
  success    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_attempts_auth_time_idx ON public.pin_attempts(auth_id, created_at);
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY; -- لا وصول مباشر

CREATE OR REPLACE FUNCTION public.app_pin_status()
RETURNS TABLE (has_settings BOOLEAN, onboarded BOOLEAN, has_admin_pin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*) > 0,
         COALESCE(bool_or(a.onboarded), false),
         COALESCE(bool_or(a.admin_pin IS NOT NULL AND a.admin_pin <> ''), false)
  FROM public.app_settings a
  WHERE a.tenant_id IN (SELECT public.current_tenant_ids())
    AND public.tenant_is_paid(a.tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.verify_app_pin(p_hash TEXT)
RETURNS TABLE (ok BOOLEAN, role TEXT, emp_id UUID, emp_name TEXT, permissions JSONB, branch_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_fails INT;
  v_emp   RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT COUNT(*) INTO v_fails FROM public.pin_attempts
  WHERE auth_id = v_uid AND success = false AND created_at > now() - interval '5 minutes';
  IF v_fails >= 10 THEN RAISE EXCEPTION 'too_many_attempts'; END IF;

  IF p_hash IS NULL OR length(p_hash) <> 64 THEN
    INSERT INTO public.pin_attempts (auth_id, success) VALUES (v_uid, false);
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::UUID; RETURN;
  END IF;

  -- PIN المدير
  IF EXISTS (
    SELECT 1 FROM public.app_settings a
    WHERE a.tenant_id IN (SELECT public.current_tenant_ids())
      AND public.tenant_is_paid(a.tenant_id)
      AND a.admin_pin = p_hash
  ) THEN
    INSERT INTO public.pin_attempts (auth_id, success) VALUES (v_uid, true);
    RETURN QUERY SELECT true, 'admin'::TEXT, NULL::UUID, NULL::TEXT, '{}'::JSONB, NULL::UUID; RETURN;
  END IF;

  -- PIN موظف
  SELECT e.id, e.name, e.role, e.permissions, e.branch_id INTO v_emp
  FROM public.employee_profiles e
  WHERE e.tenant_id IN (SELECT public.current_tenant_ids())
    AND public.tenant_is_paid(e.tenant_id)
    AND e.is_active = true AND e.pin = p_hash
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.pin_attempts (auth_id, success) VALUES (v_uid, true);
    RETURN QUERY SELECT true, COALESCE(v_emp.role, 'employee')::TEXT, v_emp.id, v_emp.name::TEXT,
                        COALESCE(v_emp.permissions::JSONB, '{}'::JSONB), v_emp.branch_id;
    RETURN;
  END IF;

  INSERT INTO public.pin_attempts (auth_id, success) VALUES (v_uid, false);
  RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::UUID;
END $$;

-- تعيين PIN المدير لأول مرة فقط (لا يسمح بالكتابة فوق PIN موجود)
CREATE OR REPLACE FUNCTION public.set_initial_admin_pin(p_hash TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_hash IS NULL OR length(p_hash) <> 64 THEN RAISE EXCEPTION 'invalid_pin'; END IF;

  SELECT tu.tenant_id INTO v_tenant FROM public.tenant_users tu
  WHERE tu.auth_id = v_uid AND tu.is_active AND tu.role IN ('owner', 'admin')
  LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT public.tenant_is_paid(v_tenant) THEN RAISE EXCEPTION 'يتطلب اشتراكاً فعّالاً'; END IF;

  IF EXISTS (SELECT 1 FROM public.app_settings WHERE tenant_id = v_tenant AND admin_pin IS NOT NULL AND admin_pin <> '') THEN
    RAISE EXCEPTION 'رمز PIN مضبوط مسبقاً';
  END IF;

  UPDATE public.app_settings SET admin_pin = p_hash, onboarded = true WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.app_settings (tenant_id, admin_pin, onboarded) VALUES (v_tenant, p_hash, true);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.my_billing_status()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_tenant(TEXT)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_pin_status()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_app_pin(TEXT)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_initial_admin_pin(TEXT)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_billing_status()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_pin_status()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_app_pin(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_initial_admin_pin(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6) تعبئة tenant_id تلقائياً عند الإضافة من الواجهة
--    (الصفحات الحالية لا ترسل tenant_id — هذا يربط كل صف جديد
--     بمنشأة المستخدم تلقائياً بدل ما يضيع أو يُنسب للمنشأة الافتراضية)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.tenant_users
    WHERE auth_id = auth.uid() AND is_active LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'branches', 'categories', 'products', 'customers', 'suppliers',
    'orders', 'stock_items', 'inventory_logs', 'expenses', 'tables_map',
    'shifts', 'employee_profiles', 'loyalty_settings', 'store_products',
    'store_orders', 'app_settings', 'support_tickets', 'domains',
    'chart_of_accounts', 'journal_entries', 'vouchers', 'warehouses',
    'inventory_items', 'inventory_movements', 'customer_balances',
    'supplier_balances', 'webhooks', 'integration_connections', 'cost_centers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_fill_tenant_id ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_fill_tenant_id BEFORE INSERT ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id()', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '017_access_lockdown',
  'قفل كتابة الاشتراكات من المتصفح، إلغاء رموز الدفع، RLS على tenants/tenant_users، PIN بالسيرفر، billing_checkouts لـ 3DS.'
) ON CONFLICT (migration) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- ⚠️ خطوة يدوية مهمة لحسابك أنت (صاحب البيانات الحالية):
-- البيانات القديمة كلها تابعة لـ "المنشأة الافتراضية". اربط حسابك
-- بها وأعطها اشتراكاً، وإلا ستظهر لك صفحة الدفع:
--
--   INSERT INTO public.tenant_users (tenant_id, auth_id, role)
--   VALUES ('00000000-0000-0000-0000-000000000001',
--           (SELECT id FROM auth.users WHERE email = 'بريدك@هنا'), 'owner')
--   ON CONFLICT (tenant_id, auth_id) DO UPDATE SET role = 'owner', is_active = true;
--
--   INSERT INTO public.tenant_subscriptions
--     (tenant_id, billing_plan_id, status, current_period_end, next_charge_amount)
--   SELECT '00000000-0000-0000-0000-000000000001', id, 'active', now() + interval '10 years', 0
--   FROM public.billing_plans WHERE plan_code = 'enterprise' AND is_active ORDER BY version DESC LIMIT 1
--   ON CONFLICT (tenant_id) DO NOTHING;
-- ══════════════════════════════════════════════════════════════════
