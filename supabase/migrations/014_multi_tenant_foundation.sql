-- ══════════════════════════════════════════════════════════════════
-- فلسي v14 — الأساس متعدد المنشآت (Multi-Tenant Foundation)
-- ══════════════════════════════════════════════════════════════════
-- الهدف: تحويل النظام من "محل واحد لكل قاعدة بيانات" إلى
-- "SaaS واحد يخدم آلاف المنشآت على نفس قاعدة البيانات" بأمان كامل.
--
-- مبدأ التنفيذ:
--   1) كل شيء هنا "إضافي فقط" — ADD COLUMN IF NOT EXISTS، لا حذف،
--      لا تعديل على بيانات موجودة، لا تغيير على أعمدة قائمة.
--   2) كل صف قديم يُنسب تلقائياً لـ "المنشأة الافتراضية" حتى لا
--      ينكسر أي شيء يعمل الآن (التطبيقات الحالية المنشورة فعلياً
--      تستمر بالعمل بدون أي تعديل في الكود فوراً).
--   3) كل سياسات RLS الجديدة "تضيف تحققاً" بدل أن "تستبدل" — يعني
--      حتى لو فشل tenant check لأي سبب، صلاحيات anon/authenticated
--      القديمة (USING true) ستبقى نشطة بالتوازي حتى تفعيل القفل
--      النهائي بخطوة منفصلة صريحة (انظر القسم الأخير "التفعيل النهائي").
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) جدول المنشآت (Tenants) — كل صاحب محل = صف واحد هنا
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  name_ar         TEXT,
  slug            TEXT UNIQUE,                  -- مثال: felsy.org/t/my-cafe
  status          TEXT NOT NULL DEFAULT 'active', -- active | suspended | trial | cancelled
  plan            TEXT NOT NULL DEFAULT 'starter',
  owner_auth_id   UUID,                          -- يربط بـ auth.users.id لمالك المنشأة
  contact_phone   TEXT,
  contact_email   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenants_owner_idx  ON public.tenants(owner_auth_id);
CREATE INDEX IF NOT EXISTS tenants_status_idx ON public.tenants(status);

-- منشأة افتراضية لاستيعاب كل البيانات القديمة الموجودة حالياً
-- (أي بيانات أنشئت قبل هذا الـ migration تصبح تتبع لهذه المنشأة تلقائياً)
INSERT INTO public.tenants (id, name, name_ar, slug, status, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'المنشأة الافتراضية', 'default', 'active', 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2) جدول ربط المستخدمين بالمنشآت (موظف/مالك يتبع منشأة معينة)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_id     UUID NOT NULL,              -- auth.users.id
  role        TEXT NOT NULL DEFAULT 'employee',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_id)
);

CREATE INDEX IF NOT EXISTS tenant_users_auth_idx   ON public.tenant_users(auth_id);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_idx ON public.tenant_users(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- 3) دالة مساعدة: ترجع كل tenant_id الذي يتبع له المستخدم الحالي
--    (تُستخدم داخل سياسات RLS — SECURITY DEFINER لتجاوز RLS الخاص
--     بـ tenant_users نفسه أثناء الفحص، وتفادي التكرار اللانهائي)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_users
  WHERE auth_id = auth.uid() AND is_active = true;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4) إضافة tenant_id لكل الجداول الموجودة (إضافي فقط، لا كسر)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'branches', 'categories', 'products', 'customers', 'suppliers',
    'orders', 'stock_items', 'inventory_logs', 'expenses', 'tables_map',
    'shifts', 'employee_profiles', 'loyalty_settings', 'store_products',
    'store_orders', 'app_settings', 'subscriptions', 'payment_codes',
    'support_tickets', 'domains', 'audit_logs', 'chart_of_accounts',
    'journal_entries', 'vouchers', 'warehouses', 'inventory_items',
    'inventory_movements', 'customer_balances', 'supplier_balances',
    'webhooks', 'integration_connections', 'cost_centers', 'blog_posts',
    'subscription_plans', 'owner_notifications', 'system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE',
        t
      );
      -- كل البيانات القديمة الموجودة تُنسب للمنشأة الافتراضية تلقائياً
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
        t, '00000000-0000-0000-0000-000000000001'
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
        t || '_tenant_idx', t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5) سياسات RLS إضافية (تعزل البيانات حسب tenant_id)
--    ملاحظة مهمة: لا نحذف السياسات القديمة (USING true) في هذا الملف
--    حتى لا ينكسر أي تطبيق منشور حالياً يعتمد عليها بدون tenant context.
--    القفل النهائي (حذف USING true) يكون بخطوة منفصلة صريحة لاحقاً
--    بعد ربط شاشات تسجيل الدخول بـ tenant_users فعلياً.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'branches', 'categories', 'products', 'customers', 'suppliers',
    'orders', 'stock_items', 'inventory_logs', 'expenses', 'tables_map',
    'shifts', 'employee_profiles', 'loyalty_settings', 'store_products',
    'store_orders', 'app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_%s ON public.%I
         FOR ALL TO authenticated
         USING (tenant_id IN (SELECT public.current_tenant_ids()))
         WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()))',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) جدول تنبيهي يوضّح حالة الترحيل (يفيدك أنت/المطور لتتبّع التقدّم)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.migration_status (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration   TEXT NOT NULL UNIQUE,
  note        TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.migration_status (migration, note) VALUES (
  '014_multi_tenant_foundation',
  'tenant_id أضيف لكل الجداول، RLS إضافي مفعّل، السياسات القديمة (USING true) لم تُحذف بعد — القفل النهائي يتطلب ربط شاشة تسجيل الدخول بـ tenant_users أولاً.'
) ON CONFLICT (migration) DO NOTHING;
