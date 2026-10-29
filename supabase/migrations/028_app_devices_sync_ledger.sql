-- ══════════════════════════════════════════════════════════════════
-- فلسي v26 — خلفية تطبيق فلسي (ويندوز / آيفون / أندرويد)
--  1) أجهزة التطبيق: كل جهاز له رمز (D1، D2…) وسلسلة فواتير خاصة فيه
--     INV-D1-000001 ⇒ الجهاز يصدر رقم الفاتورة حتى بدون إنترنت، والسيرفر
--     يتحقق منه عند الرفع ويحفظ وقت البيع الأصلي (للهيئة)
--  2) رفع البيع بشكل آمن للتكرار (نفس البيع مرتين = بيع واحد)
--  3) مزامنة خفيفة: المتغير فقط منذ آخر مزامنة
--  4) تنبيهات ذكية (نقص مخزون، فواتير متأخرة للهيئة، شهادة، إقرار، اشتراك)
--  5) لوحة مختصرة للتطبيق
--  6) المخزون يتحدث تلقائياً مع البيع والمرتجع (مع سجل الحركة)
--  7) القيود المحاسبية تلقائية: مبيعات، مرتجعات، مشتريات، مصروفات
-- شغّله بعد 027. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1) أجهزة التطبيق
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_devices (
  id            UUID PRIMARY KEY,                       -- يولّده التطبيق عند التثبيت
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  code          TEXT NOT NULL,                          -- D1، D2… يطبع في رقم الفاتورة
  name          TEXT,
  platform      TEXT,
  app_version   TEXT,
  registered_by UUID,
  last_seq      BIGINT NOT NULL DEFAULT 0,              -- آخر رقم فاتورة استلمه السيرفر من الجهاز
  last_seen_at  TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE public.app_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_devices_read ON public.app_devices;
CREATE POLICY app_devices_read ON public.app_devices FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
REVOKE INSERT, UPDATE, DELETE ON public.app_devices FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_register_device(p_device UUID, p_name TEXT, p_platform TEXT, p_version TEXT, p_branch UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; d RECORD; v_n BIGINT;
BEGIN
  SELECT t INTO v_tenant FROM public.current_paid_tenant_ids() t LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'الاشتراك غير فعّال — جدّده من الموقع'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch AND tenant_id = v_tenant) THEN
    p_branch := NULL;
  END IF;
  SELECT * INTO d FROM public.app_devices WHERE id = p_device FOR UPDATE;
  IF d.id IS NOT NULL THEN
    IF d.tenant_id <> v_tenant THEN RAISE EXCEPTION 'device_other_tenant'; END IF;
    IF d.revoked THEN RAISE EXCEPTION 'هذا الجهاز موقوف من صاحب المنشأة'; END IF;
    UPDATE public.app_devices SET name = coalesce(left(nullif(trim(p_name), ''), 60), name), platform = left(p_platform, 20),
           app_version = left(p_version, 20), branch_id = coalesce(p_branch, branch_id), last_seen_at = now()
     WHERE id = p_device RETURNING * INTO d;
  ELSE
    IF (SELECT count(*) FROM public.app_devices WHERE tenant_id = v_tenant AND NOT revoked) >= 50 THEN
      RAISE EXCEPTION 'وصلت الحد الأعلى للأجهزة (50) — أوقف جهاز قديم من الإعدادات';
    END IF;
    v_n := public.next_doc_seq(v_tenant, 'device');
    INSERT INTO public.app_devices (id, tenant_id, branch_id, code, name, platform, app_version, registered_by, last_seen_at)
    VALUES (p_device, v_tenant, p_branch, 'D' || v_n, left(coalesce(nullif(trim(p_name), ''), 'جهاز ' || v_n), 60),
            left(p_platform, 20), left(p_version, 20), auth.uid(), now())
    RETURNING * INTO d;
  END IF;
  RETURN jsonb_build_object('id', d.id, 'code', d.code, 'last_seq', d.last_seq, 'branch_id', d.branch_id, 'tenant_id', d.tenant_id);
END $$;
REVOKE ALL ON FUNCTION public.app_register_device(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_register_device(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- إيقاف جهاز (ضاع أو انسرق) — المالك/المدير
CREATE OR REPLACE FUNCTION public.app_revoke_device(p_device UUID, p_revoke BOOLEAN DEFAULT true)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.app_devices d SET revoked = p_revoke
   WHERE d.id = p_device AND d.tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu
          WHERE tu.auth_id = auth.uid() AND tu.is_active AND tu.role IN ('owner', 'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'متاح لمالك المنشأة فقط'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.app_revoke_device(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_revoke_device(UUID, BOOLEAN) TO authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_seq BIGINT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_issued_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_invoice_no_uq ON public.orders(tenant_id, invoice_no) WHERE invoice_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tenant_invoiced_idx ON public.orders(tenant_id, invoiced_at DESC) WHERE invoice_seq IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2) حارس الفواتير (النسخة النهائية): 027 + أرقام أجهزة التطبيق
--    الرقم من الجهاز يُقبل فقط إذا الجهاز تابع للمنشأة وغير موقوف
--    ورقمه ما استُخدم. وقت البيع الأصلي يُقبل ضمن 30 يوماً للخلف.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_invoice_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p JSONB; v_seq BIGINT; v_items JSONB; v_types TEXT; v_active BOOLEAN; dev RECORD;
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
       OR NEW.device_id IS DISTINCT FROM OLD.device_id OR NEW.device_seq IS DISTINCT FROM OLD.device_seq
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

  IF NOT public.felsy_is_server() THEN
    NEW.zatca_status := NULL; NEW.zatca_uuid := NULL; NEW.zatca_qr := NULL; NEW.zatca_invoice_id := NULL;
    NEW.invoice_seq := NULL; NEW.invoice_no := NULL; NEW.invoiced_at := NULL; NEW.buyer := NULL;
  END IF;

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
    NEW.invoiced_at := now();
    IF NEW.device_id IS NOT NULL OR NEW.device_seq IS NOT NULL THEN
      -- رقم من جهاز التطبيق (يشتغل بدون إنترنت)
      SELECT * INTO dev FROM public.app_devices WHERE id = NEW.device_id AND tenant_id = NEW.tenant_id FOR UPDATE;
      IF dev.id IS NULL THEN RAISE EXCEPTION 'الجهاز غير مسجل لهذه المنشأة — سجّل الدخول في التطبيق من جديد'; END IF;
      IF dev.revoked THEN RAISE EXCEPTION 'هذا الجهاز موقوف من صاحب المنشأة'; END IF;
      IF coalesce(NEW.device_seq, 0) < 1 THEN RAISE EXCEPTION 'رقم فاتورة الجهاز غير صحيح'; END IF;
      NEW.invoice_no := 'INV-' || dev.code || '-' || lpad(NEW.device_seq::TEXT, 6, '0');
      IF EXISTS (SELECT 1 FROM public.orders o WHERE o.tenant_id = NEW.tenant_id AND o.invoice_no = NEW.invoice_no) THEN
        RAISE EXCEPTION 'duplicate_device_invoice:%', NEW.invoice_no;
      END IF;
      IF NEW.client_issued_at IS NOT NULL AND NEW.client_issued_at BETWEEN now() - interval '30 days' AND now() + interval '5 minutes' THEN
        NEW.invoiced_at := least(NEW.client_issued_at, now());
      END IF;
      UPDATE public.app_devices SET last_seq = greatest(last_seq, NEW.device_seq), last_seen_at = now() WHERE id = dev.id;
    ELSE
      NEW.invoice_no := 'INV-' || lpad(v_seq::TEXT, 6, '0');
    END IF;
    NEW.zatca_status := 'pending';
  END IF;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3) رفع بيع من التطبيق — آمن للتكرار (المعرّف من الجهاز)
--    نفس البيع لو انرفع مرتين (انقطع النت وقت الرد) يرجع نفس الفاتورة
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_submit_sale(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID; o RECORD; v_new BOOLEAN := false; v_stamp JSONB;
BEGIN
  v_id := (p->>'id')::UUID;
  IF v_id IS NULL THEN RAISE EXCEPTION 'معرّف البيع مطلوب'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_id;
  IF o.id IS NULL THEN
    BEGIN
      INSERT INTO public.orders (id, order_number, branch_id, status, order_type, payment_method, items, discount_amount, discount_type,
                                 customer_id, customer_name, customer_phone, cashier_name, notes, table_number, is_b2b, source,
                                 amount_paid, change_due, device_id, device_seq, client_issued_at, subtotal, tax_amount, total)
      VALUES (v_id, left(coalesce(p->>'order_number', 'APP-' || left(v_id::TEXT, 8)), 40), (p->>'branch_id')::UUID,
              coalesce(p->>'status', 'completed'), coalesce(p->>'order_type', 'takeaway'), p->>'payment_method', p->'items',
              coalesce((p->>'discount_amount')::NUMERIC, 0), p->>'discount_type',
              (p->>'customer_id')::UUID, left(p->>'customer_name', 120), left(p->>'customer_phone', 20), left(p->>'cashier_name', 80),
              left(p->>'notes', 500), left(p->>'table_number', 10), coalesce((p->>'is_b2b')::BOOLEAN, false), 'app',
              (p->>'amount_paid')::NUMERIC, (p->>'change_due')::NUMERIC,
              (p->>'device_id')::UUID, (p->>'device_seq')::BIGINT, (p->>'client_issued_at')::TIMESTAMPTZ, 0, 0, 0);
      v_new := true;
    EXCEPTION WHEN unique_violation THEN
      -- رفع متوازي لنفس البيع — نرجع المحفوظ
      NULL;
    END;
    SELECT * INTO o FROM public.orders WHERE id = v_id;
    IF o.id IS NULL THEN RAISE EXCEPTION 'تعذر حفظ البيع'; END IF;
  END IF;
  -- ختم الولاء مرة وحدة مع أول رفع
  IF v_new AND o.customer_id IS NOT NULL AND coalesce((p->>'loyalty_stamps')::INT, 0) > 0 AND NOT coalesce(o.is_b2b, false) THEN
    BEGIN
      v_stamp := public.add_loyalty_stamps(o.customer_id, least((p->>'loyalty_stamps')::INT, 5));
    EXCEPTION WHEN OTHERS THEN v_stamp := jsonb_build_object('error', SQLERRM);
    END;
  END IF;
  RETURN jsonb_build_object('created', v_new, 'loyalty', v_stamp, 'order', jsonb_build_object(
    'id', o.id, 'invoice_no', o.invoice_no, 'invoiced_at', o.invoiced_at, 'status', o.status, 'items', o.items,
    'lines_net', o.lines_net, 'discount_amount', o.discount_amount, 'discount_net', o.discount_net, 'subtotal', o.subtotal,
    'tax_amount', o.tax_amount, 'total', o.total, 'rounding_amount', o.rounding_amount, 'tax_breakdown', o.tax_breakdown,
    'is_b2b', o.is_b2b, 'buyer', o.buyer, 'zatca_status', o.zatca_status, 'zatca_qr', o.zatca_qr));
END $$;
REVOKE ALL ON FUNCTION public.app_submit_sale(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_submit_sale(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4) المخزون: ينقص مع البيع ويرجع مع المرتجع — مع سجل الحركة
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_stock_move(p_tenant UUID, p_branch UUID, p_product UUID, p_delta NUMERIC,
                                                   p_type TEXT, p_reason TEXT, p_ref UUID, p_cost NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr RECORD;
BEGIN
  SELECT id, name_ar, name, stock_quantity, track_inventory INTO pr FROM public.products
   WHERE id = p_product AND tenant_id = p_tenant FOR UPDATE;
  IF pr.id IS NULL OR NOT coalesce(pr.track_inventory, false) OR p_delta = 0 THEN RETURN; END IF;
  UPDATE public.products SET stock_quantity = coalesce(stock_quantity, 0) + p_delta WHERE id = pr.id;
  INSERT INTO public.inventory_logs (tenant_id, branch_id, product_id, product_name, type, quantity_change, previous_stock, new_stock, reason, reference_id, unit_cost)
  VALUES (p_tenant, p_branch, pr.id, coalesce(pr.name_ar, pr.name), p_type, p_delta, coalesce(pr.stock_quantity, 0),
          coalesce(pr.stock_quantity, 0) + p_delta, p_reason, p_ref, p_cost);
END $$;
REVOKE ALL ON FUNCTION public.felsy_stock_move(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- تعديل المخزون يدوياً (توريد، جرد، تالف) — ذري بدل اقرأ-عدّل-اكتب
CREATE OR REPLACE FUNCTION public.adjust_stock(p_product UUID, p_delta NUMERIC, p_reason TEXT, p_unit_cost NUMERIC DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID; v_new NUMERIC;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product AND tenant_id IN (SELECT public.current_paid_tenant_ids());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'المنتج غير موجود'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'الكمية مطلوبة'; END IF;
  UPDATE public.products SET track_inventory = true WHERE id = p_product AND NOT coalesce(track_inventory, false);
  PERFORM public.felsy_stock_move(v_tenant, NULL, p_product, p_delta, CASE WHEN p_delta > 0 THEN 'restock' ELSE 'adjustment' END,
                                  left(coalesce(nullif(trim(p_reason), ''), CASE WHEN p_delta > 0 THEN 'توريد' ELSE 'تعديل' END), 200), NULL, p_unit_cost);
  IF p_unit_cost IS NOT NULL AND p_unit_cost > 0 AND p_delta > 0 THEN
    UPDATE public.products SET cost_price = p_unit_cost WHERE id = p_product;
  END IF;
  SELECT stock_quantity INTO v_new FROM public.products WHERE id = p_product;
  RETURN jsonb_build_object('stock', v_new);
END $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 5) القيود المحاسبية التلقائية (قيد مزدوج — يتوازن دائماً)
--    المبيعات:  من ح/ الصندوق أو البنك  إلى ح/ المبيعات + ح/ الضريبة المحصلة
--    المرتجع:   العكس
--    المشتريات: من ح/ المخزون/التكلفة/المصروف + ح/ ضريبة المدخلات  إلى ح/ الموردين
--               والدفع: من ح/ الموردين إلى ح/ البنك
--    المصروفات: من ح/ المصروف  إلى ح/ الصندوق أو البنك
--    تكلفة المبيعات للأصناف المتتبعة: من ح/ التكلفة إلى ح/ المخزون (بسعر التكلفة)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.felsy_pay_account(p_method TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  -- القيم الإنجليزية (نقطة البيع والتطبيق) والعربية (صفحة المصروفات في الموقع)
  SELECT CASE
    WHEN lower(btrim(coalesce(p_method, 'cash'))) IN ('cash', 'نقدي', 'نقدا', 'نقداً', 'كاش') THEN '1110'
    WHEN lower(btrim(p_method)) IN ('credit', 'آجل', 'اجل') THEN '1200'
    ELSE '1120' END;   -- بطاقة، مدى، STC Pay، Apple Pay، تحويل، شيك، أونلاين
$$;

CREATE OR REPLACE FUNCTION public.felsy_post(p_tenant UUID, p_branch UUID, p_ref TEXT, p_at TIMESTAMPTZ, p_desc TEXT, p_lines JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l JSONB;
BEGIN
  DELETE FROM public.journal_entries WHERE tenant_id = p_tenant AND reference = p_ref AND entry_type = 'auto';
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines, '[]'::JSONB)) LOOP
    IF round(coalesce((l->>'amount')::NUMERIC, 0), 2) > 0 THEN
      INSERT INTO public.journal_entries (tenant_id, branch_id, entry_type, debit_account, credit_account, amount, description, reference, created_at)
      VALUES (p_tenant, p_branch, 'auto', l->>'dr', l->>'cr', round((l->>'amount')::NUMERIC, 2), left(coalesce(l->>'desc', p_desc), 300), p_ref, coalesce(p_at, now()));
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.felsy_post(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- تكلفة أصناف مستند (للأصناف المتتبعة بمخزون وفيها سعر تكلفة)
CREATE OR REPLACE FUNCTION public.felsy_items_cost(p_tenant UUID, p_items JSONB)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1) * pr.cost_price), 0)
    FROM jsonb_array_elements(coalesce(p_items, '[]'::JSONB)) e
    JOIN public.products pr ON pr.tenant_id = p_tenant
     AND (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND pr.id = (e->>'product_id')::UUID AND coalesce(pr.track_inventory, false) AND coalesce(pr.cost_price, 0) > 0;
$$;

-- البيع صدر ⇒ قيد + مخزون (مرة وحدة)
CREATE OR REPLACE FUNCTION public.orders_after_issue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay TEXT; e JSONB; v_cost NUMERIC;
BEGIN
  IF NEW.invoice_seq IS NULL OR (TG_OP = 'UPDATE' AND OLD.invoice_seq IS NOT NULL) THEN RETURN NULL; END IF;
  pay := public.felsy_pay_account(NEW.payment_method);
  v_cost := public.felsy_items_cost(NEW.tenant_id, NEW.items);
  PERFORM public.felsy_post(NEW.tenant_id, NEW.branch_id, 'order:' || NEW.id, NEW.invoiced_at, 'مبيعات ' || NEW.invoice_no, jsonb_build_array(
    jsonb_build_object('dr', pay, 'cr', '4100', 'amount', NEW.subtotal + coalesce(NEW.rounding_amount, 0), 'desc', 'مبيعات ' || NEW.invoice_no),
    jsonb_build_object('dr', pay, 'cr', '2200', 'amount', NEW.tax_amount, 'desc', 'ضريبة مخرجات ' || NEW.invoice_no),
    jsonb_build_object('dr', '5100', 'cr', '1300', 'amount', v_cost, 'desc', 'تكلفة مبيعات ' || NEW.invoice_no)));
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(NEW.items, '[]'::JSONB)) LOOP
    IF (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      PERFORM public.felsy_stock_move(NEW.tenant_id, NEW.branch_id, (e->>'product_id')::UUID,
        -coalesce((e->>'quantity')::NUMERIC, (e->>'qty')::NUMERIC, 1), 'sale', 'بيع ' || NEW.invoice_no, NEW.id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_orders_after_issue ON public.orders;
-- بدون "OF invoice_seq": الرقم يتعيّن من الحارس (BEFORE) وما يكون في جملة UPDATE
CREATE TRIGGER trg_orders_after_issue AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW WHEN (NEW.invoice_seq IS NOT NULL) EXECUTE FUNCTION public.orders_after_issue();

-- إشعار دائن ⇒ قيد عكسي + رجوع المخزون
CREATE OR REPLACE FUNCTION public.credit_note_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay TEXT; e JSONB; v_cost NUMERIC;
BEGIN
  IF NEW.invoice_type IS DISTINCT FROM 'credit_note' THEN RETURN NULL; END IF;
  SELECT public.felsy_pay_account(o.payment_method) INTO pay FROM public.orders o WHERE o.id = NEW.order_id;
  pay := coalesce(pay, '1110');
  v_cost := public.felsy_items_cost(NEW.tenant_id, NEW.items);
  PERFORM public.felsy_post(NEW.tenant_id, NEW.branch_id, 'cn:' || NEW.id, NEW.created_at, 'مرتجع ' || NEW.invoice_number, jsonb_build_array(
    jsonb_build_object('dr', '4100', 'cr', pay, 'amount', NEW.subtotal + coalesce(NEW.rounding_amount, 0), 'desc', 'مرتجع مبيعات ' || NEW.invoice_number),
    jsonb_build_object('dr', '2200', 'cr', pay, 'amount', NEW.vat_amount, 'desc', 'ضريبة مرتجع ' || NEW.invoice_number),
    jsonb_build_object('dr', '1300', 'cr', '5100', 'amount', v_cost, 'desc', 'إرجاع تكلفة ' || NEW.invoice_number)));
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(NEW.items, '[]'::JSONB)) LOOP
    IF (e->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      PERFORM public.felsy_stock_move(NEW.tenant_id, NEW.branch_id, (e->>'product_id')::UUID,
        coalesce((e->>'quantity')::NUMERIC, 1), 'return', 'مرتجع ' || NEW.invoice_number, NEW.id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_credit_note_after_insert ON public.invoices;
CREATE TRIGGER trg_credit_note_after_insert AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_after_insert();

-- فاتورة شراء ⇒ قيد (يتحدث مع التعديل ويتحذف مع الحذف)
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS expense_account TEXT NOT NULL DEFAULT '5100';
DO $$ BEGIN
  ALTER TABLE public.purchase_invoices ADD CONSTRAINT purchase_invoices_account_chk CHECK (expense_account IN ('1300','5100','5200','5210','5220'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.felsy_post_purchase(r public.purchase_invoices)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT := 'مشتريات ' || coalesce(r.supplier_name, '') || ' ' || coalesce(r.invoice_number, '');
BEGIN
  PERFORM public.felsy_post(r.tenant_id, r.branch_id, 'pi:' || r.id, r.invoice_date::TIMESTAMPTZ, v_desc, jsonb_build_array(
    jsonb_build_object('dr', r.expense_account, 'cr', '2100', 'amount', r.net_amount + CASE WHEN r.deductible THEN 0 ELSE r.vat_amount END),
    jsonb_build_object('dr', '1400', 'cr', '2100', 'amount', CASE WHEN r.deductible THEN r.vat_amount ELSE 0 END, 'desc', 'ضريبة مدخلات ' || coalesce(r.invoice_number, ''))));
  IF r.paid THEN
    PERFORM public.felsy_post(r.tenant_id, r.branch_id, 'pi-pay:' || r.id, coalesce(r.paid_at, r.invoice_date)::TIMESTAMPTZ, 'سداد ' || v_desc,
      jsonb_build_array(jsonb_build_object('dr', '2100', 'cr', '1120', 'amount', r.net_amount + r.vat_amount)));
  ELSE
    DELETE FROM public.journal_entries WHERE tenant_id = r.tenant_id AND entry_type = 'auto' AND reference = 'pi-pay:' || r.id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.felsy_post_purchase(public.purchase_invoices) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.felsy_post_expense(r public.expenses)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc TEXT := CASE WHEN r.category ~* '(راتب|رواتب|salary|salar)' THEN '5210'
                         WHEN r.category ~* '(إيجار|ايجار|rent)' THEN '5220' ELSE '5200' END;
BEGIN
  PERFORM public.felsy_post(r.tenant_id, r.branch_id, 'exp:' || r.id, r.created_at, 'مصروف: ' || coalesce(r.title, ''), jsonb_build_array(
    jsonb_build_object('dr', acc, 'cr', public.felsy_pay_account(r.payment_method), 'amount', r.amount)));
END $$;
REVOKE ALL ON FUNCTION public.felsy_post_expense(public.expenses) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_after_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.journal_entries WHERE tenant_id = OLD.tenant_id AND entry_type = 'auto' AND reference IN ('pi:' || OLD.id, 'pi-pay:' || OLD.id);
    RETURN NULL;
  END IF;
  PERFORM public.felsy_post_purchase(NEW);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_purchase_after_change ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_after_change AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_after_change();

-- مصروف ⇒ قيد
CREATE OR REPLACE FUNCTION public.expense_after_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.journal_entries WHERE tenant_id = OLD.tenant_id AND entry_type = 'auto' AND reference = 'exp:' || OLD.id;
    RETURN NULL;
  END IF;
  PERFORM public.felsy_post_expense(NEW);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_expense_after_change ON public.expenses;
CREATE TRIGGER trg_expense_after_change AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_after_change();

-- القيود التلقائية للقراءة فقط من المتصفح والتطبيق (التصحيح بسند يدوي)
CREATE OR REPLACE FUNCTION public.journal_auto_readonly()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF public.felsy_is_server() OR current_user NOT IN ('authenticated', 'anon') THEN RETURN coalesce(NEW, OLD); END IF;
  IF (TG_OP <> 'INSERT' AND OLD.entry_type = 'auto') OR (TG_OP <> 'DELETE' AND NEW.entry_type = 'auto') THEN
    RAISE EXCEPTION 'القيود التلقائية تتحدث من مستنداتها — للتصحيح أضف سند قيد';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_journal_auto_readonly ON public.journal_entries;
CREATE TRIGGER trg_journal_auto_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_auto_readonly();

-- ترحيل المستندات السابقة (مرة وحدة — ما يكرر)
DO $$
DECLARE o RECORD; i RECORD; pr public.purchase_invoices; ex public.expenses;
BEGIN
  FOR o IN SELECT * FROM public.orders WHERE invoice_seq IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference = 'order:' || orders.id AND j.entry_type = 'auto') LOOP
    PERFORM public.felsy_post(o.tenant_id, o.branch_id, 'order:' || o.id, o.invoiced_at, 'مبيعات ' || o.invoice_no, jsonb_build_array(
      jsonb_build_object('dr', public.felsy_pay_account(o.payment_method), 'cr', '4100', 'amount', o.subtotal + coalesce(o.rounding_amount, 0)),
      jsonb_build_object('dr', public.felsy_pay_account(o.payment_method), 'cr', '2200', 'amount', o.tax_amount)));
  END LOOP;
  FOR i IN SELECT inv.*, ord.payment_method pm FROM public.invoices inv LEFT JOIN public.orders ord ON ord.id = inv.order_id
            WHERE inv.invoice_type = 'credit_note'
              AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference = 'cn:' || inv.id AND j.entry_type = 'auto') LOOP
    PERFORM public.felsy_post(i.tenant_id, i.branch_id, 'cn:' || i.id, i.created_at, 'مرتجع ' || i.invoice_number, jsonb_build_array(
      jsonb_build_object('dr', '4100', 'cr', public.felsy_pay_account(i.pm), 'amount', i.subtotal + coalesce(i.rounding_amount, 0)),
      jsonb_build_object('dr', '2200', 'cr', public.felsy_pay_account(i.pm), 'amount', i.vat_amount)));
  END LOOP;
  FOR pr IN SELECT * FROM public.purchase_invoices
             WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference = 'pi:' || purchase_invoices.id) LOOP
    PERFORM public.felsy_post_purchase(pr);
  END LOOP;
  FOR ex IN SELECT * FROM public.expenses
             WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.reference = 'exp:' || expenses.id) LOOP
    PERFORM public.felsy_post_expense(ex);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) تقارير محاسبية من السيرفر (أخف على الجوال من سحب كل القيود)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trial_balance(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH j AS (
    SELECT debit_account acc, amount d, 0::NUMERIC c FROM public.journal_entries
     WHERE tenant_id = public.my_tenant_id() AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at < p_to + 1)
    UNION ALL
    SELECT credit_account, 0, amount FROM public.journal_entries
     WHERE tenant_id = public.my_tenant_id() AND (p_from IS NULL OR created_at >= p_from) AND (p_to IS NULL OR created_at < p_to + 1)),
  a AS (SELECT acc, sum(d) d, sum(c) c FROM j GROUP BY acc)
  SELECT jsonb_build_object(
    'accounts', coalesce(jsonb_agg(jsonb_build_object('code', a.acc, 'name', coalesce(ca.name, a.acc), 'type', ca.type,
                                   'debit', a.d, 'credit', a.c, 'balance', a.d - a.c) ORDER BY a.acc), '[]'::JSONB),
    'total_debit', coalesce(sum(a.d), 0), 'total_credit', coalesce(sum(a.c), 0))
  FROM a LEFT JOIN public.chart_of_accounts ca ON ca.code = a.acc AND ca.tenant_id = public.my_tenant_id();
$$;
GRANT EXECUTE ON FUNCTION public.trial_balance(DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.income_statement(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH tb AS (SELECT x FROM jsonb_array_elements(public.trial_balance(p_from, p_to)->'accounts') x),
  v AS (
    SELECT coalesce(sum((x->>'credit')::NUMERIC - (x->>'debit')::NUMERIC) FILTER (WHERE x->>'type' = 'revenue'), 0) revenue,
           coalesce(sum((x->>'debit')::NUMERIC - (x->>'credit')::NUMERIC) FILTER (WHERE x->>'code' LIKE '51%'), 0) cogs,
           coalesce(sum((x->>'debit')::NUMERIC - (x->>'credit')::NUMERIC) FILTER (WHERE x->>'type' = 'expense' AND x->>'code' NOT LIKE '51%'), 0) expenses
      FROM tb)
  SELECT jsonb_build_object('revenue', revenue, 'cogs', cogs, 'gross_profit', revenue - cogs, 'expenses', expenses,
                            'net_profit', revenue - cogs - expenses) FROM v;
$$;
GRANT EXECUTE ON FUNCTION public.income_statement(DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 7) مزامنة التطبيق: المتغير فقط منذ آخر مزامنة (خفيف على الباقة)
-- ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_updated ON public.customers;
CREATE TRIGGER trg_touch_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_updated ON public.categories;
CREATE TRIGGER trg_touch_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS products_tenant_updated_idx ON public.products(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS customers_tenant_updated_idx ON public.customers(tenant_id, updated_at);

CREATE OR REPLACE FUNCTION public.app_sync(p_since TIMESTAMPTZ DEFAULT NULL, p_branch UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_tenant UUID := public.my_tenant_id(); v_since TIMESTAMPTZ := coalesce(p_since, '-infinity'::TIMESTAMPTZ) - interval '2 minutes';
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN jsonb_build_object(
    'server_time', now(), 'full', p_since IS NULL,
    'products', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'name_ar', name_ar, 'base_price', base_price, 'tax_inclusive', tax_inclusive, 'tax_rate', tax_rate,
        'vat_category', vat_category, 'vat_exemption_code', vat_exemption_code, 'image_url', image_url, 'category_id', category_id,
        'barcode', barcode, 'sku', sku, 'is_active', is_active, 'track_inventory', track_inventory, 'stock_quantity', stock_quantity,
        'min_stock_alert', min_stock_alert, 'cost_price', cost_price, 'unit_type', unit_type, 'sort_order', sort_order,
        'expiry_date', expiry_date, 'updated_at', updated_at))
        FROM public.products WHERE tenant_id = v_tenant AND (p_since IS NULL OR updated_at > v_since)), '[]'::JSONB),
    'product_ids', CASE WHEN p_since IS NULL THEN NULL ELSE
        coalesce((SELECT jsonb_agg(id) FROM public.products WHERE tenant_id = v_tenant), '[]'::JSONB) END,
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'name_ar', name_ar, 'sort_order', sort_order,
        'color', color, 'icon', icon, 'is_active', is_active) ORDER BY sort_order NULLS LAST, name)
        FROM public.categories WHERE tenant_id = v_tenant), '[]'::JSONB),
    'customers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'legal_name', legal_name, 'phone', phone,
        'customer_type', customer_type, 'vat_number', vat_number, 'cr_number', cr_number, 'addr_street', addr_street,
        'addr_building', addr_building, 'addr_district', addr_district, 'addr_city', addr_city, 'addr_postal', addr_postal,
        'addr_additional', addr_additional, 'stamps', stamps, 'loyalty_points', loyalty_points, 'updated_at', updated_at))
        FROM (SELECT * FROM public.customers WHERE tenant_id = v_tenant AND (p_since IS NULL OR coalesce(updated_at, created_at) > v_since)
              ORDER BY coalesce(updated_at, created_at) DESC LIMIT 5000) c), '[]'::JSONB),
    'seller', (SELECT jsonb_build_object(
        'name', coalesce(z.business_name, s.business_name), 'vat_number', coalesce(z.vat_number, s.vat_number),
        'cr_number', coalesce(z.cr_number, s.cr_number), 'address', coalesce(nullif(concat_ws('، ', z.address_building, z.address_street, z.address_district, z.address_city), ''), s.address),
        'phone', s.phone, 'logo_url', s.logo_url)
        FROM (SELECT 1) one
        LEFT JOIN public.app_settings s ON s.tenant_id = v_tenant
        LEFT JOIN public.zatca_config z ON z.branch_id = p_branch AND z.tenant_id = v_tenant LIMIT 1),
    'zatca', CASE WHEN p_branch IS NULL THEN NULL ELSE public.zatca_branch_status(p_branch) END,
    'branches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(name_ar, name)) ORDER BY created_at)
        FROM public.branches WHERE tenant_id = v_tenant AND coalesce(is_active, true)), '[]'::JSONB),
    'loyalty_required', coalesce((SELECT stamps_required FROM public.loyalty_card_designs WHERE tenant_id = v_tenant AND is_active AND branch_id IS NULL LIMIT 1),
                                 (SELECT stamps_threshold FROM public.loyalty_settings WHERE tenant_id = v_tenant LIMIT 1), 10));
END $$;
REVOKE ALL ON FUNCTION public.app_sync(TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sync(TIMESTAMPTZ, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 8) لوحة التطبيق المختصرة
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_dashboard(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_branch UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH o AS (
    SELECT * FROM public.orders
     WHERE tenant_id = public.my_tenant_id() AND invoice_seq IS NOT NULL
       AND invoiced_at >= p_from AND invoiced_at < p_to AND (p_branch IS NULL OR branch_id = p_branch)),
  r AS (
    SELECT coalesce(sum(total), 0) total, count(*) n FROM public.invoices
     WHERE tenant_id = public.my_tenant_id() AND invoice_type = 'credit_note' AND created_at >= p_from AND created_at < p_to
       AND (p_branch IS NULL OR branch_id = p_branch)),
  items AS (
    SELECT coalesce(e->>'name', 'صنف') nm, sum(coalesce((e->>'quantity')::NUMERIC, 1)) q, sum(coalesce((e->>'total')::NUMERIC, 0)) t
      FROM o, jsonb_array_elements(coalesce(o.items, '[]'::JSONB)) e GROUP BY 1 ORDER BY 3 DESC LIMIT 5)
  SELECT jsonb_build_object(
    'sales', coalesce((SELECT sum(total) FROM o), 0), 'net', coalesce((SELECT sum(subtotal) FROM o), 0),
    'vat', coalesce((SELECT sum(tax_amount) FROM o), 0), 'count', (SELECT count(*) FROM o),
    'discounts', coalesce((SELECT sum(discount_amount) FROM o), 0),
    'returns', (SELECT total FROM r), 'returns_count', (SELECT n FROM r),
    'by_payment', coalesce((SELECT jsonb_agg(jsonb_build_object('method', m, 'total', t, 'count', n) ORDER BY t DESC)
                             FROM (SELECT coalesce(payment_method, 'cash') m, sum(total) t, count(*) n FROM o GROUP BY 1) x), '[]'::JSONB),
    'by_hour', coalesce((SELECT jsonb_agg(jsonb_build_object('h', h, 'total', t) ORDER BY h)
                          FROM (SELECT extract(hour FROM invoiced_at AT TIME ZONE 'Asia/Riyadh')::INT h, sum(total) t FROM o GROUP BY 1) x), '[]'::JSONB),
    'top', coalesce((SELECT jsonb_agg(jsonb_build_object('name', nm, 'qty', q, 'total', t)) FROM items), '[]'::JSONB),
    'pending_zatca', (SELECT count(*) FROM o WHERE zatca_status IN ('pending', 'signed', 'error')),
    'low_stock', (SELECT count(*) FROM public.products WHERE tenant_id = public.my_tenant_id() AND coalesce(track_inventory, false)
                    AND coalesce(is_active, true) AND coalesce(stock_quantity, 0) <= coalesce(min_stock_alert, 5)));
$$;
GRANT EXECUTE ON FUNCTION public.app_dashboard(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 9) التنبيهات الذكية — مفتاح كل تنبيه يتغير فقط إذا تغيّر محتواه
--    (التطبيق ينبّه مرة وحدة لكل مفتاح + حد أعلى يومي ⇒ بدون إزعاج)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_alerts(p_branch UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.my_tenant_id(); out JSONB := '[]'::JSONB;
  v_ids TEXT; v_n INT; v_names TEXT; z JSONB; v_end TIMESTAMPTZ; v_q_end DATE; v_due DATE; u JSONB;
BEGIN
  IF v_tenant IS NULL THEN RETURN out; END IF;

  -- نفاد/نقص المخزون
  SELECT string_agg(id::TEXT || ':' || floor(coalesce(stock_quantity, 0))::TEXT, ',' ORDER BY id), count(*),
         string_agg(coalesce(name_ar, name), '، ' ORDER BY coalesce(stock_quantity, 0)) FILTER (WHERE true)
    INTO v_ids, v_n, v_names
    FROM (SELECT * FROM public.products WHERE tenant_id = v_tenant AND coalesce(track_inventory, false) AND coalesce(is_active, true)
            AND coalesce(stock_quantity, 0) <= coalesce(min_stock_alert, 5) ORDER BY coalesce(stock_quantity, 0) LIMIT 50) p;
  IF v_n > 0 THEN
    out := out || jsonb_build_object('key', 'stock:' || md5(v_ids), 'type', 'low_stock', 'severity', 'warning', 'count', v_n,
      'title', CASE WHEN v_n = 1 THEN 'صنف قارب على النفاد' ELSE v_n || ' أصناف قاربت على النفاد' END,
      'body', left(v_names, 160), 'route', '/inventory');
  END IF;

  -- منتهية الصلاحية قريباً (7 أيام)
  SELECT string_agg(id::TEXT, ',' ORDER BY id), count(*), string_agg(coalesce(name_ar, name), '، ')
    INTO v_ids, v_n, v_names
    FROM public.products WHERE tenant_id = v_tenant AND coalesce(is_active, true) AND expiry_date IS NOT NULL
     AND expiry_date <= current_date + 7 AND coalesce(stock_quantity, 1) > 0;
  IF v_n > 0 THEN
    out := out || jsonb_build_object('key', 'expiry:' || md5(v_ids), 'type', 'expiry', 'severity', 'warning', 'count', v_n,
      'title', 'أصناف تنتهي صلاحيتها خلال أسبوع', 'body', left(v_names, 160), 'route', '/inventory');
  END IF;

  -- الفوترة الإلكترونية
  IF p_branch IS NOT NULL THEN
    z := public.zatca_branch_status(p_branch);
    IF coalesce((z->>'overdue')::INT, 0) > 0 THEN
      out := out || jsonb_build_object('key', 'zatca_overdue:' || current_date || ':' || (z->>'overdue'), 'type', 'zatca_overdue', 'severity', 'critical',
        'count', (z->>'overdue')::INT, 'title', 'فواتير ما وصلت للهيئة من +20 ساعة',
        'body', 'المهلة 24 ساعة — تأكد من الإنترنت وافتح مركز الفوترة', 'route', '/zatca');
    END IF;
    IF coalesce((z->>'rejected')::INT, 0) > 0 THEN
      out := out || jsonb_build_object('key', 'zatca_rejected:' || (z->>'rejected'), 'type', 'zatca_rejected', 'severity', 'critical',
        'count', (z->>'rejected')::INT, 'title', 'الهيئة رفضت ' || (z->>'rejected') || ' مستند',
        'body', 'صحّحها بمرتجع ثم فاتورة جديدة', 'route', '/zatca');
    END IF;
    IF (z->>'cert_expires_at') IS NOT NULL AND (z->>'cert_expires_at')::TIMESTAMPTZ < now() + interval '30 days' THEN
      out := out || jsonb_build_object('key', 'cert:' || (z->>'cert_expires_at')::DATE, 'type', 'cert_expiry', 'severity', 'critical',
        'title', 'شهادة الهيئة تنتهي قريباً', 'body', 'جدّد الربط برمز OTP جديد قبل ' || (z->>'cert_expires_at')::DATE, 'route', '/zatca');
    END IF;
  END IF;

  -- ضريبة مدخلات غير مدفوعة تقترب من 12 شهر
  u := public.unpaid_input_vat_alerts();
  IF jsonb_array_length(u) > 0 THEN
    out := out || jsonb_build_object('key', 'unpaid_vat:' || md5(u::TEXT), 'type', 'unpaid_input_vat', 'severity', 'warning',
      'count', jsonb_array_length(u), 'title', 'فواتير مشتريات غير مدفوعة تقترب من 12 شهر',
      'body', 'إذا ما انسددت قبل ' || (u->0->>'deadline') || ' تنعكس ضريبتها في الإقرار', 'route', '/purchases');
  END IF;

  -- موعد الإقرار الضريبي (ربع سنوي): آخر يوم من الشهر التالي لنهاية الربع
  v_q_end := (date_trunc('quarter', current_date) - interval '1 day')::DATE;
  v_due := (date_trunc('month', v_q_end + interval '1 month') + interval '1 month - 1 day')::DATE;
  IF current_date BETWEEN v_due - 10 AND v_due THEN
    out := out || jsonb_build_object('key', 'vat_due:' || v_due, 'type', 'vat_due', 'severity', 'info',
      'title', 'موعد الإقرار الضريبي ' || v_due, 'body', 'أرقام الإقرار جاهزة في المحاسبة ← الإقرار الضريبي', 'route', '/vat');
  END IF;

  -- الاشتراك
  SELECT current_period_end INTO v_end FROM public.tenant_subscriptions WHERE tenant_id = v_tenant ORDER BY current_period_end DESC LIMIT 1;
  IF v_end IS NOT NULL AND v_end < now() + interval '7 days' THEN
    out := out || jsonb_build_object('key', 'sub:' || v_end::DATE, 'type', 'subscription', 'severity', 'warning',
      'title', 'اشتراكك ينتهي ' || to_char(v_end AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD'), 'body', 'تابع حالة الاشتراك مع مالك الحساب حتى ما يتوقف البيع', 'route', '/settings');
  END IF;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.app_alerts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_alerts(UUID) TO authenticated;

INSERT INTO public.migration_status (migration, note) VALUES (
  '028_app_devices_sync_ledger',
  'تطبيق فلسي: أجهزة وسلسلة فواتير لكل جهاز (أوفلاين)، رفع آمن للتكرار، مزامنة، تنبيهات، لوحة، مخزون تلقائي، قيود محاسبية تلقائية.'
) ON CONFLICT (migration) DO NOTHING;
