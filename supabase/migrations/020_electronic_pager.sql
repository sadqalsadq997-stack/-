-- ══════════════════════════════════════════════════════════════════
-- فلسي v20 — البيجر الإلكتروني (QR) بدون أجهزة
-- ══════════════════════════════════════════════════════════════════
-- العميل يمسح الباركود من الإيصال/التذكرة → تفتح صفحة على جواله
-- (felsy.org/p/<token>) تعرض رقم طلبه، وترنّ وتهتز وتظهر إشعاراً
-- لحظة ما يضغط الموظف "جاهز" (أو لما المطبخ يعلّم الطلب جاهز).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.order_pagers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id        UUID,
  order_id         UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  token            TEXT NOT NULL UNIQUE,                  -- 128-bit عشوائي، هو الرابط السري للعميل
  display_number   INTEGER NOT NULL,                       -- الرقم الظاهر للعميل (يبدأ من 1 كل يوم)
  label            TEXT,                                   -- اسم العميل / ملاحظة اختيارية
  status           TEXT NOT NULL DEFAULT 'waiting',        -- waiting | preparing | ready | collected | cancelled
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at         TIMESTAMPTZ,
  acknowledged_at  TIMESTAMPTZ,                            -- العميل ضغط "استلمت التنبيه"
  collected_at     TIMESTAMPTZ,
  CONSTRAINT order_pagers_status_chk CHECK (status IN ('waiting','preparing','ready','collected','cancelled'))
);
CREATE INDEX IF NOT EXISTS order_pagers_tenant_idx ON public.order_pagers(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_pagers_order_idx  ON public.order_pagers(order_id);

ALTER TABLE public.order_pagers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_pagers_tenant ON public.order_pagers;
CREATE POLICY order_pagers_tenant ON public.order_pagers
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_tenant_ids()));

-- لا وصول لـ anon إطلاقاً — العميل يقرأ فقط عبر pager_public(token)

-- تحديثات لحظية لشاشة الموظف
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_pagers;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ── إنشاء بيجر جديد (للموظف) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_pager(p_order_id UUID DEFAULT NULL, p_branch_id UUID DEFAULT NULL, p_label TEXT DEFAULT NULL)
RETURNS public.order_pagers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_num    INT;
  v_row    public.order_pagers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_users WHERE auth_id = auth.uid() AND is_active LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'غير مرتبط بمنشأة'; END IF;
  IF NOT public.tenant_is_paid(v_tenant) THEN RAISE EXCEPTION 'يتطلب اشتراكاً فعّالاً'; END IF;

  IF p_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  -- قفل بسيط لمنع تكرار الرقم عند الضغط المتزامن
  PERFORM pg_advisory_xact_lock(hashtext('pager:' || v_tenant::text));
  SELECT COALESCE(MAX(display_number), 0) + 1 INTO v_num
  FROM public.order_pagers
  WHERE tenant_id = v_tenant
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh';

  INSERT INTO public.order_pagers (tenant_id, branch_id, order_id, token, display_number, label, created_by)
  VALUES (v_tenant, p_branch_id, p_order_id,
          replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
          v_num, NULLIF(left(trim(p_label), 40), ''), auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- ── قراءة حالة البيجر (للعميل بدون تسجيل) ─────────────────────────
CREATE OR REPLACE FUNCTION public.pager_public(p_token TEXT)
RETURNS TABLE (business_name TEXT, display_number INT, label TEXT, status TEXT,
               created_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, acknowledged_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, p.display_number, p.label, p.status, p.created_at, p.ready_at, p.acknowledged_at
  FROM public.order_pagers p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.token = p_token
    AND length(p_token) BETWEEN 32 AND 64
    AND p.created_at > now() - interval '24 hours';
$$;

-- العميل يؤكد أنه شاف التنبيه (يوقف الرنين ويظهر للموظف)
CREATE OR REPLACE FUNCTION public.pager_ack(p_token TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.order_pagers SET acknowledged_at = now()
  WHERE token = p_token AND status = 'ready' AND acknowledged_at IS NULL
    AND created_at > now() - interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.create_pager(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pager(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pager_public(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pager_ack(TEXT)    TO anon, authenticated;

-- ── توقيت الحالات تلقائياً ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_pagers_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    NEW.ready_at := now(); NEW.acknowledged_at := NULL;
  END IF;
  IF NEW.status = 'collected' AND OLD.status IS DISTINCT FROM 'collected' THEN NEW.collected_at := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_pagers_touch ON public.order_pagers;
CREATE TRIGGER trg_order_pagers_touch BEFORE UPDATE ON public.order_pagers
  FOR EACH ROW EXECUTE FUNCTION public.order_pagers_touch();

-- ── ربط مع شاشة المطبخ / الطلبات: الطلب "جاهز" ⇒ البيجر يرن ───────
CREATE OR REPLACE FUNCTION public.sync_pager_from_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('preparing', 'ready', 'cancelled') THEN
    UPDATE public.order_pagers SET status = NEW.status
    WHERE order_id = NEW.id AND status NOT IN ('collected', 'cancelled');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_pager_from_order ON public.orders;
CREATE TRIGGER trg_sync_pager_from_order AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_pager_from_order();

-- قفل الاشتراك (نفس 018) على هذا الجدول أيضاً
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_paid_tenant_ids') THEN
    EXECUTE 'DROP POLICY IF EXISTS paid_tenant_guard ON public.order_pagers';
    EXECUTE 'CREATE POLICY paid_tenant_guard ON public.order_pagers AS RESTRICTIVE FOR ALL TO authenticated
             USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
             WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()))';
  END IF;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '020_electronic_pager', 'البيجر الإلكتروني عبر QR: order_pagers + create_pager / pager_public / pager_ack + ربط مع حالة الطلب'
) ON CONFLICT (migration) DO NOTHING;
