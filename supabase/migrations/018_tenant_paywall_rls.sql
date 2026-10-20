-- ══════════════════════════════════════════════════════════════════
-- فلسي v18 — القفل النهائي: عزل المنشآت + لا بيانات بدون اشتراك
-- ══════════════════════════════════════════════════════════════════
-- لماذا؟ صفحة الدفع في الواجهة وحدها يمكن تجاوزها (أي شخص يقدر
-- يستدعي Supabase API مباشرة بجلسته). هذا الملف يجعل قاعدة البيانات
-- نفسها ترفض أي قراءة/كتابة لبيانات المحل إذا:
--   • الصف لا يتبع منشأة المستخدم (يُغلق تسريب البيانات بين العملاء
--     الناتج عن سياسات USING (true) القديمة)، أو
--   • المنشأة بدون اشتراك فعّال.
--
-- السياسات هنا RESTRICTIVE: تُضاف "AND" فوق كل السياسات الموجودة،
-- فلا تحتاج حذف السياسات القديمة. تنطبق على authenticated فقط —
-- المنيو العام (anon) و service_role (لوحة المالك/الدوال) لا تتأثر.
--
-- ⚠️ قبل التشغيل: نفّذ الخطوة اليدوية في آخر 017 (ربط حسابك بالمنشأة
-- الافتراضية + اشتراكها)، وإلا ستختفي بياناتك من حسابك (لن تُحذف).
-- للتراجع: شغّل الجزء المعلّق في آخر هذا الملف.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_paid_tenant_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tu.tenant_id FROM public.tenant_users tu
  JOIN public.tenant_subscriptions s ON s.tenant_id = tu.tenant_id
  WHERE tu.auth_id = auth.uid() AND tu.is_active
    AND s.status IN ('active', 'trialing') AND s.current_period_end > now();
$$;
REVOKE ALL ON FUNCTION public.current_paid_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_paid_tenant_ids() TO authenticated;

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
    'supplier_balances', 'webhooks', 'integration_connections', 'cost_centers',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS paid_tenant_guard ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY paid_tenant_guard ON public.%I AS RESTRICTIVE
           FOR ALL TO authenticated
           USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
           WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()))', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '018_tenant_paywall_rls',
  'سياسات RESTRICTIVE: عزل المنشآت + اشتراط اشتراك فعّال على كل جداول بيانات المحل.'
) ON CONFLICT (migration) DO NOTHING;

-- ── للتراجع عند الحاجة ─────────────────────────────────────────
-- DO $$ DECLARE r RECORD; BEGIN
--   FOR r IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='paid_tenant_guard' LOOP
--     EXECUTE format('DROP POLICY paid_tenant_guard ON public.%I', r.tablename);
--   END LOOP;
-- END $$;
