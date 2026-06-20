-- ══════════════════════════════════════════════════════════════════
-- فلسي v15 — Google Wallet: تصميم البطاقة + إصدار البطاقات + عنوان الفرع
-- ══════════════════════════════════════════════════════════════════
-- يعتمد على: 014_multi_tenant_foundation.sql (جدول tenants + tenant_id)
-- كل الجداول هنا multi-tenant من البداية — مصممة لـ آلاف المنشآت
-- على نفس قاعدة البيانات بدون أي تعارض بينها.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) تصميم بطاقة الولاء — واحد لكل منشأة (شعار، ألوان، نوع البرنامج)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_card_designs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id           UUID REFERENCES public.branches(id) ON DELETE SET NULL,

  -- هوية البطاقة
  program_name        TEXT NOT NULL DEFAULT 'برنامج الولاء',
  logo_url            TEXT,                    -- شعار المحل (Google Wallet logo)
  hero_image_url       TEXT,                    -- صورة الغلاف العريضة (اختيارية)
  background_color     TEXT NOT NULL DEFAULT '#dc2626',  -- hex
  text_color            TEXT NOT NULL DEFAULT '#ffffff',

  -- نوع البرنامج: stamps (طوابع) أو points (نقاط)
  program_type          TEXT NOT NULL DEFAULT 'stamps',  -- stamps | points

  -- إعدادات الطوابع (مثال: 3 غسلات + الرابعة مجانًا = stamps_required: 4)
  stamps_required        INTEGER NOT NULL DEFAULT 10,
  reward_description      TEXT DEFAULT 'مكافأة مجانية',

  -- إعدادات النقاط
  points_per_currency_unit NUMERIC(10,2) DEFAULT 1,    -- نقاط لكل ريال
  min_redeem_points         INTEGER DEFAULT 100,

  -- صورة/إيموجي الإكمال (تظهر عند اكتمال البطاقة)
  completion_emoji_url      TEXT,               -- صورة مرفوعة من المدير
  completion_message         TEXT DEFAULT '🎉 تهانينا! اطلب مكافأتك الآن',

  -- معرّفات جوجل والت الخاصة بهذه المنشأة
  google_wallet_class_id     TEXT,              -- issuer_id.tenant_xxx (يُنشأ تلقائياً)
  google_wallet_class_synced  BOOLEAN DEFAULT false,

  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS lcd_tenant_idx ON public.loyalty_card_designs(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- 2) بطاقات Google Wallet المُصدرة فعلياً لكل عميل
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_passes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  card_design_id  UUID NOT NULL REFERENCES public.loyalty_card_designs(id) ON DELETE CASCADE,

  provider        TEXT NOT NULL DEFAULT 'google',   -- google | apple (Apple لاحقاً)
  object_id        TEXT UNIQUE,                       -- issuer_id.object_xxx الفريد بجوجل
  save_url          TEXT,                              -- رابط "Add to Google Wallet"
  qr_token          TEXT UNIQUE NOT NULL,               -- رمز عشوائي يمثل صفحة QR الخاصة بهذا العميل

  status            TEXT NOT NULL DEFAULT 'pending',     -- pending | issued | saved | expired
  stamps            INTEGER NOT NULL DEFAULT 0,
  points            INTEGER NOT NULL DEFAULT 0,

  last_synced_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, customer_id, provider)
);

CREATE INDEX IF NOT EXISTS wp_tenant_idx   ON public.wallet_passes(tenant_id);
CREATE INDEX IF NOT EXISTS wp_customer_idx ON public.wallet_passes(customer_id);
CREATE INDEX IF NOT EXISTS wp_qrtoken_idx  ON public.wallet_passes(qr_token);

-- ─────────────────────────────────────────────────────────────────
-- 3) عنوان الفرع المخصص للإشعارات (SMS/WhatsApp) — لكل فرع عنوان مستقل
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS notification_address      TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS notification_address_ar   TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS notification_sms_sender    TEXT; -- اسم المرسل بالرسائل (Sender ID)
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS notification_phone_country TEXT DEFAULT '+966';

-- ─────────────────────────────────────────────────────────────────
-- 4) سجل إشعارات بطاقة الولاء المُرسلة (تتبّع وعدم تكرار)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_pass_id UUID NOT NULL REFERENCES public.wallet_passes(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL DEFAULT 'sms',  -- sms | whatsapp
  to_phone        TEXT NOT NULL,
  message          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error_message      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wn_tenant_idx ON public.wallet_notifications(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- 5) RLS — عزل كامل بين المنشآت لكل جداول Wallet
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.loyalty_card_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_passes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_lcd ON public.loyalty_card_designs;
CREATE POLICY tenant_isolation_lcd ON public.loyalty_card_designs
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS tenant_isolation_wp ON public.wallet_passes;
CREATE POLICY tenant_isolation_wp ON public.wallet_passes
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

DROP POLICY IF EXISTS tenant_isolation_wn ON public.wallet_notifications;
CREATE POLICY tenant_isolation_wn ON public.wallet_notifications
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

-- صفحة QR العامة (يفتحها العميل من جواله بدون تسجيل دخول) تحتاج SELECT
-- محدود جداً — فقط عبر qr_token الصحيح، وليس عرض كل الجدول.
-- نستخدم RPC بدلاً من فتح SELECT مباشر لـ anon (أكثر أماناً، راجع القسم 6).

-- ─────────────────────────────────────────────────────────────────
-- 6) RPC آمن: يرجع بيانات بطاقة واحدة فقط عن طريق qr_token الصحيح
--    (anon يستخدمه من صفحة /loyalty/:token بدون أي صلاحية أخرى)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_pass_by_token(p_token TEXT)
RETURNS TABLE (
  pass_id               UUID,
  customer_name         TEXT,
  stamps                INTEGER,
  points                INTEGER,
  program_name          TEXT,
  program_type          TEXT,
  stamps_required       INTEGER,
  reward_description    TEXT,
  background_color      TEXT,
  text_color            TEXT,
  logo_url              TEXT,
  completion_emoji_url  TEXT,
  completion_message    TEXT,
  save_url              TEXT,
  provider              TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    wp.id, c.name, wp.stamps, wp.points,
    lcd.program_name, lcd.program_type, lcd.stamps_required, lcd.reward_description,
    lcd.background_color, lcd.text_color, lcd.logo_url,
    lcd.completion_emoji_url, lcd.completion_message,
    wp.save_url, wp.provider
  FROM public.wallet_passes wp
  JOIN public.customers c            ON c.id = wp.customer_id
  JOIN public.loyalty_card_designs lcd ON lcd.id = wp.card_design_id
  WHERE wp.qr_token = p_token
  LIMIT 1;
$$;

-- السماح لأي زائر (anon) باستدعاء هذه الدالة فقط — لا صلاحية SELECT مباشرة على الجداول
GRANT EXECUTE ON FUNCTION public.get_wallet_pass_by_token(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 7) تسجيل حالة الترحيل
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.migration_status (migration, note) VALUES (
  '015_google_wallet',
  'جداول تصميم البطاقة وإصدار Google Wallet + عنوان الفرع للإشعارات، multi-tenant بالكامل.'
) ON CONFLICT (migration) DO NOTHING;
