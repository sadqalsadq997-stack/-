-- 047: Table QR public menu and waiter-approved order/change requests.
ALTER TABLE public.tables_map ADD COLUMN IF NOT EXISTS public_token TEXT;
UPDATE public.tables_map
SET public_token = replace(gen_random_uuid()::text, '-', '')
WHERE public_token IS NULL OR length(public_token) < 32;
CREATE UNIQUE INDEX IF NOT EXISTS tables_map_public_token_uidx ON public.tables_map(public_token);

CREATE OR REPLACE FUNCTION public.ensure_table_public_token()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.public_token IS NULL OR length(NEW.public_token) < 32 THEN
    NEW.public_token := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ensure_table_public_token ON public.tables_map;
CREATE TRIGGER trg_ensure_table_public_token
BEFORE INSERT OR UPDATE OF public_token ON public.tables_map
FOR EACH ROW EXECUTE FUNCTION public.ensure_table_public_token();

CREATE TABLE IF NOT EXISTS public.table_guest_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.tables_map(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  round_id UUID,
  round_number SMALLINT,
  request_type TEXT NOT NULL DEFAULT 'new_order' CHECK (request_type IN ('new_order','edit_round')),
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  customer_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','rejected','cancelled')),
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID
);
ALTER TABLE public.table_guest_requests ADD COLUMN IF NOT EXISTS round_number SMALLINT;
CREATE INDEX IF NOT EXISTS table_guest_requests_pending_idx
  ON public.table_guest_requests(tenant_id, branch_id, created_at DESC)
  WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS table_guest_requests_table_idx
  ON public.table_guest_requests(table_id, created_at DESC);

ALTER TABLE public.table_guest_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS table_guest_requests_tenant ON public.table_guest_requests;
CREATE POLICY table_guest_requests_tenant ON public.table_guest_requests
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.table_guest_requests;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.public_table_menu(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table public.tables_map%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_menu JSONB;
  v_theme JSONB;
  v_rounds JSONB := '[]'::JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 32 AND 64 THEN RETURN NULL; END IF;
  SELECT * INTO v_table FROM public.tables_map WHERE public_token = p_token LIMIT 1;
  IF v_table.id IS NULL OR v_table.branch_id IS NULL
     OR NOT public.tenant_is_paid(v_table.tenant_id) THEN RETURN NULL; END IF;

  v_menu := public.public_menu(v_table.branch_id, NULL);
  IF v_menu IS NULL THEN RETURN NULL; END IF;
  v_theme := public.public_menu_theme(v_table.branch_id);

  SELECT * INTO v_order FROM public.orders
  WHERE id = v_table.current_order_id
    AND status NOT IN ('completed','cancelled')
  LIMIT 1;

  IF v_order.id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'round_id', grouped.round_id,
      'round_number', grouped.round_number,
      'status', grouped.round_status,
      'items', grouped.items
    ) ORDER BY grouped.round_number), '[]'::JSONB)
    INTO v_rounds
    FROM (
      SELECT item->>'round_id' AS round_id,
             max(coalesce(nullif(item->>'round_number','')::INTEGER, 1)) AS round_number,
             max(coalesce(item->>'round_status','pending')) AS round_status,
             jsonb_agg(item) AS items
      FROM jsonb_array_elements(coalesce(v_order.items, '[]'::JSONB)) item
      GROUP BY item->>'round_id'
    ) grouped
    WHERE grouped.round_id IS NOT NULL;
  END IF;

  RETURN v_menu || coalesce(v_theme, '{}'::JSONB) || jsonb_build_object(
    'table', jsonb_build_object('table_number', v_table.table_number, 'public_token', v_table.public_token),
    'open_rounds', v_rounds
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.public_request_table_order(
  p_token TEXT,
  p_items JSONB,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_request_type TEXT DEFAULT 'new_order',
  p_round_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table public.tables_map%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_product RECORD;
  v_qty INTEGER;
  v_round_number INTEGER;
  v_snapshot JSONB := '[]'::JSONB;
  v_total NUMERIC := 0;
  v_request UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 32 AND 64 THEN RAISE EXCEPTION 'رابط الطاولة غير صالح'; END IF;
  IF p_request_type NOT IN ('new_order','edit_round') THEN RAISE EXCEPTION 'نوع الطلب غير صالح'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 80 THEN
    RAISE EXCEPTION 'قائمة المنتجات غير صالحة';
  END IF;

  SELECT * INTO v_table FROM public.tables_map WHERE public_token = p_token LIMIT 1;
  IF v_table.id IS NULL OR v_table.branch_id IS NULL OR NOT public.tenant_is_paid(v_table.tenant_id) THEN
    RAISE EXCEPTION 'الطاولة غير متاحة حالياً';
  END IF;

  IF p_request_type = 'edit_round' THEN
    IF p_round_id IS NULL THEN RAISE EXCEPTION 'اختر الجولة المراد تعديلها'; END IF;
    SELECT * INTO v_order FROM public.orders
    WHERE id = v_table.current_order_id AND status NOT IN ('completed','cancelled')
    FOR UPDATE;
    IF v_order.id IS NULL OR v_order.invoice_no IS NOT NULL THEN RAISE EXCEPTION 'الفاتورة مغلقة ولا يمكن تعديلها'; END IF;
    SELECT max(nullif(item->>'round_number','')::INTEGER) INTO v_round_number
    FROM jsonb_array_elements(coalesce(v_order.items,'[]'::JSONB)) item
    WHERE item->>'round_id' = p_round_id::TEXT
      AND coalesce(item->>'round_status','pending') = 'pending';
    IF v_round_number IS NULL THEN RAISE EXCEPTION 'بدأ تجهيز هذه الجولة؛ لا يمكن تعديلها الآن'; END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := greatest(0, least(99, coalesce((v_item->>'qty')::INTEGER, 0)));
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT p.id, coalesce(p.name_ar,p.name) AS product_name, pp.gross
    INTO v_product
    FROM public.products p
    CROSS JOIN LATERAL public.product_price_parts(p.base_price,p.tax_inclusive,p.tax_rate) pp
    WHERE p.id = (v_item->>'id')::UUID
      AND p.tenant_id = v_table.tenant_id
      AND coalesce(p.is_active,true) AND coalesce(p.show_in_menu,true);
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'يوجد صنف غير متاح في المنيو'; END IF;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'name',v_product.product_name,
      'price',v_product.gross,'qty',v_qty,'quantity',v_qty,
      'total',round(v_product.gross*v_qty,2)
    ));
    v_total := v_total + v_product.gross*v_qty;
  END LOOP;

  IF jsonb_array_length(v_snapshot) = 0 THEN RAISE EXCEPTION 'أضف صنفاً واحداً على الأقل'; END IF;

  INSERT INTO public.table_guest_requests(
    tenant_id,branch_id,table_id,table_number,order_id,round_id,round_number,request_type,
    items,customer_phone,notes
  ) VALUES (
    v_table.tenant_id,v_table.branch_id,v_table.id,v_table.table_number,
    CASE WHEN p_request_type='edit_round' THEN v_order.id ELSE v_table.current_order_id END,
    p_round_id,v_round_number,p_request_type,v_snapshot,left(nullif(trim(p_phone),''),24),
    left(nullif(trim(p_notes),''),1000)
  ) RETURNING id INTO v_request;

  RETURN jsonb_build_object('request_id',v_request,'status','pending_approval',
                            'table_number',v_table.table_number,'estimated_total',round(v_total,2));
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_table_guest_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.table_guest_requests%ROWTYPE;
  v_items JSONB;
  v_result JSONB;
  v_order_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO v_req FROM public.table_guest_requests
  WHERE id=p_request_id AND tenant_id IN (SELECT public.current_paid_tenant_ids())
  FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'pending_approval' THEN RAISE EXCEPTION 'الطلب لم يعد بانتظار الموافقة'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id',item->>'product_id','qty',(item->>'qty')::INTEGER))
  INTO v_items FROM jsonb_array_elements(v_req.items) item;

  IF v_req.request_type='edit_round' THEN
    v_result := public.replace_table_order_round(v_req.order_id,v_req.round_id,v_items,v_req.notes);
  ELSE
    v_result := public.add_table_order_round(v_req.table_id,v_items,v_req.notes,NULL);
  END IF;
  v_order_id := nullif(v_result->'order'->>'id','')::UUID;

  UPDATE public.table_guest_requests
  SET status='approved',order_id=v_order_id,processed_at=now(),processed_by=auth.uid()
  WHERE id=v_req.id;
  IF v_req.request_type='edit_round' THEN
    UPDATE public.table_guest_requests
    SET status='cancelled',reject_reason='تم اعتماد تعديل آخر لهذه الجولة',processed_at=now(),processed_by=auth.uid()
    WHERE id<>v_req.id AND order_id=v_req.order_id AND round_id=v_req.round_id
      AND request_type='edit_round' AND status='pending_approval';
  END IF;
  RETURN jsonb_build_object('request_id',v_req.id,'order_id',v_order_id,'status','approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_table_guest_request(p_request_id UUID,p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  UPDATE public.table_guest_requests
  SET status='rejected',reject_reason=left(nullif(trim(p_reason),''),300),
      processed_at=now(),processed_by=auth.uid()
  WHERE id=p_request_id
    AND tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND status='pending_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب لم يعد بانتظار الموافقة'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.public_table_menu(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_request_table_order(TEXT,JSONB,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_table_guest_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_table_guest_request(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_table_menu(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_request_table_order(TEXT,JSONB,TEXT,TEXT,TEXT,UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_table_guest_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_table_guest_request(UUID,TEXT) TO authenticated;

INSERT INTO public.migration_status (migration, note)
VALUES ('047_table_qr_waiter_approval', 'Adds per-table public QR menu, pending waiter requests, and approval/rejection workflows for new orders and edits.')
ON CONFLICT (migration) DO NOTHING;