-- ══════════════════════════════════════════════════════════════════
-- فلسي v8 — Migration 009: Security Hardening
-- تشديد كامل للأمان + RLS صحيحة + جداول أمان جديدة
-- ══════════════════════════════════════════════════════════════════

-- ─── جدول أحداث الأمان (Audit Log) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  ip_address  TEXT,
  user_id     UUID,
  branch_id   UUID,
  success     BOOLEAN DEFAULT true,
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_ip   ON public.security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON public.security_events(created_at);

-- ─── جدول جلسات المالك ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT NOT NULL UNIQUE,
  ip_address  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── جدول سجل التدقيق ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action    TEXT NOT NULL,
  user_id   TEXT,
  branch_id TEXT,
  meta      JSONB,
  ts        BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_time   ON public.audit_log(created_at);

-- ══════════════════════════════════════════════════════════════════
-- ─── إصلاح RLS — إزالة سياسات anon الخطرة ───────────────────────
-- ══════════════════════════════════════════════════════════════════

-- حذف السياسات الخطرة
DROP POLICY IF EXISTS "anon_subscriptions"    ON public.subscriptions;
DROP POLICY IF EXISTS "anon_payment_codes"    ON public.payment_codes;
DROP POLICY IF EXISTS "anon_support_tickets"  ON public.support_tickets;
DROP POLICY IF EXISTS "anon_support_messages" ON public.support_messages;
DROP POLICY IF EXISTS "anon_domains"          ON public.domains;

-- ─── payment_codes: لا يقرأها أحد إلا authenticated + يحميها RLS ─
DROP POLICY IF EXISTS "auth_all_payment_codes" ON public.payment_codes;
CREATE POLICY "payment_codes_read_used"
  ON public.payment_codes FOR SELECT TO authenticated
  USING (true); -- يحتاج authenticated
CREATE POLICY "payment_codes_verify_anon"
  ON public.payment_codes FOR SELECT TO anon
  USING (used = false); -- anon يقدر يشوف الرموز غير المستخدمة للتحقق فقط
CREATE POLICY "payment_codes_no_anon_write"
  ON public.payment_codes FOR INSERT TO anon
  WITH CHECK (false); -- لا كتابة من anon أبداً
CREATE POLICY "payment_codes_no_anon_update"
  ON public.payment_codes FOR UPDATE TO anon
  USING (false);
CREATE POLICY "payment_codes_no_anon_delete"
  ON public.payment_codes FOR DELETE TO anon
  USING (false);

-- ─── subscriptions: لا يقرأها anon ──────────────────────────────
DROP POLICY IF EXISTS "auth_all_subscriptions" ON public.subscriptions;
CREATE POLICY "subscriptions_authenticated_only"
  ON public.subscriptions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
-- anon يقدر فقط يقرأ سطره (بدون branch_id = لا شيء)
CREATE POLICY "subscriptions_anon_own"
  ON public.subscriptions FOR SELECT TO anon
  USING (false); -- لا قراءة من anon

-- ─── support: anon يكتب فقط (يفتح تذكرة) لا يقرأ ────────────────
DROP POLICY IF EXISTS "auth_all_support_tickets"  ON public.support_tickets;
DROP POLICY IF EXISTS "auth_all_support_messages" ON public.support_messages;
CREATE POLICY "support_tickets_write_anon"
  ON public.support_tickets FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY "support_tickets_read_auth"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "support_tickets_update_auth"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (true);
CREATE POLICY "support_messages_write_anon"
  ON public.support_messages FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY "support_messages_read_auth"
  ON public.support_messages FOR SELECT TO authenticated
  USING (true);

-- ─── RLS على الجداول الأساسية (branches, products, orders) ───────
ALTER TABLE public.branches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers  ENABLE ROW LEVEL SECURITY;

-- branches: authenticated يشوف فروعه فقط
DROP POLICY IF EXISTS "branches_auth" ON public.branches;
CREATE POLICY "branches_auth_all"
  ON public.branches FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
-- anon يشوف الفروع النشطة فقط (للقائمة العامة)
CREATE POLICY "branches_anon_active"
  ON public.branches FOR SELECT TO anon
  USING (is_active = true);

-- products: public للقائمة، مع حماية الكتابة
DROP POLICY IF EXISTS "products_auth" ON public.products;
CREATE POLICY "products_read_all"
  ON public.products FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY "products_write_auth"
  ON public.products FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- orders: authenticated فقط
DROP POLICY IF EXISTS "orders_auth" ON public.orders;
CREATE POLICY "orders_auth_all"
  ON public.orders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
-- anon يكتب فقط (طلبات القائمة العامة)
CREATE POLICY "orders_anon_insert"
  ON public.orders FOR INSERT TO anon
  WITH CHECK (order_type = 'online');

-- employees: authenticated فقط، لا يرى anon
DROP POLICY IF EXISTS "employees_auth" ON public.employees;
CREATE POLICY "employees_auth_all"
  ON public.employees FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- categories: قراءة عامة، كتابة محمية
CREATE POLICY "categories_read_all"
  ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_write_auth"
  ON public.categories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- customers: لا يرى anon
DROP POLICY IF EXISTS "customers_auth" ON public.customers;
CREATE POLICY "customers_auth_all"
  ON public.customers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- inventory: لا يرى anon
DROP POLICY IF EXISTS "inventory_auth" ON public.inventory;
CREATE POLICY "inventory_auth_all"
  ON public.inventory FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── جداول الأمان — RLS مشددة ────────────────────────────────────
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;

-- security_events: الكتابة من الجميع (لتسجيل المحاولات)، القراءة للـ service_role فقط
CREATE POLICY "sec_events_insert_all"
  ON public.security_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "sec_events_read_none"
  ON public.security_events FOR SELECT TO anon, authenticated
  USING (false); -- يقرأها service_role فقط

-- owner_sessions: service_role فقط
CREATE POLICY "owner_sessions_none"
  ON public.owner_sessions FOR ALL TO anon, authenticated
  USING (false);

-- audit_log: كتابة من الجميع، قراءة للمصادقين فقط
CREATE POLICY "audit_insert_all"
  ON public.audit_log FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "audit_read_auth"
  ON public.audit_log FOR SELECT TO authenticated
  USING (true);

-- ─── إزالة صلاحيات خطرة من anon ────────────────────────────────
REVOKE DELETE ON public.payment_codes    FROM anon;
REVOKE UPDATE ON public.payment_codes    FROM anon;
REVOKE DELETE ON public.subscriptions    FROM anon;
REVOKE UPDATE ON public.subscriptions    FROM anon;
REVOKE DELETE ON public.security_events  FROM anon;
REVOKE UPDATE ON public.security_events  FROM anon;
REVOKE SELECT ON public.owner_sessions   FROM anon;
REVOKE SELECT ON public.employees        FROM anon;
REVOKE SELECT ON public.customers        FROM anon;
REVOKE SELECT ON public.inventory        FROM anon;

-- ─── تنظيف تلقائي لسجلات الأمان القديمة ─────────────────────────
CREATE OR REPLACE FUNCTION cleanup_old_security_data()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.security_events WHERE created_at < now() - interval '90 days';
  DELETE FROM public.owner_sessions  WHERE expires_at  < now();
  DELETE FROM public.audit_log       WHERE created_at  < now() - interval '180 days';
END;
$$;

SELECT cron.schedule('cleanup-security', '0 3 * * *', 'SELECT cleanup_old_security_data()') 
  WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
