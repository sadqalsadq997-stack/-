-- ══════════════════════════════════════════════════════════════════
-- فلسي v19 — الأسعار الجديدة: أساسي 29 · احترافي 59 · مؤسسي 119 ر.س/شهر
-- ══════════════════════════════════════════════════════════════════
-- كل تغيير سعر = نسخة جديدة (version + 1) والنسخة القديمة تتعطّل.
-- المشتركون الحاليون يُنقلون للسعر الجديد لأنه أرخص (حتى لا يدفع
-- العميل القديم أكثر من الجديد).
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_new UUID;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('starter',    'الأساسي',   29::NUMERIC, '["فرع واحد وكاشير واحد","نقطة بيع كاملة + فواتير ZATCA","المنتجات والمخزون","البيجر الإلكتروني بالباركود","تقارير المبيعات اليومية","دعم فني عبر الواتساب"]'::JSONB),
      ('pro',        'الاحترافي', 59::NUMERIC, '["حتى 3 فروع وكاشيرات بلا حد","كل مزايا الأساسي","الطاولات وشاشة المطبخ","متجر إلكتروني ومنيو QR","بطاقة الولاء في محفظة الجوال","المحاسبة والمصروفات والموردين","المساعد الذكي","دومين مخصص مجاناً"]'::JSONB),
      ('enterprise', 'المؤسسي',   119::NUMERIC, '["فروع غير محدودة","كل مزايا الاحترافي","صلاحيات متقدمة لكل موظف","تقارير مالية مجمّعة للفروع","ربط API مع أنظمتك","مدير حساب مخصص","تدريب فريقك مجاناً"]'::JSONB)
    ) AS t(code, name_ar, price, features)
  LOOP
    -- لا تُنشئ نسخة جديدة إذا السعر الحالي نفسه
    IF EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_code = r.code AND is_active AND price_monthly = r.price) THEN
      CONTINUE;
    END IF;

    UPDATE public.billing_plans SET is_active = false WHERE plan_code = r.code AND is_active;

    INSERT INTO public.billing_plans (plan_code, version, name_ar, price_monthly, features, is_active)
    VALUES (r.code,
            COALESCE((SELECT MAX(version) FROM public.billing_plans WHERE plan_code = r.code), 0) + 1,
            r.name_ar, r.price, r.features, true)
    RETURNING id INTO v_new;

    -- نقل المشتركين الحاليين للسعر الأرخص (بدون المساس بفترات العروض)
    UPDATE public.tenant_subscriptions s
    SET billing_plan_id = v_new,
        next_charge_amount = LEAST(s.next_charge_amount, r.price),
        updated_at = now()
    FROM public.billing_plans old
    WHERE old.id = s.billing_plan_id AND old.plan_code = r.code
      AND s.trial_periods_remaining = 0
      AND s.status IN ('active', 'trialing', 'past_due');
  END LOOP;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '019_new_pricing', 'أسعار جديدة 29/59/119 ر.س شهرياً'
) ON CONFLICT (migration) DO NOTHING;
