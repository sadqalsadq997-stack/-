-- ══════════════════════════════════════════════════════════════════
-- فلسي v22 — دليل حسابات مستقل لكل منشأة
-- ══════════════════════════════════════════════════════════════════
-- المشكلة: chart_of_accounts.code كان UNIQUE على مستوى المنصة كلها،
-- فالدليل الافتراضي (20 حساب) موجود للمنشأة الافتراضية فقط، وأي منشأة
-- جديدة تفتح المحاسبة تلقى الدليل فاضي ولا تقدر تضيف نفس الرموز.
-- الحل: الرمز فريد داخل المنشأة فقط + نسخ الدليل الافتراضي لكل منشأة
-- (الحالية والجديدة تلقائياً). شغّله بعد 021. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.chart_of_accounts') IS NULL THEN RETURN; END IF;

  -- 1) فك ربط القيود بالرمز العالمي
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'public.chart_of_accounts'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;

  -- 2) الرمز فريد داخل المنشأة فقط
  FOR r IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'public.chart_of_accounts'::regclass AND c.contype = 'u'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.chart_of_accounts'::regclass AND attname = 'code')]::int2[]
  LOOP
    EXECUTE format('ALTER TABLE public.chart_of_accounts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_tenant_code_uq ON public.chart_of_accounts(tenant_id, code);

-- 3) نسخ الدليل الافتراضي لمنشأة
CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_tenant UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.chart_of_accounts (tenant_id, code, name, name_en, type, parent, is_group, is_active)
  SELECT p_tenant, d.code, d.name, d.name_en, d.type, d.parent, d.is_group, true
  FROM public.chart_of_accounts d
  WHERE d.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND p_tenant <> '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (tenant_id, code) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_chart_of_accounts(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_tenant_created_seed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_chart_of_accounts(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.on_tenant_created_seed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_chart ON public.tenants;
CREATE TRIGGER trg_seed_chart AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.on_tenant_created_seed();

-- 4) المنشآت الحالية
DO $$
DECLARE t UUID;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_chart_of_accounts(t);
  END LOOP;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '022_accounting_per_tenant', 'دليل حسابات مستقل لكل منشأة + نسخ تلقائي للمنشآت الجديدة.'
) ON CONFLICT (migration) DO NOTHING;
