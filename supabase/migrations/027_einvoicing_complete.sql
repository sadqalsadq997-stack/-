-- ══════════════════════════════════════════════════════════════════
-- فلسي v26 — إكمال الفوترة الإلكترونية
--  1) أصناف صفرية / معفاة / خارج النطاق برموز الإعفاء الرسمية (VATEX-SA-*)
--  2) الخصم على مستوى الفاتورة (يتوزع على فئات الضريبة — AllowanceCharge)
--  3) الفاتورة الضريبية للشركات B2B (Standard) — بيانات المشتري والعنوان الوطني
--     وتُعتمد من الهيئة (Clearance) قبل تسليمها للعميل
--  4) قاعدة الـ 12 شهر لضريبة المدخلات غير المدفوعة (عكس/استرداد في الإقرار)
-- كل الأشكال تم فحصها بالمدقق الرسمي للهيئة (SDK 3.4.8): PASSED بدون ملاحظات.
-- شغّله بعد 026. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) رموز الإعفاء والنسبة الصفرية (قائمة الهيئة)
--    EDU/HEA (التعليم/الصحة للمواطن) غير مدرجة: تشترط هوية المشتري الوطنية في كل فاتورة.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_vat_reason(p_code TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_code
    WHEN 'VATEX-SA-29'   THEN 'الخدمات المالية المعفاة (المادة 29)'
    WHEN 'VATEX-SA-29-7' THEN 'عقود التأمين على الحياة (المادة 29)'
    WHEN 'VATEX-SA-30'   THEN 'توريد العقارات السكنية المعفاة (المادة 30)'
    WHEN 'VATEX-SA-32'   THEN 'تصدير السلع (المادة 32)'
    WHEN 'VATEX-SA-33'   THEN 'تصدير الخدمات (المادة 33)'
    WHEN 'VATEX-SA-34-1' THEN 'النقل الدولي للسلع (المادة 34)'
    WHEN 'VATEX-SA-34-2' THEN 'النقل الدولي للركاب (المادة 34)'
    WHEN 'VATEX-SA-34-3' THEN 'خدمات مرتبطة بالنقل الدولي للركاب (المادة 34)'
    WHEN 'VATEX-SA-34-4' THEN 'توريد وسائل النقل المؤهلة (المادة 34)'
    WHEN 'VATEX-SA-34-5' THEN 'خدمات مرتبطة بنقل السلع أو الركاب (المادة 34)'
    WHEN 'VATEX-SA-35'   THEN 'الأدوية والمعدات الطبية (المادة 35)'
    WHEN 'VATEX-SA-36'   THEN 'المعادن المؤهلة (المادة 36)'
    WHEN 'VATEX-SA-MLTRY' THEN 'السلع العسكرية المؤهلة'
    WHEN 'VATEX-SA-OOS'  THEN 'خارج نطاق ضريبة القيمة المضافة'
  END;
$$;

-- الفئة ⇐ هل الرمز مسموح لها؟
CREATE OR REPLACE FUNCTION public.felsy_vat_code_ok(p_cat TEXT, p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(CASE p_cat
    WHEN 'S' THEN p_code IS NULL
    WHEN 'E' THEN p_code IN ('VATEX-SA-29','VATEX-SA-29-7','VATEX-SA-30')
    WHEN 'Z' THEN p_code IN ('VATEX-SA-32','VATEX-SA-33','VATEX-SA-34-1','VATEX-SA-34-2','VATEX-SA-34-3','VATEX-SA-34-4','VATEX-SA-34-5','VATEX-SA-35','VATEX-SA-36','VATEX-SA-MLTRY')
    WHEN 'O' THEN p_code = 'VATEX-SA-OOS'
    ELSE false END, false);
$$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vat_category TEXT NOT NULL DEFAULT 'S';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vat_exemption_code TEXT;
UPDATE public.products SET vat_category = 'O', vat_exemption_code = 'VATEX-SA-OOS'
 WHERE coalesce(tax_rate, 15) = 0 AND vat_category = 'S';
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_vat_category_chk CHECK (vat_category IN ('S','Z','E','O'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- الصنف: النسبة تتبع الفئة دائماً (لا تناقض بين tax_rate والفئة)
CREATE OR REPLACE FUNCTION public.products_vat_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.vat_category := upper(coalesce(NEW.vat_category, 'S'));
  IF NEW.vat_category = 'S' THEN
    NEW.vat_exemption_code := NULL; NEW.tax_rate := 15;
  ELSE
    IF NEW.vat_category = 'O' AND NEW.vat_exemption_code IS NULL THEN NEW.vat_exemption_code := 'VATEX-SA-OOS'; END IF;
    IF NOT public.felsy_vat_code_ok(NEW.vat_category, NEW.vat_exemption_code) THEN
      RAISE EXCEPTION 'اختر سبب الإعفاء/النسبة الصفرية من قائمة الهيئة للصنف %', coalesce(NEW.name_ar, NEW.name);
    END IF;
    NEW.tax_rate := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_products_vat_sync ON public.products;
CREATE TRIGGER trg_products_vat_sync BEFORE INSERT OR UPDATE OF vat_category, vat_exemption_code, tax_rate ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_vat_sync();

-- ─────────────────────────────────────────────────────────────────
-- 2) تسعير الأسطر (نفس طريقة 025 + الفئة الضريبية لكل سطر)
--    S ⇒ 15%   |   Z / E / O ⇒ 0% مع رمز الإعفاء
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_price_lines(p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  e JSONB; out JSONB := '[]'::JSONB;
  qty NUMERIC; rate NUMERIC; g NUMERIC; un NUMERIC; ln NUMERIC; lv NUMERIC; lg NUMERIC; cat TEXT; code TEXT;
  s_net NUMERIC := 0; s_vat NUMERIC := 0; s_gross NUMERIC := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RETURN NULL; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(e->'price') IS DISTINCT FROM 'number' AND (e->>'price') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
    qty  := round(coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1), 3);
    IF qty <= 0 THEN RAISE EXCEPTION 'كمية غير صحيحة للصنف %', e->>'name'; END IF;
    cat  := upper(coalesce(nullif(e->>'vat_category', ''),
                           CASE WHEN coalesce((e->>'tax_rate')::NUMERIC, 15) = 0 THEN 'O' ELSE 'S' END));
    code := nullif(e->>'vat_exemption_code', '');
    IF cat = 'S' THEN
      code := NULL;
      IF coalesce((e->>'tax_rate')::NUMERIC, 15) NOT IN (15) THEN RAISE EXCEPTION 'نسبة ضريبة غير مدعومة: %', e->>'tax_rate'; END IF;
      rate := 15;
    ELSIF cat IN ('Z','E','O') THEN
      IF cat = 'O' AND code IS NULL THEN code := 'VATEX-SA-OOS'; END IF;
      IF NOT public.felsy_vat_code_ok(cat, code) THEN RAISE EXCEPTION 'رمز إعفاء غير صحيح للصنف %', e->>'name'; END IF;
      rate := 0;
    ELSE
      RAISE EXCEPTION 'فئة ضريبية غير معروفة: %', cat;
    END IF;
    g    := round((e->>'price')::NUMERIC, 2);
    IF g < 0 THEN RAISE EXCEPTION 'سعر سالب غير مسموح — استخدم المرتجع'; END IF;
    un   := round(g / (1 + rate / 100), 2);
    ln   := round(un * qty, 2);
    lv   := round(ln * rate / 100, 2);
    lg   := round(g * qty, 2);
    s_net := s_net + ln; s_vat := s_vat + lv; s_gross := s_gross + lg;
    out := out || ((e - 'vat_exemption_code') || jsonb_build_object(
      'quantity', qty, 'qty', qty, 'price', g, 'tax_rate', rate, 'vat_category', cat,
      'unit_net', un, 'net', un, 'vat', g - un,
      'line_net', ln, 'line_vat', lv, 'total', lg)
      || CASE WHEN code IS NOT NULL THEN jsonb_build_object('vat_exemption_code', code) ELSE '{}'::JSONB END);
  END LOOP;
  RETURN jsonb_build_object('items', out, 'subtotal', s_net, 'tax_amount', s_vat, 'total', s_gross,
                            'rounding', s_gross - s_net - s_vat);
END $$;
GRANT EXECUTE ON FUNCTION public.felsy_price_lines(JSONB) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3) تسعير المستند كامل مع الخصم (الطريقة المعتمدة بالمدقق الرسمي)
--    الخصم (شامل الضريبة) يتوزع على فئات الضريبة بنسبة إجمالي كل فئة،
--    والباقي للفئة الأخيرة. خصم الفئة القياسية بدون ضريبة = round(خصم ÷ 1.15).
--    ضريبة الفئة: بدون خصم = مجموع ضرائب الأسطر (مثل 025)
--                 مع خصم   = round(الخاضع بعد الخصم × النسبة)
--    العميل يدفع: مجموع الأسعار الشاملة − الخصم. الفرق هللات = تقريب.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_price_doc(p_items JSONB, p_discount NUMERIC DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  p JSONB; d NUMERIC; gr RECORD; n_groups INT; i INT := 0; allocated NUMERIC := 0;
  dg NUMERIC; allow NUMERIC; taxable NUMERIC; tax NUMERIC;
  t_gross NUMERIC; t_lines NUMERIC := 0; t_allow NUMERIC := 0; t_tax NUMERIC := 0; brk JSONB := '[]'::JSONB;
BEGIN
  p := public.felsy_price_lines(p_items);
  IF p IS NULL THEN RETURN NULL; END IF;
  d := round(coalesce(p_discount, 0), 2);
  t_gross := (p->>'total')::NUMERIC;
  IF d < 0 THEN RAISE EXCEPTION 'الخصم لا يكون بالسالب'; END IF;
  IF d > 0 AND d >= t_gross THEN RAISE EXCEPTION 'الخصم لازم يكون أقل من إجمالي الفاتورة'; END IF;

  SELECT count(*) INTO n_groups FROM (
    SELECT DISTINCT e->>'vat_category', e->>'vat_exemption_code' FROM jsonb_array_elements(p->'items') e) x;

  FOR gr IN
    SELECT e->>'vat_category' AS cat, (e->>'tax_rate')::NUMERIC AS rate, e->>'vat_exemption_code' AS code,
           sum((e->>'line_net')::NUMERIC) AS net, sum((e->>'line_vat')::NUMERIC) AS lvat, sum((e->>'total')::NUMERIC) AS gross
      FROM jsonb_array_elements(p->'items') e
     GROUP BY 1, 2, 3
     ORDER BY (e->>'vat_category') = 'S' DESC, 1, 3
  LOOP
    i := i + 1;
    dg := CASE WHEN d = 0 THEN 0 WHEN i = n_groups THEN d - allocated ELSE round(d * gr.gross / t_gross, 2) END;
    allocated := allocated + dg;
    allow := CASE WHEN gr.rate > 0 THEN round(dg / (1 + gr.rate / 100), 2) ELSE dg END;
    taxable := gr.net - allow;
    IF taxable < 0 THEN RAISE EXCEPTION 'الخصم أكبر من قيمة الأصناف — قلّله'; END IF;
    tax := CASE WHEN d = 0 THEN gr.lvat ELSE round(taxable * gr.rate / 100, 2) END;
    t_lines := t_lines + gr.net; t_allow := t_allow + allow; t_tax := t_tax + tax;
    brk := brk || jsonb_build_object('category', gr.cat, 'rate', gr.rate, 'code', gr.code, 'reason', public.felsy_vat_reason(gr.code),
                                     'lines_net', gr.net, 'discount', dg, 'allowance', allow, 'taxable', taxable, 'tax', tax);
  END LOOP;

  RETURN jsonb_build_object(
    'items', p->'items', 'lines_net', t_lines, 'discount', d, 'discount_net', t_allow,
    'subtotal', t_lines - t_allow, 'tax_amount', t_tax, 'total', t_gross - d,
    'rounding', (t_gross - d) - (t_lines - t_allow) - t_tax, 'breakdown', brk);
END $$;
GRANT EXECUTE ON FUNCTION public.felsy_price_doc(JSONB, NUMERIC) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- 4) العميل التجاري (B2B): الاسم القانوني + الرقم الضريبي + العنوان الوطني
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cr_number TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_street TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_building TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_district TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_city TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_postal TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS addr_additional TEXT;

CREATE OR REPLACE FUNCTION public.customers_b2b_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.vat_number := nullif(regexp_replace(coalesce(NEW.vat_number, ''), '\s', '', 'g'), '');
  NEW.cr_number  := nullif(regexp_replace(coalesce(NEW.cr_number, ''), '\s', '', 'g'), '');
  IF NEW.vat_number IS NOT NULL AND NEW.vat_number !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'الرقم الضريبي للعميل 15 رقم يبدأ وينتهي بـ 3'; END IF;
  IF NEW.cr_number IS NOT NULL AND NEW.cr_number !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'السجل التجاري للعميل 10 أرقام'; END IF;
  IF nullif(NEW.addr_building, '') IS NOT NULL AND NEW.addr_building !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'رقم المبنى 4 أرقام (من العنوان الوطني)'; END IF;
  IF nullif(NEW.addr_postal, '') IS NOT NULL AND NEW.addr_postal !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'الرمز البريدي 5 أرقام'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_customers_b2b_rules ON public.customers;
CREATE TRIGGER trg_customers_b2b_rules BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_b2b_rules();

-- لقطة المشتري وقت الإصدار (الفاتورة ما تتغير لو تعدّل ملف العميل لاحقاً)
CREATE OR REPLACE FUNCTION public.felsy_buyer_snapshot(p_tenant UUID, p_customer UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer AND tenant_id = p_tenant;
  IF c.id IS NULL THEN RAISE EXCEPTION 'الفاتورة الضريبية للشركات تحتاج اختيار العميل (المنشأة المشترية)'; END IF;
  IF c.vat_number IS NULL AND c.cr_number IS NULL THEN
    RAISE EXCEPTION 'العميل % بدون رقم ضريبي أو سجل تجاري — أضفه في ملف العميل', c.name;
  END IF;
  IF coalesce(trim(c.addr_street), '') = '' OR coalesce(c.addr_building, '') !~ '^[0-9]{4}$' OR coalesce(trim(c.addr_district), '') = ''
     OR coalesce(trim(c.addr_city), '') = '' OR coalesce(c.addr_postal, '') !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'أكمل العنوان الوطني للعميل % (الشارع، المبنى 4 أرقام، الحي، المدينة، الرمز البريدي)', c.name;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'customer_id', c.id, 'name', coalesce(nullif(trim(c.legal_name), ''), c.name), 'vat_number', c.vat_number, 'cr_number', c.cr_number,
    'street', trim(c.addr_street), 'building', c.addr_building, 'district', trim(c.addr_district), 'city', trim(c.addr_city),
    'postal', c.addr_postal, 'additional', nullif(trim(c.addr_additional), ''), 'country', 'SA', 'phone', c.phone));
END $$;
REVOKE ALL ON FUNCTION public.felsy_buyer_snapshot(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- أنواع الفواتير اللي انربط بها الفرع فعلاً (الشهادة تحددها) — تغيير الخيار
-- في الإعدادات ما يكفي، لازم إعادة ربط برمز OTP جديد
ALTER TABLE public.zatca_config ADD COLUMN IF NOT EXISTS onboarded_types TEXT;
UPDATE public.zatca_config SET onboarded_types = invoice_types WHERE onboarding_status = 'active' AND onboarded_types IS NULL;
CREATE OR REPLACE FUNCTION public.zatca_config_onboarded_types()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.onboarding_status = 'active' AND (TG_OP = 'INSERT' OR NEW.activated_at IS DISTINCT FROM OLD.activated_at OR OLD.onboarding_status IS DISTINCT FROM 'active') THEN
    NEW.onboarded_types := NEW.invoice_types;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_zatca_config_onboarded_types ON public.zatca_config;
CREATE TRIGGER trg_zatca_config_onboarded_types BEFORE INSERT OR UPDATE ON public.zatca_config
  FOR EACH ROW EXECUTE FUNCTION public.zatca_config_onboarded_types();
GRANT SELECT (onboarded_types) ON public.zatca_config TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 5) الطلبات: أعمدة الخصم والفئات والمشتري
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS lines_net NUMERIC(12,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_net NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_breakdown JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer JSONB;
ALTER TABLE public.orders ALTER COLUMN is_b2b SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.orders_invoice_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p JSONB; v_seq BIGINT; v_items JSONB; v_types TEXT; v_active BOOLEAN;
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
       OR NEW.discount_net IS DISTINCT FROM OLD.discount_net OR NEW.lines_net IS DISTINCT FROM OLD.lines_net
       OR NEW.tax_breakdown IS DISTINCT FROM OLD.tax_breakdown OR NEW.buyer IS DISTINCT FROM OLD.buyer
       OR NEW.is_b2b IS DISTINCT FROM OLD.is_b2b OR NEW.customer_id IS DISTINCT FROM OLD.customer_id AND OLD.is_b2b
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
    NEW.invoice_seq := NULL; NEW.invoice_no := NULL; NEW.invoiced_at := NULL; NEW.buyer := NULL;
  END IF;

  -- الفئة الضريبية للصنف من ملف الصنف (مو من الجهاز)
  IF jsonb_typeof(NEW.items) = 'array' AND NEW.tenant_id IS NOT NULL THEN
    SELECT jsonb_agg(CASE WHEN pr.id IS NULL THEN e
                          ELSE (e - 'vat_exemption_code') || jsonb_build_object('vat_category', pr.vat_category, 'tax_rate', CASE WHEN pr.vat_category = 'S' THEN 15 ELSE 0 END)
                               || CASE WHEN pr.vat_exemption_code IS NOT NULL THEN jsonb_build_object('vat_exemption_code', pr.vat_exemption_code) ELSE '{}'::JSONB END
                     END ORDER BY ord)
      INTO v_items
      FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS x(e, ord)
      LEFT JOIN public.products pr ON pr.tenant_id = NEW.tenant_id
            AND (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND pr.id = (e->>'product_id')::UUID;
    NEW.items := v_items;
  END IF;

  p := public.felsy_price_doc(NEW.items, coalesce(NEW.discount_amount, 0));
  IF p IS NOT NULL THEN
    NEW.items := p->'items';
    NEW.lines_net := (p->>'lines_net')::NUMERIC;
    NEW.discount_amount := (p->>'discount')::NUMERIC;
    NEW.discount_net := (p->>'discount_net')::NUMERIC;
    NEW.subtotal := (p->>'subtotal')::NUMERIC;
    NEW.tax_amount := (p->>'tax_amount')::NUMERIC;
    NEW.total := (p->>'total')::NUMERIC;
    NEW.rounding_amount := (p->>'rounding')::NUMERIC;
    NEW.tax_breakdown := p->'breakdown';
  END IF;

  -- الإصدار
  -- طلبات المنيو الأونلاين ما تُفوتر لحظة الطلب (العميل ما دفع بعد) — تُفوتر عند الإكمال
  IF NEW.invoice_seq IS NULL AND coalesce(NEW.status, '') <> 'cancelled'
     AND ((NEW.payment_method IS NOT NULL AND coalesce(NEW.source, '') <> 'online') OR NEW.status = 'completed')
     AND NEW.tenant_id IS NOT NULL AND p IS NOT NULL THEN
    IF coalesce(NEW.is_b2b, false) THEN
      NEW.buyer := public.felsy_buyer_snapshot(NEW.tenant_id, NEW.customer_id);
      SELECT coalesce(c.onboarded_types, c.invoice_types), c.onboarding_status = 'active' INTO v_types, v_active FROM public.zatca_config c WHERE c.branch_id = NEW.branch_id;
      IF coalesce(v_active, false) AND left(coalesce(v_types, '0100'), 1) <> '1' THEN
        RAISE EXCEPTION 'الفرع مربوط بالهيئة للفواتير المبسطة فقط — فعّل "فواتير الشركات" من مركز الفوترة وأعد الربط';
      END IF;
    END IF;
    v_seq := public.next_doc_seq(NEW.tenant_id, 'invoice');
    NEW.invoice_seq := v_seq;
    NEW.invoice_no := 'INV-' || lpad(v_seq::TEXT, 6, '0');
    NEW.invoiced_at := now();
    NEW.zatca_status := 'pending';
  END IF;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) المرتجع: يرث الخصم بالتناسب + نوع الفاتورة والمشتري
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS lines_net NUMERIC(12,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_net NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_breakdown JSONB;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS buyer JSONB;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_return(p_order UUID, p_items JSONB, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD; it JSONB; orig JSONB; v_qty NUMERIC; v_sold NUMERIC; v_prev NUMERIC;
  v_lines JSONB := '[]'::JSONB; p JSONB; v_seq BIGINT; v_num TEXT; v_ret UUID; v_cn UUID;
  v_gross NUMERIC; v_orig_gross NUMERIC; v_disc NUMERIC := 0; v_disc_prev NUMERIC; v_all_back BOOLEAN;
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
    v_lines := v_lines || (jsonb_build_object('product_id', orig->>'product_id', 'name', orig->>'name',
                 'quantity', v_qty, 'price', (orig->>'price')::NUMERIC, 'tax_rate', coalesce((orig->>'tax_rate')::NUMERIC, 15),
                 'vat_category', coalesce(orig->>'vat_category', 'S'))
                 || CASE WHEN orig ? 'vat_exemption_code' THEN jsonb_build_object('vat_exemption_code', orig->>'vat_exemption_code') ELSE '{}'::JSONB END);
  END LOOP;

  -- الخصم بالتناسب (وآخر مرتجع يأخذ الباقي بالضبط)
  IF coalesce(o.discount_amount, 0) > 0 THEN
    v_gross := (public.felsy_price_lines(v_lines)->>'total')::NUMERIC;
    v_orig_gross := o.total + o.discount_amount;
    SELECT coalesce(sum(i.discount_amount), 0) INTO v_disc_prev FROM public.invoices i
     WHERE i.order_id = o.id AND i.invoice_type = 'credit_note';
    SELECT bool_and(coalesce((SELECT sum((r->>'quantity')::NUMERIC) FROM public.returns rt, jsonb_array_elements(rt.items) r
                               WHERE rt.original_order_id = o.id AND r->>'product_id' = e->>'product_id'), 0)
                    + coalesce((SELECT sum((n->>'quantity')::NUMERIC) FROM jsonb_array_elements(v_lines) n WHERE n->>'product_id' = e->>'product_id'), 0)
                    >= coalesce((e->>'quantity')::NUMERIC, 1))
      INTO v_all_back FROM jsonb_array_elements(o.items) e;
    v_disc := CASE WHEN v_all_back THEN o.discount_amount - v_disc_prev
                   ELSE least(round(o.discount_amount * v_gross / v_orig_gross, 2), o.discount_amount - v_disc_prev) END;
    v_disc := greatest(v_disc, 0);
  END IF;

  p := public.felsy_price_doc(v_lines, v_disc);
  IF p IS NULL OR (p->>'total')::NUMERIC <= 0 THEN RAISE EXCEPTION 'لا توجد أصناف مرتجعة'; END IF;

  v_seq := public.next_doc_seq(o.tenant_id, 'credit');
  v_num := 'CN-' || lpad(v_seq::TEXT, 6, '0');
  INSERT INTO public.invoices (tenant_id, branch_id, invoice_type, original_invoice_id, order_id, customer_id, invoice_number, invoice_seq,
                               items, lines_net, discount_amount, discount_net, subtotal, vat_amount, total, rounding_amount, tax_breakdown,
                               is_b2b, buyer, reason, zatca_status, uuid)
  VALUES (o.tenant_id, o.branch_id, 'credit_note', o.zatca_invoice_id, o.id, o.customer_id, v_num, v_seq,
          p->'items', (p->>'lines_net')::NUMERIC, (p->>'discount')::NUMERIC, (p->>'discount_net')::NUMERIC,
          (p->>'subtotal')::NUMERIC, (p->>'tax_amount')::NUMERIC, (p->>'total')::NUMERIC, (p->>'rounding')::NUMERIC, p->'breakdown',
          coalesce(o.is_b2b, false), o.buyer, left(p_reason, 300), 'pending', gen_random_uuid()::TEXT)
  RETURNING id INTO v_cn;

  INSERT INTO public.returns (tenant_id, branch_id, return_number, type, status, original_order_id, original_order_number,
                              items, reason, refund_amount, subtotal, vat_amount, credit_note_id, processed_by)
  VALUES (o.tenant_id, o.branch_id, v_num, 'refund', 'completed', o.id, coalesce(o.invoice_no, o.order_number),
          p->'items', left(p_reason, 300), (p->>'total')::NUMERIC, (p->>'subtotal')::NUMERIC, (p->>'tax_amount')::NUMERIC, v_cn, auth.uid()::TEXT)
  RETURNING id INTO v_ret;

  RETURN jsonb_build_object('return_id', v_ret, 'credit_note_id', v_cn, 'number', v_num,
                            'total', (p->>'total')::NUMERIC, 'vat', (p->>'tax_amount')::NUMERIC, 'subtotal', (p->>'subtotal')::NUMERIC,
                            'discount', (p->>'discount')::NUMERIC, 'discount_net', (p->>'discount_net')::NUMERIC, 'lines_net', (p->>'lines_net')::NUMERIC,
                            'rounding', (p->>'rounding')::NUMERIC, 'items', p->'items',
                            'breakdown', p->'breakdown', 'is_b2b', coalesce(o.is_b2b, false), 'buyer', o.buyer,
                            'original', coalesce(o.invoice_no, o.order_number));
END $$;
REVOKE ALL ON FUNCTION public.create_return(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return(UUID, JSONB, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 7) المحرك: تحميل المستند بكل بياناته الضريبية
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zatca_load_doc(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  IF p_kind = 'invoice' THEN
    SELECT jsonb_build_object('kind', 'invoice', 'id', o.id, 'tenant_id', o.tenant_id, 'branch_id', o.branch_id,
             'number', o.invoice_no, 'issued_at', o.invoiced_at, 'items', o.items, 'subtotal', o.subtotal,
             'tax_amount', o.tax_amount, 'total', o.total, 'rounding', o.rounding_amount, 'payment_method', o.payment_method,
             'lines_net', o.lines_net, 'discount', coalesce(o.discount_amount, 0), 'discount_net', coalesce(o.discount_net, 0),
             'breakdown', o.tax_breakdown, 'is_b2b', coalesce(o.is_b2b, false), 'buyer', o.buyer,
             'customer_id', o.customer_id, 'zatca_invoice_id', o.zatca_invoice_id)
      INTO r FROM public.orders o WHERE o.id = p_id AND o.invoice_seq IS NOT NULL;
  ELSIF p_kind = 'credit' THEN
    SELECT jsonb_build_object('kind', 'credit', 'id', i.id, 'tenant_id', i.tenant_id, 'branch_id', i.branch_id,
             'number', i.invoice_number, 'issued_at', i.created_at, 'items', i.items, 'subtotal', i.subtotal,
             'tax_amount', i.vat_amount, 'total', i.total, 'rounding', i.rounding_amount, 'reason', i.reason,
             'lines_net', i.lines_net, 'discount', coalesce(i.discount_amount, 0), 'discount_net', coalesce(i.discount_net, 0),
             'breakdown', i.tax_breakdown, 'is_b2b', coalesce(i.is_b2b, false), 'buyer', coalesce(i.buyer, o.buyer),
             'zatca_invoice_id', i.zatca_invoice_id,
             'original_number', o.invoice_no, 'original_issued_at', o.invoiced_at, 'payment_method', o.payment_method)
      INTO r FROM public.invoices i JOIN public.orders o ON o.id = i.order_id
     WHERE i.id = p_id AND i.invoice_type = 'credit_note';
  ELSE
    RAISE EXCEPTION 'نوع مستند غير معروف';
  END IF;
  RETURN r;
END $$;

-- نتيجة الإرسال + QR المعتمد من الهيئة (فواتير الشركات بعد الاعتماد)
DROP FUNCTION IF EXISTS public.zatca_mark(UUID, TEXT, JSONB, JSONB, TEXT);
CREATE OR REPLACE FUNCTION public.zatca_mark(p_doc UUID, p_status TEXT, p_warnings JSONB, p_errors JSONB,
                                             p_cleared_xml TEXT DEFAULT NULL, p_qr TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE z RECORD;
BEGIN
  UPDATE public.zatca_invoices SET
    zatca_status = p_status, zatca_warnings = p_warnings, zatca_errors = p_errors,
    zatca_submitted_at = now(), attempts = attempts + 1,
    reported_at = CASE WHEN p_status IN ('reported','cleared','reported_warnings','cleared_warnings') THEN now() ELSE reported_at END,
    zatca_cleared_at = CASE WHEN p_status LIKE 'cleared%' THEN now() ELSE zatca_cleared_at END,
    xml_document = coalesce(p_cleared_xml, xml_document),
    qr_code = coalesce(p_qr, qr_code),
    next_attempt_at = CASE WHEN p_status = 'error' THEN now() + make_interval(mins => least(60, power(2, least(attempts, 6))::INT)) ELSE NULL END,
    updated_at = now()
  WHERE id = p_doc RETURNING * INTO z;
  IF z.doc_kind = 'invoice' THEN
    UPDATE public.orders SET zatca_status = p_status, zatca_qr = coalesce(p_qr, zatca_qr) WHERE id = z.order_id;
  ELSE
    UPDATE public.invoices SET zatca_status = p_status, zatca_qr = coalesce(p_qr, zatca_qr), qr_code = coalesce(p_qr, qr_code) WHERE id = z.credit_note_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.zatca_mark(UUID, TEXT, JSONB, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zatca_mark(UUID, TEXT, JSONB, JSONB, TEXT, TEXT) TO service_role;

-- حالة الفرع + هل يدعم فواتير الشركات
CREATE OR REPLACE FUNCTION public.zatca_branch_status(p_branch UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'configured', c.id IS NOT NULL, 'status', coalesce(c.onboarding_status, 'not_started'), 'environment', c.environment,
    'error', c.onboarding_error, 'activated_at', c.activated_at, 'counter', coalesce(c.invoice_counter, 0),
    'cert_expires_at', c.pcsid_expires_at, 'invoice_types', coalesce(c.invoice_types, '0100'),
    'onboarded_types', c.onboarded_types,
    'supports_b2b', left(coalesce(c.onboarded_types, c.invoice_types, '0100'), 1) = '1' OR coalesce(c.onboarding_status, '') <> 'active',
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

-- ─────────────────────────────────────────────────────────────────
-- 8) ضريبة المدخلات غير المدفوعة خلال 12 شهر (اللائحة التنفيذية)
--    فاتورة شراء خُصمت ضريبتها ولم تُدفع للمورد خلال 12 شهر من تاريخ
--    الاستحقاق ⇒ تُعكس الضريبة في إقرار الفترة اللي تكمل فيها المدة،
--    وتُسترد في الفترة اللي يتم فيها الدفع لاحقاً.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_at DATE;

CREATE OR REPLACE FUNCTION public.purchase_invoice_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_date > current_date THEN RAISE EXCEPTION 'تاريخ الفاتورة في المستقبل'; END IF;
  IF NEW.claim_date < NEW.invoice_date THEN NEW.claim_date := NEW.invoice_date; END IF;
  IF NEW.vat_amount > round(NEW.net_amount * 0.15, 2) + 0.05 THEN
    RAISE EXCEPTION 'الضريبة أكبر من 15%% من المبلغ قبل الضريبة — راجع الأرقام';
  END IF;
  IF NEW.paid AND NEW.paid_at IS NULL THEN NEW.paid_at := greatest(NEW.invoice_date, least(current_date, coalesce(NEW.due_date, NEW.invoice_date))); END IF;
  IF NOT NEW.paid THEN NEW.paid_at := NULL; END IF;
  IF NEW.due_date IS NOT NULL AND NEW.due_date < NEW.invoice_date THEN RAISE EXCEPTION 'تاريخ الاستحقاق قبل تاريخ الفاتورة'; END IF;
  IF NEW.deductible THEN
    IF NEW.supplier_vat IS NULL THEN
      RAISE EXCEPTION 'لخصم الضريبة لازم الرقم الضريبي للمورد (المورد غير المسجل ما يحق له تحصيل ضريبة)';
    END IF;
    IF NOT NEW.paid AND NEW.claim_date >= (coalesce(NEW.due_date, NEW.invoice_date) + interval '12 months')::DATE THEN
      RAISE EXCEPTION 'فاتورة غير مدفوعة مضى على استحقاقها 12 شهر — لا تُخصم ضريبتها إلا بعد الدفع';
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

-- مبلغ فئة ضريبية من تفصيل المستند (مستند قديم بدون تفصيل = كله قياسي)
CREATE OR REPLACE FUNCTION public.felsy_cat_amount(p_brk JSONB, p_subtotal NUMERIC, p_kind TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_brk IS NULL OR jsonb_typeof(p_brk) <> 'array' OR jsonb_array_length(p_brk) = 0 THEN CASE WHEN p_kind = 'S' THEN coalesce(p_subtotal, 0) ELSE 0 END
    ELSE coalesce((SELECT sum((b->>'taxable')::NUMERIC) FROM jsonb_array_elements(p_brk) b
                    WHERE CASE p_kind
                      WHEN 'S' THEN b->>'category' = 'S'
                      WHEN 'ZD' THEN b->>'category' = 'Z' AND coalesce(b->>'code', '') NOT IN ('VATEX-SA-32','VATEX-SA-33')
                      WHEN 'X' THEN b->>'category' = 'Z' AND b->>'code' IN ('VATEX-SA-32','VATEX-SA-33')
                      WHEN 'E' THEN b->>'category' = 'E'
                      WHEN 'O' THEN b->>'category' = 'O' END), 0) END;
$$;

-- الإقرار بخانات الهيئة: 1 قياسية، 3 صفرية محلية، 4 صادرات، 5 معفاة (خارج النطاق لا يُقرّ)
CREATE OR REPLACE FUNCTION public.vat_return(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (SELECT public.my_tenant_id() AS id),
  s AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(tax_amount), 0) vat, count(*) n,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'S')), 0) std,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'ZD')), 0) zd,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'X')), 0) x,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'E')), 0) e,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'O')), 0) o
      FROM public.orders, t
     WHERE orders.tenant_id = t.id AND invoice_seq IS NOT NULL
       AND invoiced_at >= p_from AND invoiced_at < p_to + 1),
  r AS (
    SELECT coalesce(sum(subtotal), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'S')), 0) std,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'ZD')), 0) zd,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'X')), 0) x,
           coalesce(sum(public.felsy_cat_amount(tax_breakdown, subtotal, 'E')), 0) e
      FROM public.invoices, t
     WHERE invoices.tenant_id = t.id AND invoice_type = 'credit_note' AND created_at >= p_from AND created_at < p_to + 1),
  p AS (
    SELECT coalesce(sum(net_amount) FILTER (WHERE deductible), 0) net, coalesce(sum(vat_amount) FILTER (WHERE deductible), 0) vat,
           count(*) FILTER (WHERE deductible) n,
           coalesce(sum(net_amount) FILTER (WHERE deductible AND invoice_kind = 'customs'), 0) imp_net,
           coalesce(sum(vat_amount) FILTER (WHERE deductible AND invoice_kind = 'customs'), 0) imp_vat,
           coalesce(sum(vat_amount) FILTER (WHERE NOT deductible), 0) blocked_vat
      FROM public.purchase_invoices, t
     WHERE purchase_invoices.tenant_id = t.id AND claim_date BETWEEN p_from AND p_to),
  -- عكس: خُصمت سابقاً ولم تُدفع وأكملت 12 شهر من الاستحقاق داخل هذه الفترة
  adj AS (
    SELECT coalesce(sum(net_amount), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n
      FROM public.purchase_invoices, t
     WHERE purchase_invoices.tenant_id = t.id AND deductible AND NOT paid
       AND claim_date < (coalesce(due_date, invoice_date) + interval '12 months')::DATE
       AND (coalesce(due_date, invoice_date) + interval '12 months')::DATE BETWEEN p_from AND p_to),
  -- استرداد: دُفعت في هذه الفترة بعد ما انعكست
  rec AS (
    SELECT coalesce(sum(net_amount), 0) net, coalesce(sum(vat_amount), 0) vat, count(*) n
      FROM public.purchase_invoices, t
     WHERE purchase_invoices.tenant_id = t.id AND deductible AND paid AND paid_at BETWEEN p_from AND p_to
       AND claim_date < (coalesce(due_date, invoice_date) + interval '12 months')::DATE
       AND paid_at > (coalesce(due_date, invoice_date) + interval '12 months')::DATE)
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales_net', s.net, 'sales_vat', s.vat, 'sales_count', s.n,
    'sales_standard', s.std, 'sales_zero_rated', s.zd, 'sales_exports', s.x, 'sales_exempt', s.e, 'sales_out_of_scope', s.o,
    'returns_net', r.net, 'returns_vat', r.vat, 'returns_count', r.n,
    'returns_standard', r.std, 'returns_zero_rated', r.zd, 'returns_exports', r.x, 'returns_exempt', r.e,
    'purchases_net', p.net, 'purchases_vat', p.vat, 'purchases_count', p.n, 'purchases_blocked_vat', p.blocked_vat,
    'imports_net', p.imp_net, 'imports_vat', p.imp_vat,
    'input_reversal_net', adj.net, 'input_reversal_vat', adj.vat, 'input_reversal_count', adj.n,
    'input_recovery_net', rec.net, 'input_recovery_vat', rec.vat, 'input_recovery_count', rec.n,
    'output_vat', s.vat - r.vat, 'input_vat', p.vat - adj.vat + rec.vat,
    'net_due', (s.vat - r.vat) - (p.vat - adj.vat + rec.vat)
  ) FROM s, r, p, adj, rec;
$$;
REVOKE ALL ON FUNCTION public.vat_return(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vat_return(DATE, DATE) TO authenticated;

-- تنبيه: مشتريات غير مدفوعة تقترب من 12 شهر (للوحة والإشعارات)
CREATE OR REPLACE FUNCTION public.unpaid_input_vat_alerts()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'supplier', supplier_name, 'number', invoice_number,
           'vat', vat_amount, 'deadline', (coalesce(due_date, invoice_date) + interval '12 months')::DATE) ORDER BY coalesce(due_date, invoice_date)), '[]'::JSONB)
    FROM public.purchase_invoices
   WHERE tenant_id = public.my_tenant_id() AND deductible AND NOT paid
     AND (coalesce(due_date, invoice_date) + interval '12 months')::DATE <= current_date + 45;
$$;
GRANT EXECUTE ON FUNCTION public.unpaid_input_vat_alerts() TO authenticated;

INSERT INTO public.migration_status (migration, note) VALUES (
  '027_einvoicing_complete',
  'أصناف صفرية/معفاة برموز الهيئة، خصم الفاتورة، فواتير الشركات B2B مع الاعتماد، قاعدة 12 شهر لضريبة المدخلات.'
) ON CONFLICT (migration) DO NOTHING;
