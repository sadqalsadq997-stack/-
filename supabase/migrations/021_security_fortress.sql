-- ══════════════════════════════════════════════════════════════════
-- فلسي v21 — الحصن الأمني (Security Fortress)
-- ══════════════════════════════════════════════════════════════════
-- شغّله بعد 020. آمن للتشغيل أكثر من مرة. لا يحذف أي بيانات محل.
--
-- ما يغلقه هذا الملف (كلها ثغرات موجودة فعلاً في 007–020):
--   1) الزائر (anon) كان يقدر يستدعي vault_read_secret ويقرأ مفاتيح ZATCA
--      الخاصة، ويستدعي deduct_stock/add_stock على مخزون أي منشأة.
--   2) الزائر كان يقرأ zatca_config / zatca_invoices / zatca_logs، وكل
--      منتجات وفروع وتصنيفات كل المنشآت، ويكتب تذاكر دعم وطلبات لأي منشأة.
--   3) أي مستخدم مسجّل كان يقدر يعدّل أسعار الباقات (billing_plans) والعروض
--      والمدونة وإعدادات النظام وعروض الصفحة الرئيسية.
--   4) جداول بدون tenant_id (kiosk_orders, pager_events, zatca_*, invoices…)
--      كانت مفتوحة لكل المنشآت.
--   5) رموز PIN محفوظة بهاش ثابت الملح ويقرأها المتصفح مع select('*').
--   6) توكن بطاقة العميل في Moyasar محفوظ نصاً عادياً.
--   7) محاولات الدخول غير محدودة لكل جهاز.
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────
-- 0) الجداول "العامة على مستوى المنصة" — لا تُعزل بـ tenant_id
--    (يديرها مالك النظام فقط عبر owner-admin-api بصلاحية service_role)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_platform_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'tenants','tenant_users','tenant_subscriptions','billing_invoices','billing_checkouts',
    'billing_plans','billing_promotions','moyasar_webhook_events','payment_codes','subscriptions',
    'migration_status','security_events','owner_sessions','audit_log','pin_attempts',
    'auth_attempts','secure_pins','public_order_rate','zatca_private_keys',
    'blog_posts','subscription_plans','system_settings','offers','platform_team_members',
    'billing_orders','billing_terms','billing_config'
  ]::TEXT[];
$$;

-- ─────────────────────────────────────────────────────────────────
-- 1) الزائر (anon) لا يملك أي صلاحية مباشرة على أي جدول أو دالة
-- ─────────────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- حذف كل سياسة RLS ممنوحة لـ anon أو PUBLIC (USING true القديمة وغيرها)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2) دوال حساسة: للسيرفر فقط (service_role) — ولا حتى المستخدم المسجّل
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'vault_create_secret','vault_read_secret','vault_delete_secret',
      'cleanup_old_security_data','zatca_cleanup_old_logs','increment_promotion_redemption',
      'zatca_update_last_hash','zatca_next_invoice_counter','get_zatca_branch_summary',
      'felsy_platform_tables'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- دوال يحتاجها المستخدم المسجّل (صريحة، حتى لو كانت ممنوحة سابقاً عبر PUBLIC فقط)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'current_tenant_ids','current_paid_tenant_ids','tenant_is_paid','my_billing_status',
      'create_my_tenant','create_pager','get_active_billing_plan','zatca_validate_vat','zatca_validate_cr')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3) tenant_id لكل جدول بيانات محل كان بدونه (kiosk_orders، pager_events،
--    zatca_*، invoices، support_messages …) + تعبئة تلقائية
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t   TEXT;
  def CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND c.relname <> ALL (public.felsy_platform_tables())
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name=c.relname AND column_name='tenant_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE', t);

    IF t = 'support_messages' THEN
      EXECUTE 'UPDATE public.support_messages m SET tenant_id = st.tenant_id
               FROM public.support_tickets st WHERE st.id = m.ticket_id AND m.tenant_id IS NULL';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=t AND column_name='branch_id') THEN
      EXECUTE format('UPDATE public.%I x SET tenant_id = b.tenant_id
                      FROM public.branches b WHERE b.id = x.branch_id AND x.tenant_id IS NULL', t);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=t AND column_name='order_id') THEN
      EXECUTE format('UPDATE public.%I x SET tenant_id = o.tenant_id
                      FROM public.orders o WHERE o.id = x.order_id AND x.tenant_id IS NULL', t);
    END IF;
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, def);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', t || '_tenant_idx', t);
    RAISE NOTICE 'tenant_id أُضيف إلى %', t;
  END LOOP;
END $$;

-- تعبئة tenant_id تلقائياً (من المستخدم المسجّل، أو من الفرع/الطلب/التذكرة)
CREATE OR REPLACE FUNCTION public.fill_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j JSONB := to_jsonb(NEW);
BEGIN
  IF NEW.tenant_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.tenant_users
    WHERE auth_id = auth.uid() AND is_active ORDER BY created_at LIMIT 1;
  END IF;
  IF NEW.tenant_id IS NULL AND (j ? 'branch_id') AND (j->>'branch_id') IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.branches WHERE id = (j->>'branch_id')::UUID;
  END IF;
  IF NEW.tenant_id IS NULL AND (j ? 'order_id') AND (j->>'order_id') IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.orders WHERE id = (j->>'order_id')::UUID;
  END IF;
  IF NEW.tenant_id IS NULL AND (j ? 'ticket_id') AND (j->>'ticket_id') IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.support_tickets WHERE id = (j->>'ticket_id')::UUID;
  END IF;
  -- المستخدم المسجّل لا يقدر يكتب صفاً باسم منشأة غيره (الحارس في القسم 4 يرفضه أيضاً)
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fill_tenant_id() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4) عزل كامل بين المنشآت + شرط الاشتراك — على كل جداول بيانات المحل
--    (تُكتشف تلقائياً: أي جدول فيه tenant_id وليس من جداول المنصة)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND c.relname <> ALL (public.felsy_platform_tables())
      AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=c.relname AND column_name='tenant_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_fill_tenant_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_fill_tenant_id BEFORE INSERT ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id()', t);

    -- صلاحية أساسية (permissive) — بدونها لا يرى المستخدم شيئاً
    EXECUTE format('DROP POLICY IF EXISTS tenant_access ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_access ON public.%I FOR ALL TO authenticated
                    USING (tenant_id IN (SELECT public.current_tenant_ids()))
                    WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()))', t);

    -- حارس العزل (restrictive): يلغي أثر أي سياسة قديمة USING (true)
    EXECUTE format('DROP POLICY IF EXISTS tenant_guard ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                    USING (tenant_id IN (SELECT public.current_tenant_ids()))
                    WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()))', t);

    -- حارس الاشتراك: الدعم الفني متاح حتى بدون اشتراك
    EXECUTE format('DROP POLICY IF EXISTS paid_tenant_guard ON public.%I', t);
    IF t NOT IN ('support_tickets','support_messages','owner_notifications') THEN
      EXECUTE format('CREATE POLICY paid_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                      USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
                      WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()))', t);
    END IF;
  END LOOP;
END $$;

-- إشعارات المالك: المنشأة تقرأ رسائلها وتعلّمها مقروءة فقط — لا تكتب رسائل
DO $$ BEGIN
  IF to_regclass('public.owner_notifications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS owner_notifications_no_insert ON public.owner_notifications';
    EXECUTE 'CREATE POLICY owner_notifications_no_insert ON public.owner_notifications AS RESTRICTIVE
             FOR INSERT TO authenticated WITH CHECK (false)';
    EXECUTE 'DROP POLICY IF EXISTS owner_notifications_no_delete ON public.owner_notifications';
    EXECUTE 'CREATE POLICY owner_notifications_no_delete ON public.owner_notifications AS RESTRICTIVE
             FOR DELETE TO authenticated USING (false)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5) جداول المنصة: قراءة محددة جداً، والكتابة للسيرفر فقط
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY public.felsy_platform_tables() LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- احذف كل سياسة كتابة/قراءة مفتوحة لـ authenticated
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename=t AND roles @> ARRAY['authenticated']::name[]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- القراءات المسموحة فقط:
CREATE POLICY tenants_read_own ON public.tenants
  FOR SELECT TO authenticated USING (id IN (SELECT public.current_tenant_ids()));
CREATE POLICY tenant_users_read_own ON public.tenant_users
  FOR SELECT TO authenticated USING (auth_id = auth.uid());
CREATE POLICY billing_invoices_read_own ON public.billing_invoices
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT public.current_tenant_ids()));
-- tenant_subscriptions فيها توكن البطاقة → لا قراءة مباشرة إطلاقاً (my_billing_status تكفي)
REVOKE SELECT ON public.tenant_subscriptions FROM authenticated;

CREATE POLICY billing_plans_public ON public.billing_plans
  FOR SELECT TO anon, authenticated USING (is_active = true);
GRANT SELECT ON public.billing_plans TO anon;
-- العروض الترويجية ذات الكود السري لا تظهر لأحد
CREATE POLICY billing_promotions_public ON public.billing_promotions
  FOR SELECT TO authenticated USING (is_active = true AND code IS NULL);

DO $$ BEGIN
  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY blog_posts_public ON public.blog_posts FOR SELECT TO anon, authenticated USING (published = true)';
    EXECUTE 'GRANT SELECT ON public.blog_posts TO anon';
  END IF;
  IF to_regclass('public.subscription_plans') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY subscription_plans_public ON public.subscription_plans FOR SELECT TO anon, authenticated USING (is_active = true)';
    EXECUTE 'GRANT SELECT ON public.subscription_plans TO anon';
  END IF;
  IF to_regclass('public.offers') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY offers_public ON public.offers FOR SELECT TO anon, authenticated USING (is_active = true)';
    EXECUTE 'GRANT SELECT ON public.offers TO anon';
  END IF;
  -- إعدادات النظام: فقط إعداد المساعد الذكي (اسم + شخصية) للمستخدم المسجّل
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY system_settings_public ON public.system_settings FOR SELECT TO authenticated
             USING (key IN (''ai_assistant''))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) مفتاح تشفير البيانات (AES-256) داخل Supabase Vault
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'felsy_data_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'),
                                'felsy_data_key', 'مفتاح تشفير بيانات فلسي الحساسة — لا تحذفه');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.felsy_encrypt(p_plain TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE k TEXT;
BEGIN
  IF p_plain IS NULL OR p_plain = '' OR p_plain LIKE 'enc:v1:%' THEN RETURN p_plain; END IF;
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'felsy_data_key';
  RETURN 'enc:v1:' || encode(extensions.pgp_sym_encrypt(p_plain, k, 'cipher-algo=aes256, s2k-mode=3'), 'base64');
END $$;

CREATE OR REPLACE FUNCTION public.felsy_decrypt(p_cipher TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE k TEXT;
BEGIN
  IF p_cipher IS NULL OR p_cipher NOT LIKE 'enc:v1:%' THEN RETURN p_cipher; END IF;
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'felsy_data_key';
  RETURN extensions.pgp_sym_decrypt(decode(substr(p_cipher, 8), 'base64'), k);
END $$;
REVOKE ALL ON FUNCTION public.felsy_encrypt(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.felsy_decrypt(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.felsy_encrypt(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.felsy_decrypt(TEXT) TO service_role;

-- توكن بطاقة Moyasar يُشفّر تلقائياً عند أي كتابة
CREATE OR REPLACE FUNCTION public.encrypt_moyasar_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.moyasar_token := public.felsy_encrypt(NEW.moyasar_token);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.encrypt_moyasar_token() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_subscriptions','billing_checkouts'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='moyasar_token') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_encrypt_token ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_encrypt_token BEFORE INSERT OR UPDATE OF moyasar_token ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.encrypt_moyasar_token()', t);
      EXECUTE format('UPDATE public.%I SET moyasar_token = moyasar_token
                      WHERE moyasar_token IS NOT NULL AND moyasar_token NOT LIKE ''enc:v1:%%''', t);
    END IF;
  END LOOP;
END $$;

-- السيرفر (billing-run-cycle) يقرأ التوكن مفكوكاً عبر هذه الدالة فقط
CREATE OR REPLACE FUNCTION public.billing_card_token(p_subscription UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.felsy_decrypt(moyasar_token) FROM public.tenant_subscriptions WHERE id = p_subscription;
$$;
REVOKE ALL ON FUNCTION public.billing_card_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_card_token(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 7) رموز PIN: تنتقل لخزنة مقفلة بـ bcrypt (ملح عشوائي لكل رمز)
--    الأعمدة القديمة تبقى فقط علامة "set" — المتصفح لا يرى أي هاش
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.secure_pins (
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('admin','employee')),
  subject_id   UUID NOT NULL,             -- tenant_id للمدير، employee id للموظف
  pin_hash     TEXT NOT NULL,             -- bcrypt( PBKDF2(PIN) )
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS secure_pins_tenant_idx ON public.secure_pins(tenant_id);
ALTER TABLE public.secure_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.secure_pins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_pin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_val TEXT;
  v_subject UUID;
  v_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'app_settings' THEN
    v_val := NEW.admin_pin; v_type := 'admin'; v_subject := NEW.tenant_id;
  ELSE
    v_val := NEW.pin; v_type := 'employee'; v_subject := NEW.id;
  END IF;

  IF v_val IS NOT NULL AND v_val ~ '^[0-9a-f]{64}$' AND v_subject IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.secure_pins (tenant_id, subject_type, subject_id, pin_hash, updated_at)
    VALUES (NEW.tenant_id, v_type, v_subject, extensions.crypt(v_val, extensions.gen_salt('bf', 10)), now())
    ON CONFLICT (subject_type, subject_id)
    DO UPDATE SET pin_hash = EXCLUDED.pin_hash, tenant_id = EXCLUDED.tenant_id, updated_at = now();
    v_val := 'set';
  ELSIF v_val IS NOT NULL AND v_val ~ '^[0-9]{3,8}$' THEN
    v_val := NULL;  -- رمز نصي قديم غير مشفّر — لا يُحفظ أبداً
  END IF;

  IF TG_TABLE_NAME = 'app_settings' THEN NEW.admin_pin := v_val; ELSE NEW.pin := v_val; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_pin() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='admin_pin') THEN
    DROP TRIGGER IF EXISTS trg_zz_capture_pin ON public.app_settings;
    CREATE TRIGGER trg_zz_capture_pin BEFORE INSERT OR UPDATE OF admin_pin, tenant_id ON public.app_settings
      FOR EACH ROW EXECUTE FUNCTION public.capture_pin();
    UPDATE public.app_settings SET admin_pin = admin_pin WHERE admin_pin IS NOT NULL AND admin_pin <> 'set';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_profiles' AND column_name='pin') THEN
    DROP TRIGGER IF EXISTS trg_zz_capture_pin ON public.employee_profiles;
    CREATE TRIGGER trg_zz_capture_pin BEFORE INSERT OR UPDATE OF pin ON public.employee_profiles
      FOR EACH ROW EXECUTE FUNCTION public.capture_pin();
    UPDATE public.employee_profiles SET pin = pin WHERE pin IS NOT NULL AND pin <> 'set';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 8) محاولات الدخول: 10 محاولات خاطئة لكل جهاز ثم قفل 30 دقيقة
--    + سقف للحساب نفسه (20) وللـ IP (50) حتى لو غيّر المهاجم الجهاز
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,              -- password | pin | owner
  device_hash  TEXT NOT NULL,
  ip           TEXT,
  subject_hash TEXT,                       -- هاش البريد/الحساب — لا نخزن البريد نفسه
  success      BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_device_idx  ON public.auth_attempts(kind, device_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_subject_idx ON public.auth_attempts(kind, subject_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx      ON public.auth_attempts(kind, ip, created_at DESC);
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_guard_check(p_kind TEXT, p_device TEXT, p_ip TEXT, p_subject TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  win      CONSTANT INTERVAL := interval '30 minutes';
  dev_max  CONSTANT INT := 10;
  -- PIN: كل أجهزة المحل تشترك بنفس الحساب ونفس الـ IP، فالسقف أعلى حتى
  -- ما ينقفل المحل كامل بسبب أخطاء طبيعية — الحد الأساسي يبقى 10 لكل جهاز
  sub_max  INT := CASE WHEN p_kind = 'pin' THEN 60  ELSE 20 END;
  ip_max   INT := CASE WHEN p_kind = 'pin' THEN 120 ELSE 50 END;
  v_last_ok TIMESTAMPTZ;
  v_dev INT; v_sub INT := 0; v_ip INT := 0;
  v_oldest TIMESTAMPTZ;
BEGIN
  SELECT max(created_at) INTO v_last_ok FROM public.auth_attempts
  WHERE kind = p_kind AND device_hash = p_device AND success;

  SELECT count(*), min(created_at) INTO v_dev, v_oldest FROM public.auth_attempts
  WHERE kind = p_kind AND device_hash = p_device AND NOT success
    AND created_at > greatest(now() - win, coalesce(v_last_ok, '-infinity'));

  IF p_subject IS NOT NULL THEN
    SELECT count(*) INTO v_sub FROM public.auth_attempts
    WHERE kind = p_kind AND subject_hash = p_subject AND NOT success AND created_at > now() - win;
  END IF;
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip FROM public.auth_attempts
    WHERE kind = p_kind AND ip = p_ip AND NOT success AND created_at > now() - win;
  END IF;

  RETURN jsonb_build_object(
    'allowed',     v_dev < dev_max AND v_sub < sub_max AND v_ip < ip_max,
    'remaining',   greatest(0, dev_max - v_dev),
    'retry_after', CASE WHEN v_dev >= dev_max THEN extract(epoch FROM (v_oldest + win - now()))::INT
                        ELSE extract(epoch FROM win)::INT END
  );
END $$;

CREATE OR REPLACE FUNCTION public.login_guard_record(p_kind TEXT, p_device TEXT, p_ip TEXT, p_subject TEXT, p_success BOOLEAN)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.auth_attempts (kind, device_hash, ip, subject_hash, success)
  VALUES (p_kind, left(p_device, 128), left(p_ip, 64), left(p_subject, 128), p_success);
  DELETE FROM public.auth_attempts WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.login_guard_check(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_guard_record(TEXT,TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_guard_check(TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_guard_record(TEXT,TEXT,TEXT,TEXT,BOOLEAN) TO service_role;

-- عنوان IP الحقيقي للطلب (من الهيدر الذي يمرره PostgREST)
CREATE OR REPLACE FUNCTION public.request_ip()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT nullif(trim(split_part(coalesce(
    current_setting('request.headers', true)::json ->> 'x-felsy-client-ip',
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
$$;
REVOKE ALL ON FUNCTION public.request_ip() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 9) التحقق من PIN — في السيرفر، bcrypt، و10 محاولات لكل جهاز
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_app_pin_v2(p_hash TEXT, p_device TEXT)
RETURNS TABLE (ok BOOLEAN, role TEXT, emp_id UUID, emp_name TEXT, permissions JSONB,
               branch_id UUID, remaining INT, retry_after INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_dev    TEXT;
  v_guard  JSONB;
  v_tenant UUID;
  v_emp    RECORD;
  v_admin  TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_dev := encode(extensions.digest(coalesce(p_device, 'none') || ':' || v_uid::TEXT, 'sha256'), 'hex');

  v_guard := public.login_guard_check('pin', v_dev, public.request_ip(), v_uid::TEXT);
  IF NOT (v_guard->>'allowed')::BOOLEAN THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::UUID,
                        0, (v_guard->>'retry_after')::INT;
    RETURN;
  END IF;

  SELECT tu.tenant_id INTO v_tenant FROM public.tenant_users tu
  WHERE tu.auth_id = v_uid AND tu.is_active AND public.tenant_is_paid(tu.tenant_id)
  ORDER BY tu.created_at LIMIT 1;

  IF v_tenant IS NOT NULL AND p_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT sp.pin_hash INTO v_admin FROM public.secure_pins sp
    WHERE sp.subject_type = 'admin' AND sp.subject_id = v_tenant;
    IF v_admin IS NOT NULL AND v_admin = extensions.crypt(p_hash, v_admin) THEN
      PERFORM public.login_guard_record('pin', v_dev, public.request_ip(), v_uid::TEXT, true);
      RETURN QUERY SELECT true, 'admin'::TEXT, NULL::UUID, NULL::TEXT, '{}'::JSONB, NULL::UUID, 10, 0;
      RETURN;
    END IF;

    FOR v_emp IN
      SELECT e.id, e.name, e.role, e.permissions, e.branch_id, sp.pin_hash
      FROM public.employee_profiles e
      JOIN public.secure_pins sp ON sp.subject_type = 'employee' AND sp.subject_id = e.id
      WHERE e.tenant_id = v_tenant AND e.is_active = true
    LOOP
      IF v_emp.pin_hash = extensions.crypt(p_hash, v_emp.pin_hash) THEN
        PERFORM public.login_guard_record('pin', v_dev, public.request_ip(), v_uid::TEXT, true);
        RETURN QUERY SELECT true, COALESCE(v_emp.role, 'cashier')::TEXT, v_emp.id, v_emp.name::TEXT,
                            COALESCE(v_emp.permissions::JSONB, '{}'::JSONB), v_emp.branch_id, 10, 0;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.login_guard_record('pin', v_dev, public.request_ip(), v_uid::TEXT, false);
  v_guard := public.login_guard_check('pin', v_dev, public.request_ip(), v_uid::TEXT);
  RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::UUID,
                      (v_guard->>'remaining')::INT,
                      CASE WHEN (v_guard->>'allowed')::BOOLEAN THEN 0 ELSE (v_guard->>'retry_after')::INT END;
END $$;
REVOKE ALL ON FUNCTION public.verify_app_pin_v2(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_app_pin_v2(TEXT, TEXT) TO authenticated;

-- النسخة القديمة (للأجهزة اللي فيها نسخة قديمة من الموقع) تمر بنفس الحماية
CREATE OR REPLACE FUNCTION public.verify_app_pin(p_hash TEXT)
RETURNS TABLE (ok BOOLEAN, role TEXT, emp_id UUID, emp_name TEXT, permissions JSONB, branch_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT v.ok, v.role, v.emp_id, v.emp_name, v.permissions, v.branch_id
  FROM public.verify_app_pin_v2(p_hash, 'legacy') v;
$$;
REVOKE ALL ON FUNCTION public.verify_app_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_app_pin(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.app_pin_status()
RETURNS TABLE (has_settings BOOLEAN, onboarded BOOLEAN, has_admin_pin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(a.*) > 0,
         COALESCE(bool_or(a.onboarded), false),
         EXISTS (SELECT 1 FROM public.secure_pins sp
                 WHERE sp.subject_type = 'admin'
                   AND sp.subject_id IN (SELECT public.current_paid_tenant_ids()))
  FROM public.app_settings a
  WHERE a.tenant_id IN (SELECT public.current_paid_tenant_ids());
$$;
REVOKE ALL ON FUNCTION public.app_pin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_pin_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_initial_admin_pin(p_hash TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_pin'; END IF;

  SELECT tu.tenant_id INTO v_tenant FROM public.tenant_users tu
  WHERE tu.auth_id = v_uid AND tu.is_active AND tu.role IN ('owner', 'admin')
  ORDER BY tu.created_at LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT public.tenant_is_paid(v_tenant) THEN RAISE EXCEPTION 'يتطلب اشتراكاً فعّالاً'; END IF;
  IF EXISTS (SELECT 1 FROM public.secure_pins WHERE subject_type = 'admin' AND subject_id = v_tenant) THEN
    RAISE EXCEPTION 'رمز PIN مضبوط مسبقاً';
  END IF;

  UPDATE public.app_settings SET admin_pin = p_hash, onboarded = true WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.app_settings (tenant_id, admin_pin, onboarded) VALUES (v_tenant, p_hash, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_initial_admin_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_initial_admin_pin(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 10) المخزون: الدوال تتأكد أن المنتج والمستودع من منشأة المستخدم
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.inventory_items') IS NOT NULL THEN
    EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.deduct_stock(p_product_id UUID, p_warehouse_id UUID, p_quantity NUMERIC, p_invoice_id TEXT)
    RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $b$
    BEGIN
      IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100000 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
      UPDATE public.inventory_items SET quantity = quantity - p_quantity, updated_at = now()
      WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
      INSERT INTO public.inventory_movements (product_id, warehouse_id, quantity, type, reference_id)
      VALUES (p_product_id, p_warehouse_id, -p_quantity, 'sale', p_invoice_id);
    END $b$;
    $f$;
    EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.add_stock(p_product_id UUID, p_warehouse_id UUID, p_quantity NUMERIC, p_invoice_id TEXT)
    RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $b$
    BEGIN
      IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100000 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
      INSERT INTO public.inventory_items (product_id, warehouse_id, quantity)
      VALUES (p_product_id, p_warehouse_id, p_quantity)
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = public.inventory_items.quantity + EXCLUDED.quantity, updated_at = now();
      INSERT INTO public.inventory_movements (product_id, warehouse_id, quantity, type, reference_id)
      VALUES (p_product_id, p_warehouse_id, p_quantity, 'purchase', p_invoice_id);
    END $b$;
    $f$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.deduct_stock(UUID,UUID,NUMERIC,TEXT) FROM PUBLIC, anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.add_stock(UUID,UUID,NUMERIC,TEXT) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.deduct_stock(UUID,UUID,NUMERIC,TEXT) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.add_stock(UUID,UUID,NUMERIC,TEXT) TO authenticated';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 11) الصفحات العامة: دوال محددة بدل فتح الجداول للزائر
-- ─────────────────────────────────────────────────────────────────
-- يحذف الحقول الداخلية من أي صف قبل إرساله للزائر
CREATE OR REPLACE FUNCTION public.strip_private(j JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT j - ARRAY['tenant_id','cost','cost_price','purchase_price','supplier_id','supplier',
                   'profit','margin','created_by','updated_by','notes_internal','barcode_internal',
                   'stock','stock_quantity','quantity','min_stock','sku_internal','vat_number','cr_number',
                   'email','owner_phone','notification_phone','notification_phone_country','api_key','secret'];
$$;

-- المنيو العام: فرع واحد بالمعرّف، أو بالدومين المربوط
CREATE OR REPLACE FUNCTION public.public_menu(p_branch UUID DEFAULT NULL, p_host TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_tenant UUID;
BEGIN
  IF p_branch IS NOT NULL THEN
    SELECT * INTO v_branch FROM public.branches WHERE id = p_branch AND coalesce(is_active, true);
  ELSIF p_host IS NOT NULL AND length(p_host) BETWEEN 3 AND 253 THEN
    SELECT b.* INTO v_branch FROM public.domains d
    JOIN public.branches b ON b.id = d.branch_id
    WHERE lower(d.domain) = lower(regexp_replace(p_host, '^www\.', '')) AND d.is_active
    LIMIT 1;
  END IF;
  IF v_branch.id IS NULL THEN RETURN NULL; END IF;
  v_tenant := v_branch.tenant_id;
  IF NOT public.tenant_is_paid(v_tenant) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'branch', public.strip_private(to_jsonb(v_branch)),
    'categories', coalesce((
      SELECT jsonb_agg(public.strip_private(to_jsonb(c)) ORDER BY (to_jsonb(c)->>'sort_order')::INT NULLS LAST)
      FROM public.categories c WHERE c.tenant_id = v_tenant), '[]'::JSONB),
    'products', coalesce((
      SELECT jsonb_agg(public.strip_private(to_jsonb(p)) ORDER BY (to_jsonb(p)->>'sort_order')::INT NULLS LAST)
      FROM public.products p
      WHERE p.tenant_id = v_tenant AND coalesce(p.is_active, true)
        AND (p.branch_id IS NULL OR p.branch_id = v_branch.id)), '[]'::JSONB)
  );
END $$;

-- حد للطلبات العامة لكل IP (يمنع إغراق المطبخ بطلبات وهمية)
CREATE TABLE IF NOT EXISTS public.public_order_rate (
  id BIGSERIAL PRIMARY KEY, ip TEXT, branch_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_order_rate_idx ON public.public_order_rate(ip, created_at DESC);
ALTER TABLE public.public_order_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_order_rate FROM anon, authenticated;

-- الطلب من المنيو العام: الأسعار تُحسب من القاعدة (لا يقدر الزائر يغيّر السعر)
CREATE OR REPLACE FUNCTION public.public_place_order(p_branch UUID, p_items JSONB, p_phone TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_ip     TEXT := coalesce(public.request_ip(), 'unknown');
  v_items  JSONB := '[]'::JSONB;
  v_total  NUMERIC := 0;
  v_it     JSONB;
  v_prod   RECORD;
  v_qty    INT;
  v_num    TEXT;
  v_id     UUID;
BEGIN
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch AND coalesce(is_active, true);
  IF v_branch.id IS NULL OR NOT public.tenant_is_paid(v_branch.tenant_id) THEN
    RAISE EXCEPTION 'المتجر غير متاح حالياً';
  END IF;
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
    SELECT p.id, coalesce(p.name_ar, p.name) AS name, p.price INTO v_prod
    FROM public.products p
    WHERE p.id = (v_it->>'id')::UUID AND p.tenant_id = v_branch.tenant_id AND coalesce(p.is_active, true)
      AND (p.branch_id IS NULL OR p.branch_id = v_branch.id);
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'منتج غير متاح'; END IF;
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'qty', v_qty);
    v_total := v_total + v_prod.price * v_qty;
  END LOOP;
  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;

  v_num := 'ONL-' || upper(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT));
  INSERT INTO public.orders (tenant_id, branch_id, items, total, status, order_type, payment_method,
                             customer_phone, notes, order_number, source)
  VALUES (v_branch.tenant_id, v_branch.id, v_items, round(v_total, 2), 'pending', 'online', 'cash',
          nullif(trim(p_phone), ''), left(nullif(trim(p_notes), ''), 500), v_num, 'online')
  RETURNING id INTO v_id;

  INSERT INTO public.public_order_rate (ip, branch_id) VALUES (v_ip, v_branch.id);
  DELETE FROM public.public_order_rate WHERE created_at < now() - interval '1 day';
  RETURN jsonb_build_object('order_number', v_num, 'total', round(v_total, 2));
END $$;

-- بطاقة الولاء العامة: الاسم الأول + الطوابع فقط (لا جوال ولا بريد)
CREATE OR REPLACE FUNCTION public.public_loyalty_card(p_customer UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c JSONB; s JSONB; t TEXT;
BEGIN
  SELECT to_jsonb(x) INTO c FROM public.customers x WHERE x.id = p_customer;
  IF c IS NULL THEN RETURN NULL; END IF;
  SELECT to_jsonb(l) INTO s FROM public.loyalty_settings l WHERE l.tenant_id = (c->>'tenant_id')::UUID LIMIT 1;
  SELECT name INTO t FROM public.tenants WHERE id = (c->>'tenant_id')::UUID;
  RETURN jsonb_build_object(
    'first_name', split_part(coalesce(c->>'name', ''), ' ', 1),
    'stamps', coalesce((c->>'loyalty_stamps')::INT, 0),
    'stamps_required', coalesce((s->>'stamps_required')::INT, 10),
    'business_name', t
  );
END $$;

-- محتوى عام للموقع (صفحة "من نحن" فقط)
CREATE OR REPLACE FUNCTION public.public_site_setting(p_key TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT value FROM public.system_settings WHERE key = p_key AND p_key IN ('about_us_content');
$$;

-- صلاحيات الزائر: هذه الدوال فقط
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'public_menu','public_place_order','public_loyalty_card','public_site_setting',
      'pager_public','pager_ack','get_wallet_pass_by_token')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.strip_private(JSONB) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 12) فريق المنصة (لوحة المالك → الفريق) — يُدار من السيرفر فقط
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  role       TEXT NOT NULL DEFAULT 'support',
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_team_members FROM anon, authenticated;

-- جلسات مالك النظام تُربط بالجهاز
ALTER TABLE public.owner_sessions ADD COLUMN IF NOT EXISTS device_hash TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 13) التخزين (Storage): الزائر يقرأ الصور فقط — الرفع للمسجّلين داخل
--     مجلد منشأتهم، والحذف كذلك
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT policyname, cmd FROM pg_policies
           WHERE schemaname='storage' AND tablename='objects'
             AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
             AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;

  DROP POLICY IF EXISTS felsy_tenant_upload ON storage.objects;
  CREATE POLICY felsy_tenant_upload ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('uploads','media')
                AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_paid_tenant_ids() id));
  DROP POLICY IF EXISTS felsy_tenant_update ON storage.objects;
  CREATE POLICY felsy_tenant_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id IN ('uploads','media')
           AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_paid_tenant_ids() id));
  DROP POLICY IF EXISTS felsy_tenant_delete ON storage.objects;
  CREATE POLICY felsy_tenant_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id IN ('uploads','media')
           AND (storage.foldername(name))[1] IN (SELECT id::TEXT FROM public.current_paid_tenant_ids() id));
END $$;

-- دالة تُرجع منشأة المستخدم (للواجهة: مسار رفع الصور)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_users WHERE auth_id = auth.uid() AND is_active ORDER BY created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 14) تنظيف دوري
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_security_data()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.security_events WHERE created_at < now() - interval '90 days';
  DELETE FROM public.owner_sessions  WHERE expires_at < now();
  DELETE FROM public.audit_log       WHERE created_at < now() - interval '180 days';
  DELETE FROM public.auth_attempts   WHERE created_at < now() - interval '30 days';
  DELETE FROM public.public_order_rate WHERE created_at < now() - interval '1 day';
END $$;
REVOKE ALL ON FUNCTION public.cleanup_old_security_data() FROM PUBLIC, anon, authenticated;

INSERT INTO public.migration_status (migration, note) VALUES (
  '021_security_fortress',
  'لا صلاحيات للزائر إلا دوال عامة محددة، عزل كل الجداول، bcrypt للـ PIN، تشفير توكن البطاقة، 10 محاولات لكل جهاز.'
) ON CONFLICT (migration) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- فحص سريع بعد التشغيل (يفترض يرجع صفر صفوف):
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE schemaname='public' AND (roles @> '{anon}' OR roles @> '{public}')
--     AND tablename NOT IN ('billing_plans','blog_posts','subscription_plans','offers');
-- ══════════════════════════════════════════════════════════════════
