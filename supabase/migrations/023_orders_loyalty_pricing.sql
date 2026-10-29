-- ══════════════════════════════════════════════════════════════════
-- فلسي v23 — طلبات الاشتراك (بطاقة/تحويل بنكي) + تسعير موحّد + الولاء
-- ══════════════════════════════════════════════════════════════════
-- شغّله بعد 022. آمن للتكرار.
--   1) دالة سعر موحّدة للمنتج (شامل/غير شامل الضريبة) — نفس الحساب في
--      المنيو العام والكاشير (لا فروقات بالهللة)
--   2) تصحيح دوال المنيو العام وبطاقة الولاء (أسماء الأعمدة الحقيقية:
--      base_price / tax_inclusive / tax_rate / customers.stamps)
--   3) بطاقات الولاء: حركة (animation) + ألوان، معزولة لكل منشأة
--   4) طلبات الاشتراك: فروع × مدة × خصم × ضريبة — تُحسب في القاعدة فقط
--   5) التحويل البنكي: إيصال في مخزن خاص + مراجعة واعتماد من المالك
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) سعر المنتج النهائي (بالهللة، بدون أخطاء الكسور العشرية)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_price_parts(p_base NUMERIC, p_tax_inclusive BOOLEAN, p_tax_rate NUMERIC)
RETURNS TABLE (net NUMERIC, vat NUMERIC, gross NUMERIC)
LANGUAGE sql IMMUTABLE AS $$
  WITH r AS (SELECT coalesce(p_base, 0)::NUMERIC AS b, coalesce(p_tax_rate, 15)::NUMERIC / 100 AS t)
  SELECT
    CASE WHEN coalesce(p_tax_inclusive, false) THEN round(b / (1 + t), 2) ELSE round(b, 2) END,
    CASE WHEN coalesce(p_tax_inclusive, false) THEN round(b, 2) - round(b / (1 + t), 2) ELSE round(round(b, 2) * t, 2) END,
    CASE WHEN coalesce(p_tax_inclusive, false) THEN round(b, 2) ELSE round(b, 2) + round(round(b, 2) * t, 2) END
  FROM r;
$$;
GRANT EXECUTE ON FUNCTION public.product_price_parts(NUMERIC, BOOLEAN, NUMERIC) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) المنيو العام (مصحّح)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.strip_private(j JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT j - ARRAY['tenant_id','account_id','cost','cost_price','purchase_price','supplier_id','supplier',
                   'profit','margin','created_by','updated_by','notes_internal','barcode_internal','sku',
                   'stock','stock_quantity','quantity','min_stock','min_stock_alert','track_inventory',
                   'vat_number','cr_number','zatca_vat_number','zatca_seller_name','zatca_invoice_counter',
                   'email','owner_phone','notification_phone','notification_phone_country','notification_sms_sender',
                   'api_key','secret','base_price','carton_price','expiry_date'];
$$;
GRANT EXECUTE ON FUNCTION public.strip_private(JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_menu(p_branch UUID DEFAULT NULL, p_host TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch JSONB;
  v_tenant UUID;
BEGIN
  IF p_branch IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_branch FROM public.branches b WHERE b.id = p_branch AND coalesce(b.is_active, true);
  ELSIF p_host IS NOT NULL AND length(p_host) BETWEEN 3 AND 253 THEN
    SELECT to_jsonb(b) INTO v_branch FROM public.domains d
    JOIN public.branches b ON b.id = d.branch_id
    WHERE lower(d.domain) = lower(regexp_replace(p_host, '^www\.', '')) AND d.is_active
    LIMIT 1;
  END IF;
  IF v_branch IS NULL THEN RETURN NULL; END IF;
  v_tenant := (v_branch->>'tenant_id')::UUID;
  IF v_tenant IS NULL OR NOT public.tenant_is_paid(v_tenant) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'branch', public.strip_private(v_branch),
    'categories', coalesce((
      SELECT jsonb_agg(public.strip_private(to_jsonb(c)) ORDER BY c.sort_order NULLS LAST)
      FROM public.categories c WHERE c.tenant_id = v_tenant AND coalesce(c.is_active, true)), '[]'::JSONB),
    'products', coalesce((
      SELECT jsonb_agg(public.strip_private(to_jsonb(p)) || jsonb_build_object('price', pp.gross)
                       ORDER BY p.sort_order NULLS LAST)
      FROM public.products p
      CROSS JOIN LATERAL public.product_price_parts(p.base_price, p.tax_inclusive, p.tax_rate) pp
      WHERE p.tenant_id = v_tenant AND coalesce(p.is_active, true) AND coalesce(p.show_in_menu, true)), '[]'::JSONB)
  );
END $$;

CREATE OR REPLACE FUNCTION public.public_place_order(p_branch UUID, p_items JSONB, p_phone TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_ip     TEXT := coalesce(public.request_ip(), 'unknown');
  v_items  JSONB := '[]'::JSONB;
  v_net NUMERIC := 0; v_vat NUMERIC := 0; v_gross NUMERIC := 0;
  v_it     JSONB;
  v_prod   RECORD;
  v_qty    INT;
  v_num    TEXT;
BEGIN
  SELECT b.tenant_id INTO v_tenant FROM public.branches b WHERE b.id = p_branch AND coalesce(b.is_active, true);
  IF v_tenant IS NULL OR NOT public.tenant_is_paid(v_tenant) THEN RAISE EXCEPTION 'المتجر غير متاح حالياً'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'السلة غير صالحة';
  END IF;
  IF (SELECT count(*) FROM public.public_order_rate WHERE ip = v_ip AND created_at > now() - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'طلبات كثيرة — حاول بعد قليل';
  END IF;
  IF p_phone IS NOT NULL AND p_phone !~ '^\+?[0-9 ]{7,16}$' THEN RAISE EXCEPTION 'رقم الجوال غير صحيح'; END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := least(greatest(coalesce((v_it->>'qty')::INT, 0), 0), 99);
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT p.id, coalesce(p.name_ar, p.name) AS name, pp.net, pp.vat, pp.gross INTO v_prod
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(p.base_price, p.tax_inclusive, p.tax_rate) pp
    WHERE p.id = (v_it->>'id')::UUID AND p.tenant_id = v_tenant AND coalesce(p.is_active, true);
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'منتج غير متاح'; END IF;
    v_items := v_items || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name,
                                             'price', v_prod.gross, 'quantity', v_qty, 'total', v_prod.gross * v_qty);
    v_net := v_net + v_prod.net * v_qty;
    v_vat := v_vat + v_prod.vat * v_qty;
    v_gross := v_gross + v_prod.gross * v_qty;
  END LOOP;
  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;

  v_num := 'ONL-' || upper(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT));
  INSERT INTO public.orders (tenant_id, branch_id, items, subtotal, tax_amount, total, status, order_type,
                             payment_method, customer_phone, notes, order_number, source)
  VALUES (v_tenant, p_branch, v_items, v_net, v_vat, v_gross, 'pending', 'online', 'cash',
          nullif(trim(p_phone), ''), left(nullif(trim(p_notes), ''), 500), v_num, 'online');

  INSERT INTO public.public_order_rate (ip, branch_id) VALUES (v_ip, p_branch);
  RETURN jsonb_build_object('order_number', v_num, 'total', v_gross);
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3) بطاقات الولاء: حركة + ربط الإعدادات + عزل صارم
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.loyalty_card_designs ADD COLUMN IF NOT EXISTS animation TEXT NOT NULL DEFAULT 'shine';
ALTER TABLE public.loyalty_card_designs ADD COLUMN IF NOT EXISTS accent_color TEXT;
DO $$ BEGIN
  ALTER TABLE public.loyalty_card_designs ADD CONSTRAINT loyalty_animation_chk
    CHECK (animation IN ('none','shine','glow','float','gradient','sparkle','pulse','tilt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.loyalty_card_designs ADD CONSTRAINT loyalty_colors_chk
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$' AND text_color ~ '^#[0-9A-Fa-f]{6}$'
           AND (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'));
EXCEPTION WHEN duplicate_object OR check_violation THEN NULL; END $$;

-- بطاقة العميل لازم تكون من نفس منشأة العميل والتصميم (يمنع خلط عملاء منشأتين)
CREATE OR REPLACE FUNCTION public.wallet_pass_same_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM public.loyalty_card_designs d WHERE d.id = NEW.card_design_id AND d.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'بطاقة الولاء لا تخص هذه المنشأة';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wallet_pass_same_tenant() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_wallet_pass_same_tenant ON public.wallet_passes;
CREATE TRIGGER trg_wallet_pass_same_tenant BEFORE INSERT OR UPDATE OF customer_id, card_design_id, tenant_id
  ON public.wallet_passes FOR EACH ROW EXECUTE FUNCTION public.wallet_pass_same_tenant();

-- تصميم البطاقة = المصدر الوحيد لعدد الطوابع والمكافأة (الكاشير يقرأ loyalty_settings)
CREATE OR REPLACE FUNCTION public.sync_loyalty_settings_from_design()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN RETURN NEW; END IF;
  UPDATE public.loyalty_settings
     SET stamps_threshold = NEW.stamps_required, reward_description = NEW.reward_description,
         card_color_primary = NEW.background_color, logo_url = coalesce(NEW.logo_url, logo_url), updated_at = now()
   WHERE tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN
    INSERT INTO public.loyalty_settings (tenant_id, stamps_threshold, reward_description, card_color_primary, logo_url)
    VALUES (NEW.tenant_id, NEW.stamps_required, NEW.reward_description, NEW.background_color, NEW.logo_url);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_loyalty_settings_from_design() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_loyalty_settings ON public.loyalty_card_designs;
CREATE TRIGGER trg_sync_loyalty_settings AFTER INSERT OR UPDATE ON public.loyalty_card_designs
  FOR EACH ROW EXECUTE FUNCTION public.sync_loyalty_settings_from_design();

-- بطاقة الولاء العامة (/loyalty/:id) — بيانات المنشأة نفسها فقط، بدون جوال أو بريد
CREATE OR REPLACE FUNCTION public.public_loyalty_card(p_customer UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; d RECORD; s RECORD; t TEXT;
BEGIN
  SELECT id, name, stamps, loyalty_points, tenant_id INTO c FROM public.customers WHERE id = p_customer;
  IF c.id IS NULL OR c.tenant_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.loyalty_card_designs
   WHERE tenant_id = c.tenant_id AND is_active ORDER BY (branch_id IS NULL) DESC, updated_at DESC LIMIT 1;
  SELECT * INTO s FROM public.loyalty_settings WHERE tenant_id = c.tenant_id LIMIT 1;
  SELECT name INTO t FROM public.tenants WHERE id = c.tenant_id;
  RETURN jsonb_build_object(
    'first_name', split_part(coalesce(c.name, ''), ' ', 1),
    'stamps', coalesce(c.stamps, 0),
    'points', coalesce(c.loyalty_points, 0),
    'stamps_required', coalesce(d.stamps_required, s.stamps_threshold, 10),
    'program_type', coalesce(d.program_type, 'stamps'),
    'program_name', coalesce(d.program_name, 'برنامج الولاء'),
    'reward_description', coalesce(d.reward_description, s.reward_description, 'مكافأة مجانية'),
    'completion_message', d.completion_message,
    'background_color', coalesce(d.background_color, s.card_color_primary, '#4F7360'),
    'text_color', coalesce(d.text_color, '#ffffff'),
    'accent_color', d.accent_color,
    'animation', coalesce(d.animation, 'shine'),
    'logo_url', coalesce(d.logo_url, s.logo_url),
    'business_name', t
  );
END $$;

DROP FUNCTION IF EXISTS public.get_wallet_pass_by_token(TEXT);
CREATE FUNCTION public.get_wallet_pass_by_token(p_token TEXT)
RETURNS TABLE (pass_id UUID, customer_name TEXT, stamps INTEGER, points INTEGER, program_name TEXT, program_type TEXT,
               stamps_required INTEGER, reward_description TEXT, background_color TEXT, text_color TEXT, accent_color TEXT,
               animation TEXT, logo_url TEXT, completion_emoji_url TEXT, completion_message TEXT, save_url TEXT,
               provider TEXT, business_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT wp.id, split_part(c.name, ' ', 1), wp.stamps, wp.points,
         lcd.program_name, lcd.program_type, lcd.stamps_required, lcd.reward_description,
         lcd.background_color, lcd.text_color, lcd.accent_color, lcd.animation, lcd.logo_url,
         lcd.completion_emoji_url, lcd.completion_message, wp.save_url, wp.provider, t.name
  FROM public.wallet_passes wp
  JOIN public.customers c             ON c.id = wp.customer_id AND c.tenant_id = wp.tenant_id
  JOIN public.loyalty_card_designs lcd ON lcd.id = wp.card_design_id AND lcd.tenant_id = wp.tenant_id
  JOIN public.tenants t               ON t.id = wp.tenant_id
  WHERE wp.qr_token = p_token AND length(p_token) >= 16
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_wallet_pass_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wallet_pass_by_token(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4) الاشتراك: فروع + مدة + خصم + ضريبة
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS included_branches INT NOT NULL DEFAULT 1;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS extra_branch_price NUMERIC(10,2);
UPDATE public.billing_plans SET included_branches = 1,   extra_branch_price = coalesce(extra_branch_price, price_monthly) WHERE plan_code IN ('starter','basic') AND included_branches = 1 AND extra_branch_price IS NULL;
UPDATE public.billing_plans SET included_branches = 3,   extra_branch_price = coalesce(extra_branch_price, price_monthly) WHERE plan_code = 'pro' AND extra_branch_price IS NULL;
UPDATE public.billing_plans SET included_branches = 999, extra_branch_price = 0 WHERE plan_code = 'enterprise' AND extra_branch_price IS NULL;

CREATE TABLE IF NOT EXISTS public.billing_terms (
  months       INT PRIMARY KEY CHECK (months BETWEEN 1 AND 36),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 90),
  label_ar     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO public.billing_terms (months, discount_pct, label_ar) VALUES
  (1, 0, 'شهر'), (6, 10, '6 أشهر'), (12, 20, '12 شهراً')
ON CONFLICT (months) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_config (key TEXT PRIMARY KEY, value NUMERIC NOT NULL);
INSERT INTO public.billing_config (key, value) VALUES ('vat_pct', 15) ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.billing_terms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_terms_public ON public.billing_terms;
CREATE POLICY billing_terms_public ON public.billing_terms FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS billing_config_public ON public.billing_config;
CREATE POLICY billing_config_public ON public.billing_config FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.billing_terms, public.billing_config TO anon, authenticated;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_branches INT;
ALTER TABLE public.tenant_subscriptions ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'recurring';

-- السعر الوحيد المعتمد — الواجهة تعرضه، والسيرفر يحسب الطلب منه
CREATE OR REPLACE FUNCTION public.billing_quote(p_plan_code TEXT, p_branches INT, p_months INT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pl RECORD; tm RECORD;
  v_vat_pct NUMERIC; v_extra INT; v_unlimited BOOLEAN;
  v_monthly NUMERIC; v_sub NUMERIC; v_disc NUMERIC; v_net NUMERIC; v_vat NUMERIC;
BEGIN
  SELECT * INTO pl FROM public.billing_plans WHERE plan_code = p_plan_code AND is_active ORDER BY version DESC LIMIT 1;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'الباقة غير متاحة'; END IF;
  SELECT * INTO tm FROM public.billing_terms WHERE months = p_months AND is_active;
  IF tm.months IS NULL THEN RAISE EXCEPTION 'مدة الاشتراك غير متاحة'; END IF;
  IF p_branches IS NULL OR p_branches < 1 OR p_branches > 100 THEN RAISE EXCEPTION 'عدد الفروع غير صحيح'; END IF;

  SELECT value INTO v_vat_pct FROM public.billing_config WHERE key = 'vat_pct';
  v_vat_pct  := coalesce(v_vat_pct, 15);
  v_unlimited := pl.included_branches >= 999;
  v_extra    := CASE WHEN v_unlimited THEN 0 ELSE greatest(p_branches - pl.included_branches, 0) END;
  v_monthly  := pl.price_monthly + v_extra * coalesce(pl.extra_branch_price, pl.price_monthly);
  v_sub      := round(v_monthly * p_months, 2);
  v_disc     := round(v_sub * tm.discount_pct / 100, 2);
  v_net      := v_sub - v_disc;
  v_vat      := round(v_net * v_vat_pct / 100, 2);

  RETURN jsonb_build_object(
    'plan_id', pl.id, 'plan_code', pl.plan_code, 'plan_name', pl.name_ar,
    'base_monthly', pl.price_monthly, 'included_branches', pl.included_branches, 'unlimited_branches', v_unlimited,
    'branches', p_branches, 'extra_branches', v_extra, 'extra_branch_price', coalesce(pl.extra_branch_price, pl.price_monthly),
    'monthly', v_monthly, 'months', p_months, 'subtotal', v_sub, 'discount_pct', tm.discount_pct,
    'discount', v_disc, 'net', v_net, 'vat_pct', v_vat_pct, 'vat', v_vat, 'total', v_net + v_vat
  );
END $$;
REVOKE ALL ON FUNCTION public.billing_quote(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_quote(TEXT, INT, INT) TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.billing_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       TEXT NOT NULL UNIQUE,
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_id            UUID,
  billing_plan_id    UUID NOT NULL REFERENCES public.billing_plans(id),
  plan_code          TEXT NOT NULL,
  branches           INT NOT NULL,
  months             INT NOT NULL,
  quote              JSONB NOT NULL,
  amount             NUMERIC(10,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'awaiting_payment'
                     CHECK (status IN ('awaiting_payment','pending_review','paid','rejected','cancelled')),
  method             TEXT CHECK (method IN ('card','transfer')),
  moyasar_payment_id TEXT UNIQUE,
  receipt_path       TEXT,
  transfer_sender    TEXT,
  transfer_date      DATE,
  transfer_note      TEXT,
  review_note        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  reviewed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_orders_tenant_idx ON public.billing_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_orders_status_idx ON public.billing_orders(status, created_at DESC);
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_orders FROM anon, authenticated;
GRANT SELECT ON public.billing_orders TO authenticated;
DROP POLICY IF EXISTS billing_orders_read_own ON public.billing_orders;
CREATE POLICY billing_orders_read_own ON public.billing_orders FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));

-- إنشاء طلب (السيرفر فقط)
CREATE OR REPLACE FUNCTION public.billing_create_order(p_tenant UUID, p_auth UUID, p_plan_code TEXT, p_branches INT, p_months INT)
RETURNS public.billing_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q JSONB; r public.billing_orders; v_num TEXT;
BEGIN
  q := public.billing_quote(p_plan_code, p_branches, p_months);
  LOOP
    v_num := 'F-' || upper(substr(md5(gen_random_uuid()::TEXT), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.billing_orders WHERE order_number = v_num);
  END LOOP;
  -- طلب جديد يلغي الطلبات السابقة اللي ما اندفعت (يمنع دفع طلب قديم بسعر قديم)
  UPDATE public.billing_orders SET status = 'cancelled'
   WHERE tenant_id = p_tenant AND status = 'awaiting_payment';
  INSERT INTO public.billing_orders (order_number, tenant_id, auth_id, billing_plan_id, plan_code, branches, months, quote, amount)
  VALUES (v_num, p_tenant, p_auth, (q->>'plan_id')::UUID, q->>'plan_code', p_branches, p_months, q, (q->>'total')::NUMERIC)
  RETURNING * INTO r;
  RETURN r;
END $$;

-- تفعيل الاشتراك بعد الدفع (بطاقة مؤكدة من موياسر، أو تحويل اعتمده المالك)
CREATE OR REPLACE FUNCTION public.billing_activate_order(p_order UUID, p_ref TEXT, p_method TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.billing_orders;
  s RECORD;
  v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_sub UUID;
BEGIN
  SELECT * INTO o FROM public.billing_orders WHERE id = p_order FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF o.status = 'paid' THEN RETURN jsonb_build_object('already', true, 'order_number', o.order_number); END IF;
  IF o.status NOT IN ('awaiting_payment', 'pending_review') THEN RAISE EXCEPTION 'لا يمكن تفعيل هذا الطلب (%)', o.status; END IF;

  SELECT * INTO s FROM public.tenant_subscriptions WHERE tenant_id = o.tenant_id FOR UPDATE;
  v_start := now();
  -- لو عنده اشتراك ساري، المدة الجديدة تبدأ بعد نهايته (ما يخسر أيام)
  IF s.id IS NOT NULL AND s.status IN ('active','trialing') AND s.current_period_end > now() THEN
    v_start := s.current_period_end;
  END IF;
  v_end := v_start + make_interval(months => o.months);

  INSERT INTO public.tenant_subscriptions (tenant_id, billing_plan_id, status, current_period_start, current_period_end,
                                           next_charge_amount, trial_periods_remaining, failed_attempts, last_payment_id,
                                           billing_mode)
  VALUES (o.tenant_id, o.billing_plan_id, 'active', now(), v_end, o.amount, 0, 0, left(p_ref, 120), 'prepaid')
  ON CONFLICT (tenant_id) DO UPDATE SET
    billing_plan_id = EXCLUDED.billing_plan_id, status = 'active', current_period_end = EXCLUDED.current_period_end,
    current_period_start = CASE WHEN public.tenant_subscriptions.current_period_end > now()
                                THEN public.tenant_subscriptions.current_period_start ELSE now() END,
    next_charge_amount = EXCLUDED.next_charge_amount, trial_periods_remaining = 0, failed_attempts = 0,
    last_payment_id = EXCLUDED.last_payment_id, billing_mode = 'prepaid', updated_at = now()
  RETURNING id INTO v_sub;

  INSERT INTO public.billing_invoices (tenant_id, subscription_id, amount, status, moyasar_payment_id,
                                       period_start, period_end, paid_at)
  VALUES (o.tenant_id, v_sub, o.amount, 'paid', CASE WHEN p_method = 'card' THEN left(p_ref, 120) END,
          v_start, v_end, now());

  UPDATE public.billing_orders SET status = 'paid', method = p_method, paid_at = now(),
         moyasar_payment_id = CASE WHEN p_method = 'card' THEN left(p_ref, 120) ELSE moyasar_payment_id END
   WHERE id = o.id;

  UPDATE public.tenants SET status = 'active', plan = o.plan_code, updated_at = now(),
         max_branches = CASE WHEN (o.quote->>'unlimited_branches')::BOOLEAN THEN NULL ELSE o.branches END
   WHERE id = o.tenant_id;

  RETURN jsonb_build_object('already', false, 'order_number', o.order_number, 'period_end', v_end);
END $$;

REVOKE ALL ON FUNCTION public.billing_create_order(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_activate_order(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_create_order(UUID, UUID, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_activate_order(UUID, TEXT, TEXT) TO service_role;

-- حد الفروع حسب الاشتراك
CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INT; v_count INT;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_branches INTO v_max FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.branches WHERE tenant_id = NEW.tenant_id AND coalesce(is_active, true);
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'وصلت حد الفروع في اشتراكك (%) — أضف فرعاً من صفحة الاشتراك', v_max;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_branch_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_zz_branch_limit ON public.branches;
CREATE TRIGGER trg_zz_branch_limit BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_limit();

-- ─────────────────────────────────────────────────────────────────
-- 5) إيصالات التحويل: مخزن خاص (غير عام) — كل منشأة في مجلدها
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('receipts', 'receipts', false, 4194304, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 4194304,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS felsy_receipt_upload ON storage.objects;
    CREATE POLICY felsy_receipt_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'receipts'
                  AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_tenant_ids() id));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) البيجر ↔ الطلب في الاتجاهين: "جاهز" من شاشة البيجر يحدّث الطلب في
--    المطبخ، و"تم الاستلام" يقفل الطلب (يتوقف تلقائياً بدون تكرار)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_order_from_pager()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target TEXT;
BEGIN
  IF NEW.order_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_target := CASE NEW.status WHEN 'preparing' THEN 'preparing' WHEN 'ready' THEN 'ready'
                              WHEN 'collected' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' END;
  IF v_target IS NOT NULL THEN
    UPDATE public.orders SET status = v_target
     WHERE id = NEW.order_id AND tenant_id = NEW.tenant_id AND status IS DISTINCT FROM v_target
       AND status NOT IN ('completed', 'cancelled', 'refunded');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_order_from_pager() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_order_from_pager ON public.order_pagers;
CREATE TRIGGER trg_sync_order_from_pager AFTER UPDATE OF status ON public.order_pagers
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_from_pager();

INSERT INTO public.migration_status (migration, note) VALUES (
  '023_orders_loyalty_pricing',
  'طلبات اشتراك (فروع/مدة/خصم/ضريبة) + تحويل بنكي بإيصال + تسعير منتجات موحّد + حركات بطاقات الولاء.'
) ON CONFLICT (migration) DO NOTHING;
