-- ══════════════════════════════════════════════════════════════════════════════
-- فلسي v8 — Migration 012: ZATCA Performance & Security Hardening
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. تحسين أداء الاستعلامات بإضافة Indexes مركّبة
-- ─────────────────────────────────────────────────────────────────────────────

-- فهرس مركّب للبحث السريع في فواتير ZATCA
CREATE INDEX IF NOT EXISTS idx_zatca_inv_branch_date
  ON public.zatca_invoices(branch_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_zatca_inv_branch_status
  ON public.zatca_invoices(branch_id, zatca_status);

-- فهرس لسلسلة الـ Hash (لجلب آخر فاتورة بسرعة)
CREATE INDEX IF NOT EXISTS idx_zatca_inv_counter
  ON public.zatca_invoices(branch_id, invoice_counter DESC);

-- فهرس للسجلات حسب الوقت (للتنظيف التلقائي)
CREATE INDEX IF NOT EXISTS idx_zatca_logs_created
  ON public.zatca_logs(created_at DESC);

-- فهرس للطلبات حسب حالة ZATCA
CREATE INDEX IF NOT EXISTS idx_orders_zatca_status
  ON public.orders(zatca_status)
  WHERE zatca_status IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. إضافة ENUM validation للحالات
-- ─────────────────────────────────────────────────────────────────────────────

-- تحديث check constraint لـ invoice_type
ALTER TABLE public.zatca_invoices
  DROP CONSTRAINT IF EXISTS zatca_invoices_invoice_type_check;

ALTER TABLE public.zatca_invoices
  ADD CONSTRAINT zatca_invoices_invoice_type_check
  CHECK (invoice_type IN ('simplified', 'standard', 'credit_note', 'debit_note'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. دالة تلقائية لتحديث حالة الفرع عند تغيير حالة ZATCA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_branch_zatca_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- عند تفعيل ZATCA: تحديث حالة الفرع
  IF NEW.onboarding_status = 'active' AND OLD.onboarding_status != 'active' THEN
    UPDATE public.branches
      SET zatca_enabled = true,
          zatca_status  = 'active'
      WHERE id = NEW.branch_id;

  -- عند الفشل: تحديث حالة الفرع
  ELSIF NEW.onboarding_status = 'failed' THEN
    UPDATE public.branches
      SET zatca_enabled = false,
          zatca_status  = 'failed'
      WHERE id = NEW.branch_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_branch_zatca ON public.zatca_config;
CREATE TRIGGER trg_sync_branch_zatca
  AFTER UPDATE OF onboarding_status ON public.zatca_config
  FOR EACH ROW EXECUTE FUNCTION sync_branch_zatca_status();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. دالة تنظيف السجلات القديمة (Retention Policy — 90 يوم)
--    تُشغَّل بشكل دوري بـ pg_cron أو Supabase Scheduled Functions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zatca_cleanup_old_logs(p_days INTEGER DEFAULT 90)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.zatca_logs
    WHERE created_at < now() - (p_days || ' days')::INTERVAL
      AND log_type NOT IN ('api_error', 'validation_error'); -- احتفظ بسجلات الأخطاء

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. View إحصائيات الفواتير اليومية لكل فرع
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_zatca_daily_stats AS
SELECT
  branch_id,
  issue_date,
  invoice_type,
  COUNT(*)                                        AS invoice_count,
  SUM(total)                                      AS total_revenue,
  SUM(vat_amount)                                 AS total_vat,
  COUNT(*) FILTER (WHERE zatca_status = 'reported') AS reported_count,
  COUNT(*) FILTER (WHERE zatca_status = 'cleared')  AS cleared_count,
  COUNT(*) FILTER (WHERE zatca_status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE zatca_status = 'error')    AS error_count
FROM public.zatca_invoices
WHERE is_cancelled = false
GROUP BY branch_id, issue_date, invoice_type;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Function لجلب ملخص ZATCA للفرع (تُستخدم في Dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_zatca_branch_summary(p_branch_id UUID)
RETURNS TABLE (
  onboarding_status   TEXT,
  environment         TEXT,
  invoice_counter     BIGINT,
  pcsid_expires_at    TIMESTAMPTZ,
  today_invoices      BIGINT,
  today_revenue       NUMERIC,
  pending_invoices    BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    zc.onboarding_status,
    zc.environment,
    zc.invoice_counter,
    zc.pcsid_expires_at,
    COUNT(zi.id) FILTER (WHERE zi.issue_date = CURRENT_DATE)::BIGINT,
    COALESCE(SUM(zi.total) FILTER (WHERE zi.issue_date = CURRENT_DATE), 0),
    COUNT(zi.id) FILTER (WHERE zi.zatca_status = 'pending')::BIGINT
  FROM public.zatca_config zc
  LEFT JOIN public.zatca_invoices zi ON zi.branch_id = zc.branch_id
  WHERE zc.branch_id = p_branch_id
  GROUP BY zc.onboarding_status, zc.environment, zc.invoice_counter, zc.pcsid_expires_at;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. إضافة Column Comments للتوثيق
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.zatca_config    IS 'إعدادات ZATCA Phase 2 لكل فرع — منعزلة بالكامل';
COMMENT ON TABLE  public.zatca_invoices  IS 'سجل الفواتير الإلكترونية المُرسَلة لـ ZATCA';
COMMENT ON TABLE  public.zatca_logs      IS 'سجل جميع API calls مع ZATCA للمراجعة والامتثال';
COMMENT ON COLUMN public.zatca_config.pcsid        IS 'Production CSID — يُستخدم للتوقيع والإرسال';
COMMENT ON COLUMN public.zatca_config.pcsid_secret IS 'Secret للـ PCSID — مشفّر — يُستخدم فقط في Edge Functions';
COMMENT ON COLUMN public.zatca_invoices.invoice_hash IS 'SHA-256 hash للفاتورة — جزء من سلسلة التحقق';
COMMENT ON COLUMN public.zatca_invoices.previous_invoice_hash IS 'Hash الفاتورة السابقة — يضمن تسلسل غير قابل للتلاعب';


-- ══════════════════════════════════════════════════════════════════════════════
-- نهاية Migration 012
-- ══════════════════════════════════════════════════════════════════════════════
