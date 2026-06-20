-- ══════════════════════════════════════════════════════════════════════════════
-- فلسي v8 — Migration 011: ZATCA Phase 2 Complete Integration
-- هيئة الزكاة والضريبة والجمارك — المرحلة الثانية الكاملة
-- تاريخ: 2026-06-08
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. جدول إعدادات ZATCA لكل فرع (Tenant Isolated)
--    يحتوي على بيانات التسجيل والشهادات لكل منشأة بشكل مستقل
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zatca_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- بيانات المنشأة الأساسية
  business_name         TEXT NOT NULL,
  business_name_ar      TEXT,
  vat_number            TEXT NOT NULL CHECK (vat_number ~ '^3[0-9]{14}$'),
  cr_number             TEXT,
  branch_name           TEXT,
  branch_name_ar        TEXT,
  address_street        TEXT,
  address_building      TEXT,
  address_city          TEXT DEFAULT 'الرياض',
  address_postal        TEXT,
  address_country       TEXT DEFAULT 'SA',
  address_district      TEXT,

  -- بيئة التشغيل
  environment           TEXT NOT NULL DEFAULT 'sandbox'
                        CHECK (environment IN ('sandbox','simulation','production')),

  -- حالة التسجيل
  onboarding_status     TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (onboarding_status IN (
                          'not_started','otp_requested','otp_verified',
                          'csr_generated','compliance_csid_issued',
                          'production_csid_issued','active','failed'
                        )),
  onboarding_error      TEXT,
  onboarding_step       INTEGER DEFAULT 0,

  -- OTP
  otp_request_id        TEXT,      -- request_id من ZATCA
  otp_expires_at        TIMESTAMPTZ,

  -- CSR (Certificate Signing Request)
  -- ملاحظة: المفتاح الخاص يُخزَّن فقط في Supabase Edge Function secrets
  csr_data              TEXT,       -- CSR بصيغة PEM (بدون مفتاح خاص)
  csr_serial            TEXT,       -- رقم تسلسلي للـ CSR

  -- CSID (Compliance CSID)
  csid                  TEXT,       -- الـ CSID المشفّر (Base64)
  csid_secret           TEXT,       -- Secret لـ CSID (مشفّر في قاعدة البيانات)
  csid_expires_at       TIMESTAMPTZ,
  csid_issued_at        TIMESTAMPTZ,

  -- PCSID (Production CSID)
  pcsid                 TEXT,       -- Production CSID
  pcsid_secret          TEXT,       -- Production Secret
  pcsid_expires_at      TIMESTAMPTZ,
  pcsid_issued_at       TIMESTAMPTZ,

  -- تسلسل الفواتير (منعزل لكل فرع)
  invoice_counter       BIGINT NOT NULL DEFAULT 0,
  last_invoice_hash     TEXT,       -- hash آخر فاتورة لسلسلة الـ hash

  -- معلومات الشهادة
  cert_serial           TEXT,
  cert_subject          TEXT,

  -- طوابع زمنية
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE (branch_id)  -- فرع واحد = إعداد ZATCA واحد
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_zatca_config_branch   ON public.zatca_config(branch_id);
CREATE INDEX IF NOT EXISTS idx_zatca_config_vat      ON public.zatca_config(vat_number);
CREATE INDEX IF NOT EXISTS idx_zatca_config_status   ON public.zatca_config(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_zatca_config_env      ON public.zatca_config(environment);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_zatca_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_zatca_config_updated_at ON public.zatca_config;
CREATE TRIGGER trg_zatca_config_updated_at
  BEFORE UPDATE ON public.zatca_config
  FOR EACH ROW EXECUTE FUNCTION update_zatca_config_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. جدول سجل عمليات ZATCA (Audit & Compliance Log)
--    يسجّل جميع العمليات مع ZATCA API للمراجعة والمراقبة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zatca_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID REFERENCES public.branches(id),
  log_type        TEXT NOT NULL
                  CHECK (log_type IN (
                    'otp_request','otp_verify','csr_generate',
                    'csid_issue','pcsid_issue','invoice_report',
                    'invoice_clearance','invoice_cancel','certificate_renew',
                    'api_error','validation_error'
                  )),
  direction       TEXT CHECK (direction IN ('request','response','internal')),
  endpoint        TEXT,
  status_code     INTEGER,
  request_body    JSONB,   -- بيانات الطلب (بدون secrets)
  response_body   JSONB,   -- بيانات الاستجابة
  error_message   TEXT,
  invoice_uuid    UUID,    -- مرتبط بالفاتورة إن وجدت
  duration_ms     INTEGER, -- مدة الطلب بالميلي ثانية
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zatca_logs_branch    ON public.zatca_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_zatca_logs_type      ON public.zatca_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_zatca_logs_time      ON public.zatca_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_zatca_logs_invoice   ON public.zatca_logs(invoice_uuid);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. جدول الفواتير الإلكترونية ZATCA
--    يخزّن الفواتير المرسلة لـ ZATCA مع حالتها وبيانات الامتثال
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zatca_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID NOT NULL REFERENCES public.branches(id),
  order_id              UUID REFERENCES public.orders(id),

  -- بيانات الفاتورة
  invoice_uuid          UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invoice_number        TEXT NOT NULL,
  invoice_type          TEXT NOT NULL DEFAULT 'simplified'
                        CHECK (invoice_type IN ('simplified','standard','credit_note','debit_note')),
  invoice_subtype       TEXT,  -- 0100000 simplified, 0200000 standard
  issue_date            DATE NOT NULL,
  issue_time            TIME NOT NULL DEFAULT CURRENT_TIME,

  -- بيانات المورّد (من zatca_config)
  seller_name           TEXT NOT NULL,
  seller_vat            TEXT NOT NULL,
  seller_cr             TEXT,
  seller_address        TEXT,
  seller_city           TEXT,

  -- بيانات المشتري (للفواتير B2B)
  buyer_name            TEXT,
  buyer_vat             TEXT,
  buyer_cr              TEXT,
  buyer_address         TEXT,

  -- المبالغ
  subtotal              NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_rate              NUMERIC(5,2)  NOT NULL DEFAULT 15,

  -- بنود الفاتورة
  line_items            JSONB,

  -- التوقيع الرقمي وسلسلة الـ Hash
  invoice_hash          TEXT,          -- SHA-256 hash للفاتورة
  previous_invoice_hash TEXT,          -- hash الفاتورة السابقة
  invoice_counter       BIGINT,        -- رقم تسلسلي للفاتورة في الفرع
  digital_signature     TEXT,          -- التوقيع الرقمي (ECDSA)

  -- QR Code
  qr_code               TEXT,          -- QR TLV بصيغة Base64

  -- XML
  xml_document          TEXT,          -- XML الكامل للفاتورة
  xml_hash              TEXT,          -- hash للـ XML

  -- حالة ZATCA
  zatca_status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (zatca_status IN (
                          'pending','reported','cleared',
                          'rejected','cancelled','error'
                        )),
  zatca_submission_id   TEXT,          -- submission ID من ZATCA
  zatca_clearance_stamp TEXT,          -- clearance stamp للفواتير Standard
  zatca_warnings        JSONB,         -- تحذيرات من ZATCA
  zatca_errors          JSONB,         -- أخطاء من ZATCA
  zatca_submitted_at    TIMESTAMPTZ,
  zatca_cleared_at      TIMESTAMPTZ,

  -- حالة الإلغاء
  is_cancelled          BOOLEAN DEFAULT false,
  cancel_reason         TEXT,
  original_invoice_uuid UUID,          -- للإشارة للفاتورة الأصلية في حالة credit note

  -- طوابع زمنية
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zatca_inv_branch    ON public.zatca_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_uuid      ON public.zatca_invoices(invoice_uuid);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_number    ON public.zatca_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_status    ON public.zatca_invoices(zatca_status);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_date      ON public.zatca_invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_order     ON public.zatca_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_zatca_inv_type      ON public.zatca_invoices(invoice_type);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_zatca_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_zatca_invoices_updated_at ON public.zatca_invoices;
CREATE TRIGGER trg_zatca_invoices_updated_at
  BEFORE UPDATE ON public.zatca_invoices
  FOR EACH ROW EXECUTE FUNCTION update_zatca_invoices_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. دالة زيادة عداد الفاتورة بشكل آمن (Atomic Counter)
--    تضمن تسلسلاً صحيحاً وآمناً لأرقام الفواتير
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zatca_next_invoice_counter(p_branch_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter BIGINT;
BEGIN
  UPDATE public.zatca_config
    SET invoice_counter = invoice_counter + 1
    WHERE branch_id = p_branch_id
    RETURNING invoice_counter INTO v_counter;

  IF v_counter IS NULL THEN
    RAISE EXCEPTION 'ZATCA config not found for branch %', p_branch_id;
  END IF;

  RETURN v_counter;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. دالة تحديث hash آخر فاتورة (للسلسلة)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zatca_update_last_hash(
  p_branch_id UUID,
  p_invoice_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.zatca_config
    SET last_invoice_hash = p_invoice_hash
    WHERE branch_id = p_branch_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. إضافة عمود zatca_invoice_id لجدول orders (ربط الطلب بالفاتورة)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='zatca_invoice_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN zatca_invoice_id UUID
      REFERENCES public.zatca_invoices(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='zatca_status'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN zatca_status TEXT DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='orders' AND column_name='invoice_uuid'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN invoice_uuid UUID;
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. إضافة حقول ZATCA لجدول branches (لعرض سريع)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='branches' AND column_name='zatca_enabled'
  ) THEN
    ALTER TABLE public.branches ADD COLUMN zatca_enabled BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='branches' AND column_name='zatca_status'
  ) THEN
    ALTER TABLE public.branches ADD COLUMN zatca_status TEXT DEFAULT 'not_started';
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. إضافة حقول ZATCA لجدول app_settings
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='vat_number'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN vat_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='cr_number'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN cr_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='address'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='city'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN city TEXT DEFAULT 'الرياض';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='phone'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN phone TEXT;
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. View لوحة مراقبة حالة ZATCA (Admin Dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_zatca_dashboard AS
SELECT
  b.id                                AS branch_id,
  b.name                              AS branch_name,
  zc.vat_number,
  zc.environment,
  zc.onboarding_status,
  zc.onboarding_error,
  zc.onboarding_step,
  zc.csid_expires_at,
  zc.pcsid_expires_at,
  zc.invoice_counter,
  zc.updated_at                       AS last_updated,
  -- إحصائيات الفواتير
  COUNT(zi.id)                        AS total_invoices,
  COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'reported')   AS reported_count,
  COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'cleared')    AS cleared_count,
  COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'rejected')   AS rejected_count,
  COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'pending')    AS pending_count,
  COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'error')      AS error_count,
  -- الشهادة
  CASE
    WHEN zc.pcsid_expires_at IS NOT NULL AND zc.pcsid_expires_at < now() + interval '30 days'
      THEN 'expiring_soon'
    WHEN zc.pcsid_expires_at IS NOT NULL AND zc.pcsid_expires_at < now()
      THEN 'expired'
    WHEN zc.onboarding_status = 'active' THEN 'valid'
    ELSE 'not_issued'
  END                                 AS cert_health
FROM public.branches b
LEFT JOIN public.zatca_config  zc ON zc.branch_id = b.id
LEFT JOIN public.zatca_invoices zi ON zi.branch_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, zc.vat_number, zc.environment, zc.onboarding_status,
         zc.onboarding_error, zc.onboarding_step, zc.csid_expires_at,
         zc.pcsid_expires_at, zc.invoice_counter, zc.updated_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS (Row Level Security) لجداول ZATCA
-- ─────────────────────────────────────────────────────────────────────────────

-- zatca_config
ALTER TABLE public.zatca_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zatca_config_authenticated" ON public.zatca_config;
CREATE POLICY "zatca_config_authenticated"
  ON public.zatca_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- منع anon من الوصول لـ zatca_config تماماً
DROP POLICY IF EXISTS "zatca_config_no_anon" ON public.zatca_config;
CREATE POLICY "zatca_config_no_anon"
  ON public.zatca_config FOR SELECT TO anon
  USING (false);


-- zatca_logs
ALTER TABLE public.zatca_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zatca_logs_authenticated" ON public.zatca_logs;
CREATE POLICY "zatca_logs_authenticated"
  ON public.zatca_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "zatca_logs_no_anon" ON public.zatca_logs;
CREATE POLICY "zatca_logs_no_anon"
  ON public.zatca_logs FOR SELECT TO anon
  USING (false);


-- zatca_invoices
ALTER TABLE public.zatca_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zatca_invoices_authenticated" ON public.zatca_invoices;
CREATE POLICY "zatca_invoices_authenticated"
  ON public.zatca_invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "zatca_invoices_no_anon" ON public.zatca_invoices;
CREATE POLICY "zatca_invoices_no_anon"
  ON public.zatca_invoices FOR SELECT TO anon
  USING (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. دوال مساعدة للتحقق من صحة بيانات ZATCA
-- ─────────────────────────────────────────────────────────────────────────────

-- التحقق من رقم الضريبة السعودي (15 رقم يبدأ بـ 3)
CREATE OR REPLACE FUNCTION zatca_validate_vat(p_vat TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN p_vat ~ '^3[0-9]{14}$';
END;
$$;

-- التحقق من السجل التجاري (10 أرقام)
CREATE OR REPLACE FUNCTION zatca_validate_cr(p_cr TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN p_cr IS NULL OR p_cr ~ '^[0-9]{10}$';
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- نهاية Migration 011 — ZATCA Phase 2 Complete
-- ══════════════════════════════════════════════════════════════════════════════
