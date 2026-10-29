-- ══════════════════════════════════════════════════════════════════
-- فلسي v24 — رقم الحساب، الأختام، المرتجعات (إشعار دائن)، فواتير المشتريات
-- للاسترداد الضريبي، الإقرار الضريبي، ثيمات المنيو، وتخفيف حجم البيانات
-- شغّله بعد 023. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0) أداة: تأمين أي جدول منشأة جديد بنفس قواعد 021 (عزل + اشتراك)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_secure_tenant_table(t TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_fill_tenant_id ON public.%I', t);
  EXECUTE format('CREATE TRIGGER trg_fill_tenant_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id()', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_access ON public.%I', t);
  EXECUTE format('CREATE POLICY tenant_access ON public.%I FOR ALL TO authenticated
                  USING (tenant_id IN (SELECT public.current_tenant_ids()))
                  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()))', t);
  EXECUTE format('DROP POLICY IF EXISTS paid_tenant_guard ON public.%I', t);
  EXECUTE format('CREATE POLICY paid_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                  USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
                  WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()))', t);
END $$;
REVOKE ALL ON FUNCTION public.felsy_secure_tenant_table(TEXT) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 1) رقم الحساب (يظهر تحت اسم المنشأة) + رابط المنيو المختصر
-- ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.tenant_account_seq START 100001;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS account_number BIGINT;
UPDATE public.tenants SET account_number = nextval('public.tenant_account_seq') WHERE account_number IS NULL;
ALTER TABLE public.tenants ALTER COLUMN account_number SET DEFAULT nextval('public.tenant_account_seq');
CREATE UNIQUE INDEX IF NOT EXISTS tenants_account_number_uq ON public.tenants(account_number);
UPDATE public.tenants SET slug = account_number::TEXT WHERE slug IS NULL;
CREATE OR REPLACE FUNCTION public.tenant_default_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_number IS NULL THEN NEW.account_number := nextval('public.tenant_account_seq'); END IF;
  IF NEW.slug IS NULL OR NEW.slug = '' THEN NEW.slug := NEW.account_number::TEXT; END IF;
  NEW.slug := lower(regexp_replace(NEW.slug, '[^a-zA-Z0-9-]', '', 'g'));
  IF NEW.slug = '' THEN NEW.slug := NEW.account_number::TEXT; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_default_slug ON public.tenants;
CREATE TRIGGER trg_tenant_default_slug BEFORE INSERT OR UPDATE OF slug ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenant_default_slug();

ALTER TABLE public.tenant_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tenant_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.my_account()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id, 'name', t.name, 'account_number', t.account_number, 'slug', t.slug,
    'role', tu.role, 'plan', bp.name_ar, 'plan_code', bp.plan_code, 'status', s.status,
    'period_end', s.current_period_end, 'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'max_branches', t.max_branches, 'email', (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = t.id
  LEFT JOIN public.billing_plans bp ON bp.id = s.billing_plan_id
  WHERE tu.auth_id = auth.uid() AND tu.is_active
  ORDER BY tu.created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account() TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) أختام الولاء: تُحسب في السيرفر وتظهر للعميل فوراً في بطاقته
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_loyalty_stamps(p_customer UUID, p_count INT DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_req INT; v_new INT;
BEGIN
  IF p_count IS NULL OR p_count < 1 OR p_count > 20 THEN RAISE EXCEPTION 'عدد الأختام غير صحيح'; END IF;
  SELECT * INTO c FROM public.customers
   WHERE id = p_customer AND tenant_id IN (SELECT public.current_paid_tenant_ids()) FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'العميل غير موجود'; END IF;
  SELECT coalesce(d.stamps_required, s.stamps_threshold, 10) INTO v_req
    FROM (SELECT 1) x
    LEFT JOIN public.loyalty_card_designs d ON d.tenant_id = c.tenant_id AND d.is_active AND d.branch_id IS NULL
    LEFT JOIN public.loyalty_settings s ON s.tenant_id = c.tenant_id
   LIMIT 1;
  v_new := coalesce(c.stamps, 0) + p_count;
  UPDATE public.customers SET stamps = v_new, visit_count = coalesce(visit_count, 0) + 1, updated_at = now() WHERE id = c.id;
  UPDATE public.wallet_passes SET stamps = v_new, updated_at = now() WHERE customer_id = c.id AND tenant_id = c.tenant_id;
  RETURN jsonb_build_object('stamps', v_new, 'required', v_req, 'reward_ready', v_new >= v_req);
END $$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_customer UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_req INT;
BEGIN
  SELECT * INTO c FROM public.customers
   WHERE id = p_customer AND tenant_id IN (SELECT public.current_paid_tenant_ids()) FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'العميل غير موجود'; END IF;
  SELECT coalesce(d.stamps_required, s.stamps_threshold, 10) INTO v_req
    FROM (SELECT 1) x
    LEFT JOIN public.loyalty_card_designs d ON d.tenant_id = c.tenant_id AND d.is_active AND d.branch_id IS NULL
    LEFT JOIN public.loyalty_settings s ON s.tenant_id = c.tenant_id LIMIT 1;
  IF coalesce(c.stamps, 0) < v_req THEN RAISE EXCEPTION 'البطاقة لم تكتمل بعد'; END IF;
  UPDATE public.customers SET stamps = c.stamps - v_req, updated_at = now() WHERE id = c.id;
  UPDATE public.wallet_passes SET stamps = c.stamps - v_req, updated_at = now() WHERE customer_id = c.id;
  RETURN jsonb_build_object('stamps', c.stamps - v_req);
END $$;
REVOKE ALL ON FUNCTION public.add_loyalty_stamps(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_loyalty_stamps(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3) updated_at حقيقي (التحديث الخفيف في الواجهة يفحص آخر تغيير فقط)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
ALTER TABLE public.order_pagers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','order_pagers','customers','products','support_tickets'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='updated_at') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_touch_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id, updated_at DESC)', t || '_tenant_updated_idx', t);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4) فهارس للسرعة مع آلاف المنشآت
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_tenant_created_idx   ON public.orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_tenant_status_idx    ON public.orders(tenant_id, status) WHERE status IN ('pending','preparing','ready');
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx  ON public.customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS products_tenant_barcode_idx ON public.products(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx ON public.invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_pagers_live_idx       ON public.order_pagers(tenant_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 5) المرتجعات = إشعار دائن (Credit Note) مرتبط بالفاتورة الأصلية
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2);
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS credit_note_id UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS order_id UUID;
SELECT public.felsy_secure_tenant_table('returns');

CREATE OR REPLACE FUNCTION public.create_return(p_order UUID, p_items JSONB, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD; it JSONB; orig JSONB; v_qty NUMERIC; v_sold NUMERIC; v_prev NUMERIC; v_unit NUMERIC; v_unit_vat NUMERIC;
  v_items JSONB := '[]'::JSONB; v_gross NUMERIC := 0; v_vat NUMERIC := 0; v_num TEXT; v_ret UUID; v_cn UUID;
BEGIN
  SELECT * INTO o FROM public.orders
   WHERE id = p_order AND tenant_id IN (SELECT public.current_paid_tenant_ids()) FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة الأصلية غير موجودة'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'سبب الإرجاع مطلوب (تشترطه هيئة الزكاة في الإشعار الدائن)'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'اختر الأصناف المرتجعة'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    SELECT e INTO orig FROM jsonb_array_elements(o.items) e
     WHERE e->>'product_id' = it->>'product_id' LIMIT 1;
    IF orig IS NULL THEN RAISE EXCEPTION 'صنف غير موجود في الفاتورة الأصلية'; END IF;
    v_sold := coalesce((orig->>'quantity')::NUMERIC, (orig->>'qty')::NUMERIC, 1);
    SELECT coalesce(sum((r->>'quantity')::NUMERIC), 0) INTO v_prev
      FROM public.returns rt, jsonb_array_elements(rt.items) r
     WHERE rt.original_order_id = o.id AND r->>'product_id' = it->>'product_id';
    IF v_prev + v_qty > v_sold THEN RAISE EXCEPTION 'الكمية المرتجعة أكبر من المباعة'; END IF;
    v_unit := coalesce((orig->>'price')::NUMERIC, 0);                         -- شامل الضريبة
    v_unit_vat := coalesce((orig->>'vat')::NUMERIC, round(v_unit - v_unit / 1.15, 2));
    v_items := v_items || jsonb_build_object('product_id', it->>'product_id', 'name', orig->>'name',
                                             'quantity', v_qty, 'price', v_unit, 'total', round(v_unit * v_qty, 2));
    v_gross := v_gross + round(v_unit * v_qty, 2);
    v_vat := v_vat + round(v_unit_vat * v_qty, 2);
  END LOOP;
  IF v_gross <= 0 THEN RAISE EXCEPTION 'لا توجد أصناف مرتجعة'; END IF;

  v_num := 'CN-' || upper(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT));
  INSERT INTO public.invoices (tenant_id, branch_id, invoice_type, original_invoice_id, order_id, invoice_number,
                               items, subtotal, vat_amount, total, reason, zatca_status, uuid)
  VALUES (o.tenant_id, o.branch_id, 'credit_note', o.zatca_invoice_id, o.id, v_num,
          v_items, v_gross - v_vat, v_vat, v_gross, left(p_reason, 300), 'pending', gen_random_uuid()::TEXT)
  RETURNING id INTO v_cn;

  INSERT INTO public.returns (tenant_id, branch_id, return_number, type, status, original_order_id, original_order_number,
                              items, reason, refund_amount, subtotal, vat_amount, credit_note_id, processed_by)
  VALUES (o.tenant_id, o.branch_id, v_num, 'refund', 'completed', o.id, o.order_number,
          v_items, left(p_reason, 300), v_gross, v_gross - v_vat, v_vat, v_cn, auth.uid()::TEXT)
  RETURNING id INTO v_ret;

  RETURN jsonb_build_object('return_id', v_ret, 'credit_note_id', v_cn, 'number', v_num,
                            'total', v_gross, 'vat', v_vat, 'items', v_items, 'original', o.order_number);
END $$;
REVOKE ALL ON FUNCTION public.create_return(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return(UUID, JSONB, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6) فواتير المشتريات (من منشآت أخرى) — ضريبة مدخلات قابلة للاسترداد
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id      UUID,
  supplier_name  TEXT NOT NULL,
  supplier_vat   TEXT CHECK (supplier_vat IS NULL OR supplier_vat ~ '^3[0-9]{13}3$'),
  invoice_number TEXT NOT NULL,
  invoice_date   DATE NOT NULL,
  net_amount     NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
  vat_amount     NUMERIC(12,2) NOT NULL CHECK (vat_amount >= 0),
  total          NUMERIC(12,2) GENERATED ALWAYS AS (net_amount + vat_amount) STORED,
  attachment_url TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_vat, invoice_number)
);
CREATE INDEX IF NOT EXISTS purchase_invoices_tenant_date_idx ON public.purchase_invoices(tenant_id, invoice_date DESC);
SELECT public.felsy_secure_tenant_table('purchase_invoices');

-- ─────────────────────────────────────────────────────────────────
-- 7) الإقرار الضريبي لفترة (نفس خانات إقرار هيئة الزكاة الرئيسية)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vat_return(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (SELECT public.my_tenant_id() AS id),
  s AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(tax_amount), 0) vat, count(*) n
      FROM public.orders, t
     WHERE orders.tenant_id = t.id AND status NOT IN ('cancelled')
       AND created_at >= p_from AND created_at < p_to + 1),
  r AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n
      FROM public.returns, t
     WHERE returns.tenant_id = t.id AND created_at >= p_from AND created_at < p_to + 1),
  p AS (
    SELECT coalesce(sum(net_amount), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n
      FROM public.purchase_invoices, t
     WHERE purchase_invoices.tenant_id = t.id AND invoice_date BETWEEN p_from AND p_to)
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales_net', s.net, 'sales_vat', s.vat, 'sales_count', s.n,
    'returns_net', r.net, 'returns_vat', r.vat, 'returns_count', r.n,
    'purchases_net', p.net, 'purchases_vat', p.vat, 'purchases_count', p.n,
    'output_vat', s.vat - r.vat, 'input_vat', p.vat,
    'net_due', (s.vat - r.vat) - p.vat
  ) FROM s, r, p;
$$;
REVOKE ALL ON FUNCTION public.vat_return(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vat_return(DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 8) المنيو/المتجر: ثيم + لون + رابط مختصر felsy.org/m/<رقم الحساب>
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS menu_theme TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS menu_color TEXT;
DO $$ BEGIN
  ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_menu_theme_chk
    CHECK (menu_theme IN ('fresh','photo','night','minimal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.public_menu_by_slug(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; v_branch UUID; v_menu JSONB; a RECORD;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN NULL; END IF;
  SELECT id INTO v_tenant FROM public.tenants WHERE lower(slug) = lower(p_slug) OR account_number::TEXT = p_slug LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_tenant AND coalesce(is_active, true) ORDER BY created_at LIMIT 1;
  IF v_branch IS NULL THEN RETURN NULL; END IF;
  v_menu := public.public_menu(v_branch, NULL);
  IF v_menu IS NULL THEN RETURN NULL; END IF;
  SELECT business_name, logo_url, menu_theme, menu_color, phone, address, city INTO a
    FROM public.app_settings WHERE tenant_id = v_tenant LIMIT 1;
  RETURN v_menu || jsonb_build_object('business_name', coalesce(a.business_name, (SELECT name FROM public.tenants WHERE id = v_tenant)),
    'logo_url', a.logo_url, 'theme', coalesce(a.menu_theme, 'fresh'), 'color', a.menu_color,
    'phone', a.phone, 'address', a.address, 'city', a.city, 'slug', p_slug);
END $$;
GRANT EXECUTE ON FUNCTION public.public_menu_by_slug(TEXT) TO anon, authenticated;

-- المنيو بالمعرّف يرجع الثيم أيضاً
CREATE OR REPLACE FUNCTION public.public_menu_theme(p_branch UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('theme', coalesce(a.menu_theme, 'fresh'), 'color', a.menu_color,
                            'business_name', coalesce(a.business_name, t.name), 'logo_url', a.logo_url, 'slug', t.slug)
  FROM public.branches b JOIN public.tenants t ON t.id = b.tenant_id
  LEFT JOIN public.app_settings a ON a.tenant_id = b.tenant_id
  WHERE b.id = p_branch LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.public_menu_theme(UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 9) تخفيف حجم البيانات: تنظيف دوري لكل ما هو مؤقت
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_security_data()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.security_events   WHERE created_at < now() - interval '90 days';
  DELETE FROM public.security_events   WHERE event_type = 'ai_request' AND created_at < now() - interval '2 days';
  DELETE FROM public.owner_sessions    WHERE expires_at < now();
  DELETE FROM public.audit_log         WHERE created_at < now() - interval '180 days';
  DELETE FROM public.auth_attempts     WHERE created_at < now() - interval '30 days';
  DELETE FROM public.public_order_rate WHERE created_at < now() - interval '1 day';
  DELETE FROM public.order_pagers      WHERE created_at < now() - interval '7 days';
  IF to_regclass('public.pager_events') IS NOT NULL THEN
    DELETE FROM public.pager_events WHERE triggered_at < now() - interval '30 days'; END IF;
  IF to_regclass('public.kiosk_orders') IS NOT NULL THEN
    UPDATE public.kiosk_orders SET raw_payload = NULL WHERE processed AND raw_payload IS NOT NULL AND received_at < now() - interval '14 days'; END IF;
  IF to_regclass('public.moyasar_webhook_events') IS NOT NULL THEN
    UPDATE public.moyasar_webhook_events SET raw_payload = NULL WHERE processed AND raw_payload IS NOT NULL AND created_at < now() - interval '60 days'; END IF;
  IF to_regclass('public.wallet_notifications') IS NOT NULL THEN
    DELETE FROM public.wallet_notifications WHERE created_at < now() - interval '90 days'; END IF;
  UPDATE public.billing_orders SET status = 'cancelled' WHERE status = 'awaiting_payment' AND created_at < now() - interval '30 days';
END $$;
REVOKE ALL ON FUNCTION public.cleanup_old_security_data() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'felsy-cleanup';
    PERFORM cron.schedule('felsy-cleanup', '17 3 * * *', 'SELECT public.cleanup_old_security_data()');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron غير متاح — فعّله من Database → Extensions ثم أعد تشغيل هذا الملف';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 10) حذف حساب منشأة بالكامل (للسيرفر فقط — بعد تأكيد المالك)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_tenant_data(p_tenant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_users UUID[]; t TEXT;
BEGIN
  SELECT array_agg(auth_id) INTO v_users FROM public.tenant_users WHERE tenant_id = p_tenant;
  -- الجداول القديمة اللي tenant_id فيها بدون ON DELETE CASCADE
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.table_name <> 'tenants'
             AND EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema='public' AND x.table_name=c.table_name AND x.table_type='BASE TABLE')
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', t) USING p_tenant;
  END LOOP;
  DELETE FROM public.tenants WHERE id = p_tenant;
  RETURN jsonb_build_object('users', to_jsonb(coalesce(v_users, ARRAY[]::UUID[])));
END $$;
REVOKE ALL ON FUNCTION public.delete_tenant_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_data(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 11) لوحة المالك: قائمة المشتركين (للسيرفر فقط — service_role)
--     استعلام واحد مع بحث وصفحات ⇒ يتحمل آلاف المنشآت
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_list_tenants(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  WITH base AS (
    SELECT t.id, t.name, t.account_number, t.slug, t.contact_phone, t.created_at, t.max_branches,
           o.auth_id AS owner_id, u.email, u.last_sign_in_at,
           s.status, s.current_period_end, s.cancel_at_period_end, s.billing_mode,
           bp.name_ar AS plan_name, bp.plan_code
      FROM public.tenants t
      LEFT JOIN LATERAL (SELECT auth_id FROM public.tenant_users x WHERE x.tenant_id = t.id AND x.role = 'owner' ORDER BY x.created_at LIMIT 1) o ON true
      LEFT JOIN auth.users u ON u.id = o.auth_id
      LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = t.id
      LEFT JOIN public.billing_plans bp ON bp.id = s.billing_plan_id
     WHERE p_search IS NULL OR p_search = ''
        OR t.account_number::TEXT = trim(p_search)
        OR t.name ILIKE '%' || p_search || '%'
        OR u.email ILIKE '%' || p_search || '%'
        OR (length(regexp_replace(p_search, '\D', '', 'g')) >= 4
            AND t.contact_phone LIKE '%' || right(regexp_replace(p_search, '\D', '', 'g'), 9) || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', coalesce((SELECT jsonb_agg(r) FROM (
       SELECT b.*, (SELECT count(*) FROM public.branches br WHERE br.tenant_id = b.id) AS branches,
              (SELECT coalesce(sum(amount), 0) FROM public.billing_invoices bi WHERE bi.tenant_id = b.id AND bi.status = 'paid') AS paid_total
         FROM base b ORDER BY b.created_at DESC LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)) r), '[]'::JSONB),
    'stats', (SELECT jsonb_build_object(
       'tenants', count(*),
       'active', count(*) FILTER (WHERE s.status IN ('active','trialing') AND s.current_period_end > now()),
       'expiring_7d', count(*) FILTER (WHERE s.status = 'active' AND s.current_period_end BETWEEN now() AND now() + interval '7 days'),
       'cancelling', count(*) FILTER (WHERE s.cancel_at_period_end),
       'new_30d', count(*) FILTER (WHERE t.created_at > now() - interval '30 days'))
       FROM public.tenants t LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = t.id)
  );
$$;
REVOKE ALL ON FUNCTION public.owner_list_tenants(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_tenants(TEXT, INT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 12) التخزين: صور عامة صغيرة فقط + مستندات خاصة
--   media : صور المنتجات/الشعارات (عامة، صور فقط، حد 1MB — الواجهة تضغطها ~80KB)
--   uploads: نفس القيود (شعارات بطاقات الولاء)
--   docs  : صور فواتير المشتريات (خاصة — تُفتح برابط مؤقت لأعضاء المنشأة فقط)
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('media', 'media', true, 1048576, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
           ('uploads', 'uploads', true, 1048576, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
           ('docs', 'docs', false, 2097152, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS felsy_docs_rw ON storage.objects;
    CREATE POLICY felsy_docs_rw ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'docs' AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_tenant_ids() id))
      WITH CHECK (bucket_id = 'docs' AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_paid_tenant_ids() id));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 13) أرشفة الطلبات القديمة (> 13 شهر) إلى Cloudflare R2
--     الدالة archive-orders تكتب ملف JSONL مضغوط لكل منشأة/شهر ثم تحذف
--     الصفوف من القاعدة، ويبقى هنا سطر ملخص واحد (للتقارير والإقرارات القديمة).
--     يحقق متطلب حفظ الفواتير 6 سنوات بدون ما تكبر القاعدة للأبد.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_archives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  orders      INT NOT NULL,
  subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  object_key  TEXT NOT NULL,
  bytes       INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month)
);
SELECT public.felsy_secure_tenant_table('order_archives');
DROP POLICY IF EXISTS tenant_access ON public.order_archives;
CREATE POLICY tenant_access ON public.order_archives FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
REVOKE INSERT, UPDATE, DELETE ON public.order_archives FROM authenticated;

-- المنشآت/الأشهر المستحقة للأرشفة (للسيرفر فقط)
CREATE OR REPLACE FUNCTION public.archive_candidates(p_before DATE, p_limit INT DEFAULT 200)
RETURNS TABLE(tenant_id UUID, month DATE, n BIGINT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.tenant_id, date_trunc('month', o.created_at)::DATE, count(*)
    FROM public.orders o
   WHERE o.created_at < p_before AND o.tenant_id IS NOT NULL
   GROUP BY 1, 2 ORDER BY 2 LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.archive_candidates(DATE, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_candidates(DATE, INT) TO service_role;

GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO authenticated;

INSERT INTO public.migration_status (migration, note) VALUES (
  '024_accounts_returns_vat_scale',
  'رقم حساب، أختام بالسيرفر، مرتجع كإشعار دائن، فواتير مشتريات، إقرار ضريبي، ثيمات المنيو، تنظيف دوري وفهارس.'
) ON CONFLICT (migration) DO NOTHING;
