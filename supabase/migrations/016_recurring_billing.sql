-- ══════════════════════════════════════════════════════════════════
-- فلسي v16 — محرك الفوترة الدورية (Recurring Billing عبر Moyasar)
-- ══════════════════════════════════════════════════════════════════
-- الهدف: دعم اشتراكات شهرية حقيقية بخصم تلقائي من البطاقة، مع:
--   • عروض ترويجية زمنية (مثل: أول شهرين بـ3 ريال، ثم السعر الكامل)
--   • تغيير الأسعار بمرور الوقت دون التأثير على عقود المشتركين الحاليين
--   • سجل فواتير كامل + إعادة محاولة عند فشل الدفع
--   • ربط مباشر برموز بطاقات Moyasar (tokenization) — لا نخزن أي
--     بيانات بطاقة خام، فقط الرمز (token) الذي يرجعه موياسر.
--
-- يعتمد على: 014_multi_tenant_foundation.sql (جدول tenants)
-- إضافي بالكامل — لا حذف ولا تعديل على subscriptions/subscription_plans
-- القديمين، هما يبقيان للتوافق مع أي كود حالي يعتمد عليهما.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) خطط التسعير — تدعم نسخ تاريخية (لا حذف، فقط is_active)
-- ─────────────────────────────────────────────────────────────────
-- بدل تعديل السعر مباشرة بصف موجود (يغيّر سعر كل من يرجع له أي
-- اشتراك قديم بالخطأ)، كل تغيير سعر = صف جديد بنفس "plan_code"
-- ونسخة (version) أعلى. الاشتراك القائم يحتفظ بمرجع لنسخة السعر
-- التي وافق عليها العميل وقت التسجيل، فلا ينكسر أي عقد قائم.
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code         TEXT NOT NULL,              -- 'starter' | 'pro' | 'enterprise' (ثابت عبر كل النسخ)
  version           INTEGER NOT NULL DEFAULT 1, -- يزيد عند كل تغيير سعر
  name_ar           TEXT NOT NULL,
  price_monthly     NUMERIC(10,2) NOT NULL,     -- السعر الكامل الشهري
  currency          TEXT NOT NULL DEFAULT 'SAR',
  features          JSONB DEFAULT '[]',
  is_active         BOOLEAN NOT NULL DEFAULT true,  -- false = نسخة قديمة، لا تُعرض لمشترك جديد
  effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (plan_code, version)
);

CREATE INDEX IF NOT EXISTS billing_plans_code_idx ON public.billing_plans(plan_code, is_active);

-- ─────────────────────────────────────────────────────────────────
-- 2) عروض ترويجية زمنية (مثل: أول شهرين بـ3 ريال)
--    عرض واحد يمكن ربطه بخطة واحدة أو أكثر، وله حد زمني/عددي.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_promotions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT UNIQUE,                 -- كود ترويجي اختياري (مثل WELCOME2)، أو NULL = عرض تلقائي للجميع
  name_ar           TEXT NOT NULL,
  plan_code         TEXT NOT NULL,                -- الخطة التي يطبّق عليها العرض
  trial_price       NUMERIC(10,2) NOT NULL,         -- السعر خلال فترة العرض (مثال: 3.00)
  trial_period_count INTEGER NOT NULL DEFAULT 1,     -- عدد الفترات (مثال: 2 = شهرين)
  trial_period_unit  TEXT NOT NULL DEFAULT 'month',   -- month | day
  max_redemptions    INTEGER,                          -- حد أقصى لعدد المستخدمين (NULL = لا حد)
  redemptions_count   INTEGER NOT NULL DEFAULT 0,
  valid_from           TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until            TIMESTAMPTZ,                     -- NULL = بلا تاريخ انتهاء
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_promotions_code_idx ON public.billing_promotions(code);

-- ─────────────────────────────────────────────────────────────────
-- 3) اشتراك المنشأة الفعلي — العقد الحالي، مرتبط بنسخة سعر ثابتة
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_plan_id     UUID NOT NULL REFERENCES public.billing_plans(id),
  promotion_id        UUID REFERENCES public.billing_promotions(id) ON DELETE SET NULL,

  status              TEXT NOT NULL DEFAULT 'trialing',
  -- trialing (بفترة العرض) | active (سعر كامل) | past_due (فشل سحب)
  -- | cancelled | suspended

  -- معلومات الدورة الحالية
  current_period_start   TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end      TIMESTAMPTZ NOT NULL,
  next_charge_amount        NUMERIC(10,2) NOT NULL,  -- المبلغ الذي سيُسحب بالدورة القادمة
  trial_periods_remaining     INTEGER NOT NULL DEFAULT 0, -- كم فترة عرض متبقية قبل التحول للسعر الكامل

  -- ربط Moyasar (لا نخزن بيانات بطاقة خام أبداً — فقط الرمز)
  moyasar_token             TEXT,             -- token الخاص ببطاقة العميل المحفوظة
  moyasar_card_brand          TEXT,           -- visa | mastercard | mada ... (للعرض فقط)
  moyasar_card_last_four        TEXT,

  failed_attempts                  INTEGER NOT NULL DEFAULT 0,
  last_payment_id                     TEXT,            -- آخر معرّف دفعة من موياسر
  cancelled_at                          TIMESTAMPTZ,

  created_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id)  -- اشتراك واحد فعّال لكل منشأة في كل وقت
);

CREATE INDEX IF NOT EXISTS tenant_subs_tenant_idx ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_subs_status_idx ON public.tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS tenant_subs_period_end_idx ON public.tenant_subscriptions(current_period_end);

-- ─────────────────────────────────────────────────────────────────
-- 4) سجل الفواتير/المحاولات — كل عملية سحب (ناجحة أو فاشلة) تُسجَّل
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id     UUID NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,

  amount              NUMERIC(10,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'SAR',
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  moyasar_payment_id  TEXT,
  failure_reason      TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_invoices_tenant_idx ON public.billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS billing_invoices_sub_idx    ON public.billing_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS billing_invoices_status_idx ON public.billing_invoices(status);

-- ─────────────────────────────────────────────────────────────────
-- 5) سجل أحداث Webhook من موياسر (للتتبع والتدقيق)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moyasar_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT,
  payment_id    TEXT,
  raw_payload   JSONB,
  processed     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 6) RLS — كل منشأة ترى فقط فواتيرها واشتراكها
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_promotions   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ts ON public.tenant_subscriptions;
CREATE POLICY tenant_isolation_ts ON public.tenant_subscriptions
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS tenant_isolation_bi ON public.billing_invoices;
CREATE POLICY tenant_isolation_bi ON public.billing_invoices
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

-- الخطط والعروض عامة (يقرأها أي زائر ليختار خطة عند التسجيل، لكن لا يعدّلها إلا السيرفر)
DROP POLICY IF EXISTS billing_plans_read_all ON public.billing_plans;
CREATE POLICY billing_plans_read_all ON public.billing_plans
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS billing_promotions_read_all ON public.billing_promotions;
CREATE POLICY billing_promotions_read_all ON public.billing_promotions
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- ─────────────────────────────────────────────────────────────────
-- 7) بيانات أولية — خطط افتراضية مبنية على PaymentGate.jsx الحالي
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.billing_plans (plan_code, version, name_ar, price_monthly, features) VALUES
  ('starter',    1, 'المبتدئ',    99,  '["نقطة بيع واحدة","حتى 500 منتج","تقارير أساسية","دعم فني"]'),
  ('pro',        1, 'الاحترافي',  199, '["3 نقاط بيع","منتجات غير محدودة","تحليلات متقدمة","ذكاء اصطناعي","دعم ذهبي"]'),
  ('enterprise', 1, 'المؤسسي',    499, '["فروع غير محدودة","API كامل","تكامل ZATCA","مدير حساب مخصص","SLA 99.9%"]')
ON CONFLICT (plan_code, version) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 8) دالة مساعدة: ترجع نسخة السعر النشطة الحالية لخطة معيّنة
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_billing_plan(p_plan_code TEXT)
RETURNS public.billing_plans
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.billing_plans
  WHERE plan_code = p_plan_code AND is_active = true
  ORDER BY version DESC LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 9) تسجيل حالة الترحيل
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.migration_status (migration, note) VALUES (
  '016_recurring_billing',
  'خطط تسعير مرنة (versioned)، عروض ترويجية زمنية، اشتراكات بفترة تجريبية، سجل فواتير — جاهز لربط Moyasar.'
) ON CONFLICT (migration) DO NOTHING;
