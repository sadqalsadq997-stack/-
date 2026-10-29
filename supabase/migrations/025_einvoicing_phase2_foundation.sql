-- ══════════════════════════════════════════════════════════════════
-- فلسي v25 — أساس الفوترة الإلكترونية (المرحلة الثانية) وتقوية البناء
--  1) حساب الأسعار بطريقة الهيئة (ضريبة السطر = صافي السطر × النسبة) — في السيرفر
--  2) الفاتورة الصادرة لا تُعدَّل ولا تُحذف (التصحيح بإشعار دائن فقط)
--  3) ترقيم تسلسلي للفواتير والإشعارات لكل منشأة
--  4) جداول وحدات الفوترة (EGS) والسلسلة (ICV/PIH) — الكتابة للسيرفر فقط
--  5) فواتير المشتريات حسب اللائحة (المادة 49 و53)
--  6) تنظيف سياسات قديمة مفتوحة (USING true)
-- شغّله بعد 024. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0) سياسات قديمة USING(true) على جداول المنشآت — كانت محيّدة بالحارس
--    المقيِّد من 021، لكن وجودها خطر لو انحذف الحارس يوماً. نحذفها.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname, p.polname
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polpermissive
       AND (coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true' OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true')
       AND EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema = 'public' AND x.table_name = c.relname AND x.column_name = 'tenant_id')
       AND EXISTS (SELECT 1 FROM pg_policy g WHERE g.polrelid = p.polrelid AND g.polname = 'tenant_access')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.relname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1) التسعير بطريقة الهيئة
--    لكل سطر: صافي الوحدة = round(سعر الوحدة الشامل ÷ 1.15, 2)
--             صافي السطر  = صافي الوحدة × الكمية        (BR-KSA-EN16931-11)
--             ضريبة السطر = round(صافي السطر × 15%, 2)  (BR-KSA-50)
--             إجمالي السطر = السعر الشامل × الكمية      (اللي يدفعه العميل)
--    الفرق (±هللات قليلة) = مبلغ التقريب PayableRoundingAmount
--    تم التحقق: 80/80 فاتورة PASSED بدون تحذيرات بالمدقق الرسمي للهيئة.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_price_lines(p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  e JSONB; out JSONB := '[]'::JSONB;
  qty NUMERIC; rate NUMERIC; g NUMERIC; un NUMERIC; ln NUMERIC; lv NUMERIC; lg NUMERIC;
  s_net NUMERIC := 0; s_vat NUMERIC := 0; s_gross NUMERIC := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RETURN NULL; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(e->'price') IS DISTINCT FROM 'number' AND (e->>'price') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
    qty  := round(coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1), 3);
    IF qty <= 0 THEN RAISE EXCEPTION 'كمية غير صحيحة للصنف %', e->>'name'; END IF;
    rate := coalesce((e->>'tax_rate')::NUMERIC, 15);
    IF rate NOT IN (0, 15) THEN RAISE EXCEPTION 'نسبة ضريبة غير مدعومة: %', rate; END IF;
    g    := round((e->>'price')::NUMERIC, 2);
    IF g < 0 THEN RAISE EXCEPTION 'سعر سالب غير مسموح — استخدم المرتجع'; END IF;
    un   := round(g / (1 + rate / 100), 2);
    ln   := round(un * qty, 2);
    lv   := round(ln * rate / 100, 2);
    lg   := round(g * qty, 2);
    s_net := s_net + ln; s_vat := s_vat + lv; s_gross := s_gross + lg;
    out := out || (e || jsonb_build_object(
      'quantity', qty, 'qty', qty, 'price', g, 'tax_rate', rate,
      'unit_net', un, 'net', un, 'vat', g - un,
      'line_net', ln, 'line_vat', lv, 'total', lg));
  END LOOP;
  RETURN jsonb_build_object('items', out, 'subtotal', s_net, 'tax_amount', s_vat, 'total', s_gross,
                            'rounding', s_gross - s_net - s_vat);
END $$;
GRANT EXECUTE ON FUNCTION public.felsy_price_lines(JSONB) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- 2) الترقيم التسلسلي (لكل منشأة) — INV-000001 / CN-000001
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,
  last      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, kind)
);
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doc_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_doc_seq(p_tenant UUID, p_kind TEXT)
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.doc_counters (tenant_id, kind, last) VALUES (p_tenant, p_kind, 1)
  ON CONFLICT (tenant_id, kind) DO UPDATE SET last = public.doc_counters.last + 1
  RETURNING last;
$$;
REVOKE ALL ON FUNCTION public.next_doc_seq(UUID, TEXT) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rounding_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_seq BIGINT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_invoice_seq_uq ON public.orders(tenant_id, invoice_seq) WHERE invoice_seq IS NOT NULL;

-- هل المستدعي سيرفر (service_role) أو صيانة مباشرة؟ ⇒ مسموح له بكل شيء
-- يقرأ الدور من توكن الطلب نفسه (JWT) — لا يتأثر بـ SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.felsy_is_server()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::JSONB ->> 'role',
           'maintenance') NOT IN ('authenticated', 'anon');
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3) حارس الطلبات/الفواتير
--    • قبل الإصدار: الأسعار تُحسب في السيرفر (ما نثق بمجاميع الجهاز)
--    • الإصدار = الدفع أو الإكمال ⇒ رقم تسلسلي + وقت الإصدار
--    • بعد الإصدار: ممنوع تعديل المبالغ/الأصناف أو الإلغاء أو الحذف
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_invoice_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p JSONB; v_seq BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_seq IS NOT NULL AND NOT public.felsy_is_server() THEN
      RAISE EXCEPTION 'لا يمكن حذف فاتورة صادرة (%). نظام الضريبة يلزم بحفظها — استخدم المرتجع', OLD.invoice_no;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.invoice_seq IS NOT NULL THEN
    IF public.felsy_is_server() THEN RETURN NEW; END IF;
    IF NEW.items IS DISTINCT FROM OLD.items OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.rounding_amount IS DISTINCT FROM OLD.rounding_amount OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       OR NEW.invoice_seq IS DISTINCT FROM OLD.invoice_seq OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
       OR NEW.invoiced_at IS DISTINCT FROM OLD.invoiced_at OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.zatca_status IS DISTINCT FROM OLD.zatca_status OR NEW.zatca_uuid IS DISTINCT FROM OLD.zatca_uuid
       OR NEW.zatca_qr IS DISTINCT FROM OLD.zatca_qr OR NEW.zatca_invoice_id IS DISTINCT FROM OLD.zatca_invoice_id THEN
      RAISE EXCEPTION 'الفاتورة % صادرة ولا يمكن تعديلها — للتصحيح أصدر مرتجع (إشعار دائن)', OLD.invoice_no;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      RAISE EXCEPTION 'الفاتورة % صادرة — الإلغاء يكون بمرتجع (إشعار دائن) وليس بتغيير الحالة', OLD.invoice_no;
    END IF;
    RETURN NEW;
  END IF;

  -- لم تصدر بعد: الحساب في السيرفر
  IF NOT public.felsy_is_server() THEN
    NEW.zatca_status := NULL; NEW.zatca_uuid := NULL; NEW.zatca_qr := NULL; NEW.zatca_invoice_id := NULL;
    NEW.invoice_seq := NULL; NEW.invoice_no := NULL; NEW.invoiced_at := NULL;
  END IF;
  IF coalesce(NEW.discount_amount, 0) <> 0 THEN
    RAISE EXCEPTION 'الخصم على مستوى الفاتورة غير مدعوم حالياً — عدّل سعر الصنف أو استخدم المرتجع';
  END IF;
  p := public.felsy_price_lines(NEW.items);
  IF p IS NOT NULL THEN
    NEW.items := p->'items';
    NEW.subtotal := (p->>'subtotal')::NUMERIC;
    NEW.tax_amount := (p->>'tax_amount')::NUMERIC;
    NEW.total := (p->>'total')::NUMERIC;
    NEW.rounding_amount := (p->>'rounding')::NUMERIC;
  END IF;

  -- الإصدار
  -- طلبات المنيو الأونلاين ما تُفوتر لحظة الطلب (العميل ما دفع بعد) — تُفوتر عند الإكمال
  IF NEW.invoice_seq IS NULL AND coalesce(NEW.status, '') <> 'cancelled'
     AND ((NEW.payment_method IS NOT NULL AND coalesce(NEW.source, '') <> 'online') OR NEW.status = 'completed')
     AND NEW.tenant_id IS NOT NULL AND p IS NOT NULL THEN
    v_seq := public.next_doc_seq(NEW.tenant_id, 'invoice');
    NEW.invoice_seq := v_seq;
    NEW.invoice_no := 'INV-' || lpad(v_seq::TEXT, 6, '0');
    NEW.invoiced_at := now();
    NEW.zatca_status := 'pending';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_zz_orders_invoice_guard ON public.orders;
CREATE TRIGGER trg_zz_orders_invoice_guard BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_invoice_guard();
DROP TRIGGER IF EXISTS trg_orders_invoice_delete_guard ON public.orders;
CREATE TRIGGER trg_orders_invoice_delete_guard BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_invoice_guard();

-- الإشعارات الدائنة والمرتجعات: للقراءة فقط من المتصفح
CREATE OR REPLACE FUNCTION public.readonly_after_issue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF public.felsy_is_server() THEN RETURN coalesce(NEW, OLD); END IF;
  RAISE EXCEPTION 'المستندات الضريبية الصادرة لا تُعدَّل ولا تُحذف';
END $$;
DROP TRIGGER IF EXISTS trg_returns_readonly ON public.returns;
CREATE TRIGGER trg_returns_readonly BEFORE UPDATE OR DELETE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.readonly_after_issue();
DROP TRIGGER IF EXISTS trg_invoices_readonly ON public.invoices;
CREATE TRIGGER trg_invoices_readonly BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.readonly_after_issue();

-- البيجر الملغي لا يلغي فاتورة صادرة (الإلغاء بمرتجع فقط)
CREATE OR REPLACE FUNCTION public.sync_order_from_pager()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target TEXT;
BEGIN
  IF NEW.order_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_target := CASE NEW.status WHEN 'preparing' THEN 'preparing' WHEN 'ready' THEN 'ready'
                              WHEN 'collected' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' END;
  IF v_target IS NOT NULL THEN
    UPDATE public.orders SET status = v_target
     WHERE id = NEW.order_id AND tenant_id = NEW.tenant_id AND status IS DISTINCT FROM v_target
       AND status NOT IN ('completed', 'cancelled', 'refunded')
       AND NOT (v_target = 'cancelled' AND invoice_seq IS NOT NULL);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_order_from_pager() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4) المرتجع (إشعار دائن) بنفس طريقة الحساب + ترقيم CN تسلسلي
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS rounding_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_seq BIGINT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zatca_qr TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zatca_invoice_id UUID;

CREATE OR REPLACE FUNCTION public.create_return(p_order UUID, p_items JSONB, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD; it JSONB; orig JSONB; v_qty NUMERIC; v_sold NUMERIC; v_prev NUMERIC;
  v_lines JSONB := '[]'::JSONB; p JSONB; v_seq BIGINT; v_num TEXT; v_ret UUID; v_cn UUID;
BEGIN
  SELECT * INTO o FROM public.orders
   WHERE id = p_order AND tenant_id IN (SELECT public.current_paid_tenant_ids()) FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة الأصلية غير موجودة'; END IF;
  IF o.invoice_seq IS NULL THEN RAISE EXCEPTION 'هذا الطلب ما صدرت له فاتورة بعد — ألغه بدل المرتجع'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'سبب الإرجاع مطلوب (تشترطه هيئة الزكاة في الإشعار الدائن)'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'اختر الأصناف المرتجعة'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    SELECT e INTO orig FROM jsonb_array_elements(o.items) e WHERE e->>'product_id' = it->>'product_id' LIMIT 1;
    IF orig IS NULL THEN RAISE EXCEPTION 'صنف غير موجود في الفاتورة الأصلية'; END IF;
    v_sold := coalesce((orig->>'quantity')::NUMERIC, (orig->>'qty')::NUMERIC, 1);
    SELECT coalesce(sum((r->>'quantity')::NUMERIC), 0) INTO v_prev
      FROM public.returns rt, jsonb_array_elements(rt.items) r
     WHERE rt.original_order_id = o.id AND r->>'product_id' = it->>'product_id';
    IF v_prev + v_qty > v_sold THEN RAISE EXCEPTION 'الكمية المرتجعة أكبر من المباعة'; END IF;
    v_lines := v_lines || jsonb_build_object('product_id', orig->>'product_id', 'name', orig->>'name',
                 'quantity', v_qty, 'price', (orig->>'price')::NUMERIC, 'tax_rate', coalesce((orig->>'tax_rate')::NUMERIC, 15));
  END LOOP;
  p := public.felsy_price_lines(v_lines);
  IF p IS NULL OR (p->>'total')::NUMERIC <= 0 THEN RAISE EXCEPTION 'لا توجد أصناف مرتجعة'; END IF;

  v_seq := public.next_doc_seq(o.tenant_id, 'credit');
  v_num := 'CN-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.invoices (tenant_id, branch_id, invoice_type, original_invoice_id, order_id, invoice_number, invoice_seq,
                               items, subtotal, vat_amount, total, rounding_amount, reason, zatca_status, uuid)
  VALUES (o.tenant_id, o.branch_id, 'credit_note', o.zatca_invoice_id, o.id, v_num, v_seq,
          p->'items', (p->>'subtotal')::NUMERIC, (p->>'tax_amount')::NUMERIC, (p->>'total')::NUMERIC, (p->>'rounding')::NUMERIC,
          left(p_reason, 300), 'pending', gen_random_uuid()::TEXT)
  RETURNING id INTO v_cn;

  INSERT INTO public.returns (tenant_id, branch_id, return_number, type, status, original_order_id, original_order_number,
                              items, reason, refund_amount, subtotal, vat_amount, credit_note_id, processed_by)
  VALUES (o.tenant_id, o.branch_id, v_num, 'refund', 'completed', o.id, coalesce(o.invoice_no, o.order_number),
          p->'items', left(p_reason, 300), (p->>'total')::NUMERIC, (p->>'subtotal')::NUMERIC, (p->>'tax_amount')::NUMERIC, v_cn, auth.uid()::TEXT)
  RETURNING id INTO v_ret;

  RETURN jsonb_build_object('return_id', v_ret, 'credit_note_id', v_cn, 'number', v_num,
                            'total', (p->>'total')::NUMERIC, 'vat', (p->>'tax_amount')::NUMERIC, 'subtotal', (p->>'subtotal')::NUMERIC,
                            'rounding', (p->>'rounding')::NUMERIC, 'items', p->'items', 'original', coalesce(o.invoice_no, o.order_number));
END $$;
REVOKE ALL ON FUNCTION public.create_return(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return(UUID, JSONB, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 5) وحدة الفوترة (EGS) لكل فرع — الأسرار مشفّرة ولا يقرأها المتصفح
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS egs_uuid UUID;
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS invoice_types TEXT NOT NULL DEFAULT '0100';
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS short_address TEXT;
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS private_key_enc TEXT;
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE public.zatca_config ALTER COLUMN invoice_counter SET DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.zatca_config ADD CONSTRAINT zatca_config_invoice_types_chk CHECK (invoice_types IN ('0100','1000','1100'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- المتصفح يقرأ الأعمدة غير السرية فقط
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.zatca_config FROM authenticated, anon;
GRANT SELECT (id, tenant_id, branch_id, business_name, business_name_ar, vat_number, cr_number, branch_name, branch_name_ar,
              address_street, address_building, address_city, address_postal, address_country, address_district,
              short_address, industry, invoice_types, environment, onboarding_status, onboarding_error, invoice_counter,
              csid_expires_at, pcsid_expires_at, last_error, activated_at, created_at, updated_at)
  ON public.zatca_config TO authenticated;
REVOKE ALL ON public.zatca_private_keys FROM authenticated, anon;

-- مستند ضريبي موقّع (فاتورة أو إشعار) — سجل السلسلة
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS egs_id UUID;
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS doc_kind TEXT;
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS credit_note_id UUID;
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE public.zatca_invoices ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ;
ALTER TABLE public.zatca_invoices DROP CONSTRAINT IF EXISTS zatca_invoices_zatca_status_check;
ALTER TABLE public.zatca_invoices DROP CONSTRAINT IF EXISTS zatca_invoices_invoice_type_check;
ALTER TABLE public.zatca_invoices ADD CONSTRAINT zatca_invoices_zatca_status_check
  CHECK (zatca_status IN ('signed','reported','cleared','reported_warnings','cleared_warnings','rejected','error'));
CREATE UNIQUE INDEX IF NOT EXISTS zatca_invoices_egs_icv_uq ON public.zatca_invoices(egs_id, invoice_counter) WHERE egs_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS zatca_invoices_order_uq ON public.zatca_invoices(order_id) WHERE order_id IS NOT NULL AND doc_kind = 'invoice';
CREATE UNIQUE INDEX IF NOT EXISTS zatca_invoices_cn_uq ON public.zatca_invoices(credit_note_id) WHERE credit_note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS zatca_invoices_retry_idx ON public.zatca_invoices(zatca_status, next_attempt_at) WHERE zatca_status IN ('signed','error');
REVOKE INSERT, UPDATE, DELETE ON public.zatca_invoices FROM authenticated, anon;

-- إعداد الملف الضريبي للفرع (العنوان الوطني...) — للمالك/المدير فقط
CREATE OR REPLACE FUNCTION public.zatca_save_profile(p_branch UUID, p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; v_id UUID;
BEGIN
  SELECT b.tenant_id INTO v_tenant FROM public.branches b
   WHERE b.id = p_branch AND b.tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu
                                              WHERE tu.auth_id = auth.uid() AND tu.is_active AND tu.role IN ('owner','admin'));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'متاح لمالك المنشأة أو المدير فقط'; END IF;
  IF (p->>'vat_number') !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'الرقم الضريبي 15 رقم يبدأ وينتهي بـ 3'; END IF;
  IF (p->>'address_building') !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'رقم المبنى 4 أرقام (من العنوان الوطني)'; END IF;
  IF (p->>'address_postal') !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'الرمز البريدي 5 أرقام'; END IF;
  IF coalesce(trim(p->>'address_street'), '') = '' OR coalesce(trim(p->>'address_district'), '') = '' OR coalesce(trim(p->>'address_city'), '') = '' THEN
    RAISE EXCEPTION 'الشارع والحي والمدينة مطلوبة';
  END IF;
  IF coalesce(trim(p->>'business_name'), '') = '' THEN RAISE EXCEPTION 'الاسم القانوني للمنشأة مطلوب (كما في شهادة ضريبة القيمة المضافة)'; END IF;
  IF (p->>'cr_number') IS NOT NULL AND (p->>'cr_number') <> '' AND (p->>'cr_number') !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'السجل التجاري 10 أرقام'; END IF;

  INSERT INTO public.zatca_config (tenant_id, branch_id, business_name, vat_number, cr_number, branch_name,
      address_street, address_building, address_district, address_city, address_postal, address_country,
      short_address, industry, invoice_types, environment, onboarding_status)
  VALUES (v_tenant, p_branch, trim(p->>'business_name'), p->>'vat_number', nullif(p->>'cr_number', ''), coalesce(nullif(trim(p->>'branch_name'), ''), 'الفرع الرئيسي'),
      trim(p->>'address_street'), p->>'address_building', trim(p->>'address_district'), trim(p->>'address_city'), p->>'address_postal', 'SA',
      nullif(upper(trim(p->>'short_address')), ''), coalesce(nullif(trim(p->>'industry'), ''), 'Food'), coalesce(nullif(p->>'invoice_types', ''), '0100'),
      'production', 'not_started')
  ON CONFLICT (branch_id) DO UPDATE SET
      business_name = EXCLUDED.business_name, vat_number = EXCLUDED.vat_number, cr_number = EXCLUDED.cr_number,
      branch_name = EXCLUDED.branch_name, address_street = EXCLUDED.address_street, address_building = EXCLUDED.address_building,
      address_district = EXCLUDED.address_district, address_city = EXCLUDED.address_city, address_postal = EXCLUDED.address_postal,
      short_address = EXCLUDED.short_address, industry = EXCLUDED.industry, invoice_types = EXCLUDED.invoice_types, updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.zatca_save_profile(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zatca_save_profile(UUID, JSONB) TO authenticated;

-- ── دوال السيرفر (service_role فقط): المحرك يستخدمها كلها ──
-- تحميل وحدة الفوترة بأسرارها (فك التشفير هنا فقط)
CREATE OR REPLACE FUNCTION public.zatca_load_egs(p_branch UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(c) - ARRAY['private_key_enc','csid_secret','pcsid_secret','pcsid_encrypted']
         || jsonb_build_object('private_key', public.felsy_decrypt(c.private_key_enc),
                               'compliance_secret', public.felsy_decrypt(c.csid_secret),
                               'production_secret', public.felsy_decrypt(c.pcsid_secret))
    FROM public.zatca_config c WHERE c.branch_id = p_branch;
$$;

-- حفظ نتيجة التسجيل (المفاتيح والشهادات مشفرة)
CREATE OR REPLACE FUNCTION public.zatca_store_egs(p_branch UUID, p JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.zatca_config SET
    environment       = coalesce(p->>'environment', environment),
    onboarding_status = coalesce(p->>'onboarding_status', onboarding_status),
    onboarding_error  = CASE WHEN p ? 'onboarding_error' THEN p->>'onboarding_error' ELSE onboarding_error END,
    egs_uuid          = coalesce((p->>'egs_uuid')::UUID, egs_uuid),
    private_key_enc   = CASE WHEN p ? 'private_key' THEN public.felsy_encrypt(p->>'private_key') ELSE private_key_enc END,
    csr_data          = coalesce(p->>'csr', csr_data),
    csid              = CASE WHEN p ? 'compliance_certificate' THEN p->>'compliance_certificate' ELSE csid END,
    csid_secret       = CASE WHEN p ? 'compliance_secret' THEN public.felsy_encrypt(p->>'compliance_secret') ELSE csid_secret END,
    otp_request_id    = coalesce(p->>'compliance_request_id', otp_request_id),
    pcsid             = CASE WHEN p ? 'production_certificate' THEN p->>'production_certificate' ELSE pcsid END,
    pcsid_secret      = CASE WHEN p ? 'production_secret' THEN public.felsy_encrypt(p->>'production_secret') ELSE pcsid_secret END,
    pcsid_issued_at   = CASE WHEN p ? 'production_certificate' THEN now() ELSE pcsid_issued_at END,
    pcsid_expires_at  = coalesce((p->>'production_expires_at')::TIMESTAMPTZ, pcsid_expires_at),
    invoice_counter   = CASE WHEN (p->>'reset_chain')::BOOLEAN THEN 0 ELSE invoice_counter END,
    last_invoice_hash = CASE WHEN (p->>'reset_chain')::BOOLEAN THEN NULL ELSE last_invoice_hash END,
    activated_at      = CASE WHEN p->>'onboarding_status' = 'active' THEN now() ELSE activated_at END,
    updated_at        = now()
  WHERE branch_id = p_branch;
  IF NOT FOUND THEN RAISE EXCEPTION 'أكمل بيانات الفوترة للفرع أولاً'; END IF;
END $$;

-- تحميل مستند للتوقيع (فاتورة طلب أو إشعار دائن)
CREATE OR REPLACE FUNCTION public.zatca_load_doc(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  IF p_kind = 'invoice' THEN
    SELECT jsonb_build_object('kind', 'invoice', 'id', o.id, 'tenant_id', o.tenant_id, 'branch_id', o.branch_id,
             'number', o.invoice_no, 'issued_at', o.invoiced_at, 'items', o.items, 'subtotal', o.subtotal,
             'tax_amount', o.tax_amount, 'total', o.total, 'rounding', o.rounding_amount, 'payment_method', o.payment_method,
             'is_b2b', coalesce(o.is_b2b, false), 'customer_id', o.customer_id, 'zatca_invoice_id', o.zatca_invoice_id,
             'buyer', (SELECT jsonb_build_object('name', c.name, 'vat_number', c.vat_number, 'address', c.address)
                         FROM public.customers c WHERE c.id = o.customer_id))
      INTO r FROM public.orders o WHERE o.id = p_id AND o.invoice_seq IS NOT NULL;
  ELSIF p_kind = 'credit' THEN
    SELECT jsonb_build_object('kind', 'credit', 'id', i.id, 'tenant_id', i.tenant_id, 'branch_id', i.branch_id,
             'number', i.invoice_number, 'issued_at', i.created_at, 'items', i.items, 'subtotal', i.subtotal,
             'tax_amount', i.vat_amount, 'total', i.total, 'rounding', i.rounding_amount, 'reason', i.reason,
             'zatca_invoice_id', i.zatca_invoice_id,
             'original_number', o.invoice_no, 'original_issued_at', o.invoiced_at, 'payment_method', o.payment_method,
             'is_b2b', coalesce(o.is_b2b, false),
             'buyer', (SELECT jsonb_build_object('name', c.name, 'vat_number', c.vat_number, 'address', c.address)
                         FROM public.customers c WHERE c.id = o.customer_id))
      INTO r FROM public.invoices i JOIN public.orders o ON o.id = i.order_id
     WHERE i.id = p_id AND i.invoice_type = 'credit_note';
  ELSE
    RAISE EXCEPTION 'نوع مستند غير معروف';
  END IF;
  RETURN r;
END $$;

-- تثبيت المستند الموقّع في السلسلة — مقارنة وتبديل (CAS):
-- ينجح فقط إذا ما تغيّر رأس السلسلة منذ التحميل ⇒ لا تكرار ولا قفز في العداد
CREATE OR REPLACE FUNCTION public.zatca_commit(p_branch UUID, p_icv BIGINT, p_hash TEXT, p_kind TEXT, p_id UUID, d JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_doc UUID; v_existing UUID;
BEGIN
  SELECT * INTO c FROM public.zatca_config WHERE branch_id = p_branch FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'egs_missing'; END IF;
  IF p_kind = 'invoice' THEN
    SELECT zatca_invoice_id INTO v_existing FROM public.orders WHERE id = p_id FOR UPDATE;
  ELSE
    SELECT zatca_invoice_id INTO v_existing FROM public.invoices WHERE id = p_id FOR UPDATE;
  END IF;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'already_signed'; END IF;
  IF coalesce(c.invoice_counter, 0) <> p_icv - 1 THEN RAISE EXCEPTION 'chain_conflict'; END IF;

  INSERT INTO public.zatca_invoices (tenant_id, branch_id, egs_id, doc_kind, order_id, credit_note_id,
      invoice_uuid, invoice_number, invoice_type, invoice_subtype, issue_date, issue_time,
      seller_name, seller_vat, subtotal, vat_amount, total, vat_rate, line_items,
      invoice_hash, previous_invoice_hash, invoice_counter, qr_code, xml_document, zatca_status, next_attempt_at)
  VALUES (c.tenant_id, p_branch, c.id, CASE WHEN p_kind = 'invoice' THEN 'invoice' ELSE 'credit' END,
      CASE WHEN p_kind = 'invoice' THEN p_id ELSE (SELECT order_id FROM public.invoices WHERE id = p_id) END,
      CASE WHEN p_kind = 'credit' THEN p_id END,
      (d->>'uuid')::UUID, d->>'number', d->>'type_code', d->>'subtype', (d->>'issue_date')::DATE, (d->>'issue_time')::TIME,
      c.business_name, c.vat_number, (d->>'subtotal')::NUMERIC, (d->>'tax_amount')::NUMERIC, (d->>'total')::NUMERIC, 15, d->'lines',
      p_hash, d->>'pih', p_icv, d->>'qr', d->>'xml', 'signed', now())
  RETURNING id INTO v_doc;

  UPDATE public.zatca_config SET invoice_counter = p_icv, last_invoice_hash = p_hash, updated_at = now() WHERE id = c.id;
  IF p_kind = 'invoice' THEN
    UPDATE public.orders SET zatca_invoice_id = v_doc, zatca_uuid = d->>'uuid', zatca_qr = d->>'qr', zatca_status = 'signed' WHERE id = p_id;
  ELSE
    UPDATE public.invoices SET zatca_invoice_id = v_doc, uuid = d->>'uuid', zatca_qr = d->>'qr', qr_code = d->>'qr', zatca_status = 'signed' WHERE id = p_id;
  END IF;
  RETURN v_doc;
END $$;

-- نتيجة الإرسال للهيئة
CREATE OR REPLACE FUNCTION public.zatca_mark(p_doc UUID, p_status TEXT, p_warnings JSONB, p_errors JSONB, p_cleared_xml TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE z RECORD;
BEGIN
  UPDATE public.zatca_invoices SET
    zatca_status = p_status, zatca_warnings = p_warnings, zatca_errors = p_errors,
    zatca_submitted_at = now(), attempts = attempts + 1,
    reported_at = CASE WHEN p_status IN ('reported','cleared','reported_warnings','cleared_warnings') THEN now() ELSE reported_at END,
    zatca_cleared_at = CASE WHEN p_status LIKE 'cleared%' THEN now() ELSE zatca_cleared_at END,
    xml_document = coalesce(p_cleared_xml, xml_document),
    -- إعادة المحاولة: 1، 2، 4، 8... دقائق (حد أقصى ساعة) — الهيئة تمهل 24 ساعة للمبسطة
    next_attempt_at = CASE WHEN p_status = 'error' THEN now() + make_interval(mins => least(60, power(2, least(attempts, 6))::INT)) ELSE NULL END,
    updated_at = now()
  WHERE id = p_doc RETURNING * INTO z;
  IF z.doc_kind = 'invoice' THEN
    UPDATE public.orders SET zatca_status = p_status WHERE id = z.order_id;
  ELSE
    UPDATE public.invoices SET zatca_status = p_status WHERE id = z.credit_note_id;
  END IF;
END $$;

-- مستند موقّع (لإعادة الإرسال بنفس البصمة — بدون استهلاك عداد جديد)
CREATE OR REPLACE FUNCTION public.zatca_load_signed(p_doc UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', z.id, 'branch_id', z.branch_id, 'uuid', z.invoice_uuid, 'hash', z.invoice_hash,
                            'xml', z.xml_document, 'subtype', z.invoice_subtype, 'status', z.zatca_status,
                            'qr', z.qr_code, 'number', z.invoice_number, 'counter', z.invoice_counter)
    FROM public.zatca_invoices z WHERE z.id = p_doc;
$$;

-- المستندات المستحقة: صادرة وما توقّعت، أو توقّعت وما انرسلت
CREATE OR REPLACE FUNCTION public.zatca_pending(p_limit INT DEFAULT 50)
RETURNS TABLE(kind TEXT, id UUID, branch_id UUID, zatca_doc UUID) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (SELECT 'invoice', o.id, o.branch_id, NULL::UUID FROM public.orders o
     JOIN public.zatca_config c ON c.branch_id = o.branch_id AND c.onboarding_status = 'active'
    WHERE o.invoice_seq IS NOT NULL AND o.zatca_invoice_id IS NULL AND o.invoiced_at >= c.activated_at
    ORDER BY o.invoiced_at LIMIT p_limit)
  UNION ALL
  (SELECT 'credit', i.id, i.branch_id, NULL::UUID FROM public.invoices i
     JOIN public.zatca_config c ON c.branch_id = i.branch_id AND c.onboarding_status = 'active'
    WHERE i.invoice_type = 'credit_note' AND i.zatca_invoice_id IS NULL AND i.created_at >= c.activated_at
    ORDER BY i.created_at LIMIT p_limit)
  UNION ALL
  (SELECT z.doc_kind, coalesce(z.credit_note_id, z.order_id), z.branch_id, z.id FROM public.zatca_invoices z
    WHERE z.zatca_status IN ('signed','error') AND coalesce(z.next_attempt_at, now()) <= now() AND z.attempts < 50
    ORDER BY z.created_at LIMIT p_limit);
$$;

-- حالة الفوترة للواجهة (بدون أسرار)
CREATE OR REPLACE FUNCTION public.zatca_branch_status(p_branch UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'configured', c.id IS NOT NULL, 'status', coalesce(c.onboarding_status, 'not_started'), 'environment', c.environment,
    'error', c.onboarding_error, 'activated_at', c.activated_at, 'counter', coalesce(c.invoice_counter, 0),
    'cert_expires_at', c.pcsid_expires_at,
    'pending', (SELECT count(*) FROM public.orders o WHERE o.branch_id = p_branch AND o.invoice_seq IS NOT NULL
                  AND (o.zatca_status IS NULL OR o.zatca_status IN ('pending','signed','error')) AND o.invoiced_at >= coalesce(c.activated_at, 'infinity')),
    'rejected', (SELECT count(*) FROM public.zatca_invoices z WHERE z.branch_id = p_branch AND z.zatca_status = 'rejected'),
    'reported_24h', (SELECT count(*) FROM public.zatca_invoices z WHERE z.branch_id = p_branch AND z.reported_at > now() - interval '24 hours'),
    'overdue', (SELECT count(*) FROM public.zatca_invoices z WHERE z.branch_id = p_branch
                  AND z.zatca_status IN ('signed','error') AND z.created_at < now() - interval '20 hours'))
  FROM public.branches b LEFT JOIN public.zatca_config c ON c.branch_id = b.id
  WHERE b.id = p_branch AND b.tenant_id IN (SELECT public.current_tenant_ids());
$$;
GRANT EXECUTE ON FUNCTION public.zatca_branch_status(UUID) TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['zatca_load_egs(uuid)','zatca_store_egs(uuid,jsonb)','zatca_load_doc(text,uuid)',
                           'zatca_commit(uuid,bigint,text,text,uuid,jsonb)','zatca_mark(uuid,text,jsonb,jsonb,text)','zatca_pending(integer)',
                           'zatca_load_signed(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) فواتير المشتريات حسب اللائحة التنفيذية
--   م49: الخصم يحتاج فاتورة ضريبية (أو مبسطة صحيحة)، خلال 5 سنوات من التوريد
--   م53: المبسطة بين المنشآت فقط لتوريد أقل من 1000 ريال
--   الخصم يكون في إقرار الفترة اللي استلمت فيها الفاتورة (claim_date)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS invoice_kind TEXT NOT NULL DEFAULT 'tax';
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS claim_date DATE NOT NULL DEFAULT current_date;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS deductible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS non_deductible_reason TEXT;
DO $$ BEGIN
  ALTER TABLE public.purchase_invoices ADD CONSTRAINT purchase_invoices_kind_chk CHECK (invoice_kind IN ('tax','simplified','customs'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.purchase_invoice_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_date > current_date THEN RAISE EXCEPTION 'تاريخ الفاتورة في المستقبل'; END IF;
  IF NEW.claim_date < NEW.invoice_date THEN NEW.claim_date := NEW.invoice_date; END IF;
  IF NEW.vat_amount > round(NEW.net_amount * 0.15, 2) + 0.05 THEN
    RAISE EXCEPTION 'الضريبة أكبر من 15%% من المبلغ قبل الضريبة — راجع الأرقام';
  END IF;
  IF NEW.deductible THEN
    IF NEW.supplier_vat IS NULL THEN
      RAISE EXCEPTION 'لخصم الضريبة لازم الرقم الضريبي للمورد (المورد غير المسجل ما يحق له تحصيل ضريبة)';
    END IF;
    IF NEW.invoice_date < NEW.claim_date - interval '5 years' THEN
      RAISE EXCEPTION 'مضى أكثر من 5 سنوات على الفاتورة — لا يجوز خصم ضريبتها (المادة 49)';
    END IF;
    IF NEW.invoice_kind = 'simplified' AND NEW.net_amount + NEW.vat_amount >= 1000 THEN
      RAISE EXCEPTION 'الفاتورة المبسطة تقبل للخصم فقط إذا كانت أقل من 1000 ريال — اطلب من المورد فاتورة ضريبية كاملة باسم منشأتك';
    END IF;
  ELSE
    IF coalesce(trim(NEW.non_deductible_reason), '') = '' THEN NEW.non_deductible_reason := 'غير قابلة للخصم'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_purchase_invoice_rules ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_rules BEFORE INSERT OR UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_invoice_rules();

-- ─────────────────────────────────────────────────────────────────
-- 7) الإقرار: المبيعات = الفواتير الصادرة فعلاً (بتاريخ الإصدار)،
--    المشتريات = القابلة للخصم بتاريخ الاستلام
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vat_return(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (SELECT public.my_tenant_id() AS id),
  s AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(tax_amount), 0) vat, count(*) n
      FROM public.orders, t
     WHERE orders.tenant_id = t.id AND invoice_seq IS NOT NULL
       AND invoiced_at >= p_from AND invoiced_at < p_to + 1),
  r AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n
      FROM public.invoices, t
     WHERE invoices.tenant_id = t.id AND invoice_type = 'credit_note' AND created_at >= p_from AND created_at < p_to + 1),
  p AS (
    SELECT coalesce(sum(net_amount) FILTER (WHERE deductible), 0) net, coalesce(sum(vat_amount) FILTER (WHERE deductible), 0) vat,
           count(*) FILTER (WHERE deductible) n,
           coalesce(sum(vat_amount) FILTER (WHERE NOT deductible), 0) blocked_vat
      FROM public.purchase_invoices, t
     WHERE purchase_invoices.tenant_id = t.id AND claim_date BETWEEN p_from AND p_to)
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales_net', s.net, 'sales_vat', s.vat, 'sales_count', s.n,
    'returns_net', r.net, 'returns_vat', r.vat, 'returns_count', r.n,
    'purchases_net', p.net, 'purchases_vat', p.vat, 'purchases_count', p.n, 'purchases_blocked_vat', p.blocked_vat,
    'output_vat', s.vat - r.vat, 'input_vat', p.vat,
    'net_due', (s.vat - r.vat) - p.vat
  ) FROM s, r, p;
$$;
REVOKE ALL ON FUNCTION public.vat_return(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vat_return(DATE, DATE) TO authenticated;

INSERT INTO public.migration_status (migration, note) VALUES (
  '025_einvoicing_phase2_foundation',
  'تسعير الهيئة في السيرفر، حماية الفواتير الصادرة، ترقيم تسلسلي، أساس المرحلة الثانية (EGS/ICV/PIH)، قواعد فواتير المشتريات.'
) ON CONFLICT (migration) DO NOTHING;
