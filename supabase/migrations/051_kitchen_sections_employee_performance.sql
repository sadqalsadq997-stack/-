-- 051: Kitchen sections, employee assignment, task workflow and performance events.
CREATE TABLE IF NOT EXISTS public.kitchen_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  assigned_employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id,name)
);
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kitchen_section_id UUID REFERENCES public.kitchen_sections(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cashier_employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.kitchen_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  round_id UUID,
  round_number SMALLINT,
  section_id UUID NOT NULL REFERENCES public.kitchen_sections(id) ON DELETE RESTRICT,
  assigned_employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','cancelled')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_tasks_round_section_uidx
  ON public.kitchen_tasks(order_id, coalesce(round_id,'00000000-0000-0000-0000-000000000000'::UUID),section_id);
CREATE INDEX IF NOT EXISTS kitchen_tasks_queue_idx
  ON public.kitchen_tasks(tenant_id,branch_id,status,created_at);

CREATE TABLE IF NOT EXISTS public.employee_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.kitchen_tasks(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  duration_seconds NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_activity_summary_idx
  ON public.employee_activity(tenant_id,branch_id,employee_id,created_at DESC);

ALTER TABLE public.kitchen_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_sections_tenant ON public.kitchen_sections;
CREATE POLICY kitchen_sections_tenant ON public.kitchen_sections
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.current_paid_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.current_paid_tenant_ids()));

DROP POLICY IF EXISTS kitchen_tasks_tenant_select ON public.kitchen_tasks;
CREATE POLICY kitchen_tasks_tenant_select ON public.kitchen_tasks
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_paid_tenant_ids()));

DROP POLICY IF EXISTS employee_activity_tenant_select ON public.employee_activity;
CREATE POLICY employee_activity_tenant_select ON public.employee_activity
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_paid_tenant_ids()));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- Ensure each branch has a default station.
INSERT INTO public.kitchen_sections(tenant_id,branch_id,name,sort_order)
SELECT b.tenant_id,b.id,'عام',0
FROM public.branches b
WHERE b.tenant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.kitchen_sections s WHERE s.branch_id=b.id AND s.name='عام')
ON CONFLICT (branch_id,name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_default_kitchen_section()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.kitchen_sections(tenant_id,branch_id,name,sort_order)
    VALUES(NEW.tenant_id,NEW.id,'عام',0)
    ON CONFLICT(branch_id,name) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ensure_default_kitchen_section ON public.branches;
CREATE TRIGGER trg_ensure_default_kitchen_section
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_kitchen_section();

CREATE OR REPLACE FUNCTION public.sync_kitchen_tasks_from_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_default UUID;
  v_group RECORD;
  v_round_no SMALLINT;
  v_assignee UUID;
BEGIN
  IF NEW.status NOT IN ('pending','preparing') OR NEW.branch_id IS NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(coalesce(NEW.items,'[]'::JSONB)) <> 'array' OR jsonb_array_length(coalesce(NEW.items,'[]'::JSONB))=0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_default FROM public.kitchen_sections
  WHERE branch_id=NEW.branch_id AND tenant_id=NEW.tenant_id AND name='عام' AND is_active
  LIMIT 1;
  IF v_default IS NULL THEN
    INSERT INTO public.kitchen_sections(tenant_id,branch_id,name,sort_order)
    VALUES(NEW.tenant_id,NEW.branch_id,'عام',0)
    ON CONFLICT(branch_id,name) DO UPDATE SET is_active=true
    RETURNING id INTO v_default;
  END IF;

  FOR v_group IN
    SELECT coalesce(p.kitchen_section_id,v_default) AS section_id,
           nullif(item->>'round_id','')::UUID AS round_id,
           max(nullif(item->>'round_number','')::SMALLINT) AS round_number,
           jsonb_agg(item ORDER BY ord) AS task_items,
           max(coalesce(item->>'round_notes',NEW.notes)) AS task_notes
    FROM jsonb_array_elements(coalesce(NEW.items,'[]'::JSONB)) WITH ORDINALITY e(item,ord)
    LEFT JOIN public.products p
      ON p.id = CASE WHEN item->>'product_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN (item->>'product_id')::UUID ELSE NULL END
     AND p.tenant_id=NEW.tenant_id
    GROUP BY coalesce(p.kitchen_section_id,v_default), nullif(item->>'round_id','')::UUID
  LOOP
    SELECT assigned_employee_id INTO v_assignee
    FROM public.kitchen_sections WHERE id=v_group.section_id;
    INSERT INTO public.kitchen_tasks(
      tenant_id,branch_id,order_id,round_id,round_number,section_id,
      assigned_employee_id,items,notes,status
    ) VALUES (
      NEW.tenant_id,NEW.branch_id,NEW.id,v_group.round_id,v_group.round_number,
      v_group.section_id,v_assignee,v_group.task_items,v_group.task_notes,'pending'
    )
    ON CONFLICT (order_id,(coalesce(round_id,'00000000-0000-0000-0000-000000000000'::UUID)),section_id)
    DO UPDATE SET
      items=CASE WHEN kitchen_tasks.status='pending' THEN EXCLUDED.items ELSE kitchen_tasks.items END,
      notes=CASE WHEN kitchen_tasks.status='pending' THEN EXCLUDED.notes ELSE kitchen_tasks.notes END,
      assigned_employee_id=coalesce(kitchen_tasks.assigned_employee_id,EXCLUDED.assigned_employee_id),
      updated_at=now();
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_kitchen_tasks_from_order ON public.orders;
CREATE TRIGGER trg_sync_kitchen_tasks_from_order
AFTER INSERT OR UPDATE OF status,items ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_kitchen_tasks_from_order();

CREATE OR REPLACE FUNCTION public.set_kitchen_task_status(
  p_task_id UUID,
  p_status TEXT,
  p_employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_task public.kitchen_tasks%ROWTYPE;
  v_section public.kitchen_sections%ROWTYPE;
  v_employee public.employee_profiles%ROWTYPE;
  v_round_status TEXT;
  v_duration NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_status NOT IN ('preparing','ready') THEN RAISE EXCEPTION 'حالة المطبخ غير صالحة'; END IF;

  SELECT * INTO v_task FROM public.kitchen_tasks
  WHERE id=p_task_id AND tenant_id IN (SELECT public.current_paid_tenant_ids())
  FOR UPDATE;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'مهمة المطبخ غير موجودة'; END IF;

  SELECT * INTO v_section FROM public.kitchen_sections WHERE id=v_task.section_id;
  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO v_employee FROM public.employee_profiles
    WHERE id=p_employee_id AND tenant_id=v_task.tenant_id AND is_active;
    IF v_employee.id IS NULL THEN RAISE EXCEPTION 'الموظف غير نشط أو لا يتبع المنشأة'; END IF;
    IF v_employee.branch_id IS NOT NULL AND v_employee.branch_id<>v_task.branch_id THEN
      RAISE EXCEPTION 'الموظف لا يتبع هذا الفرع';
    END IF;
    IF v_section.assigned_employee_id IS NOT NULL
       AND v_section.assigned_employee_id<>p_employee_id
       AND v_employee.role NOT IN ('admin','branch_manager') THEN
      RAISE EXCEPTION 'هذه المهمة مسندة لموظف آخر';
    END IF;
  ELSIF v_section.assigned_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'هذه المهمة مسندة لموظف محدد؛ سجّل دخول الموظف أولاً';
  END IF;

  UPDATE public.kitchen_tasks
  SET status=p_status,
      assigned_employee_id=coalesce(assigned_employee_id,p_employee_id),
      accepted_at=CASE WHEN p_status='preparing' THEN coalesce(accepted_at,now()) ELSE accepted_at END,
      completed_at=CASE WHEN p_status='ready' THEN now() ELSE NULL END,
      completed_by=CASE WHEN p_status='ready' THEN p_employee_id ELSE completed_by END,
      updated_at=now()
  WHERE id=v_task.id;

  IF p_employee_id IS NOT NULL THEN
    v_duration := CASE WHEN p_status='ready' AND v_task.accepted_at IS NOT NULL
      THEN extract(epoch FROM (now()-v_task.accepted_at)) ELSE NULL END;
    INSERT INTO public.employee_activity(tenant_id,branch_id,employee_id,action,order_id,task_id,duration_seconds,metadata)
    VALUES(v_task.tenant_id,v_task.branch_id,p_employee_id,
      CASE WHEN p_status='preparing' THEN 'kitchen_started' ELSE 'kitchen_completed' END,
      v_task.order_id,v_task.id,v_duration,
      jsonb_build_object('section_id',v_task.section_id,'round_id',v_task.round_id));
  END IF;

  IF EXISTS (SELECT 1 FROM public.kitchen_tasks
             WHERE order_id=v_task.order_id
               AND round_id IS NOT DISTINCT FROM v_task.round_id
               AND status='preparing') THEN
    v_round_status := 'preparing';
  ELSIF NOT EXISTS (SELECT 1 FROM public.kitchen_tasks
                    WHERE order_id=v_task.order_id
                      AND round_id IS NOT DISTINCT FROM v_task.round_id
                      AND status NOT IN ('ready','cancelled')) THEN
    v_round_status := 'ready';
  ELSE
    v_round_status := 'pending';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=v_task.order_id;
  IF v_task.round_id IS NOT NULL THEN
    PERFORM public.set_table_order_round_status(v_task.order_id,v_task.round_id,v_round_status);
  ELSIF v_order.status NOT IN ('completed','cancelled') THEN
    UPDATE public.orders SET status=v_round_status WHERE id=v_task.order_id;
  END IF;

  RETURN jsonb_build_object('task_id',v_task.id,'status',p_status,'round_status',v_round_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_order_cashier_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.invoice_seq IS NOT NULL AND NEW.cashier_employee_id IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.invoice_seq IS NULL) THEN
    INSERT INTO public.employee_activity(tenant_id,branch_id,employee_id,action,order_id,amount,metadata)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.cashier_employee_id,'cashier_sale',NEW.id,NEW.total,
      jsonb_build_object('invoice_no',NEW.invoice_no,'payment_method',NEW.payment_method));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_order_cashier_sale ON public.orders;
CREATE TRIGGER trg_log_order_cashier_sale
AFTER INSERT OR UPDATE OF invoice_seq ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_cashier_sale();

CREATE OR REPLACE FUNCTION public.employee_performance_summary(
  p_from TIMESTAMPTZ DEFAULT now()-interval '30 days',
  p_to TIMESTAMPTZ DEFAULT now(),
  p_branch UUID DEFAULT NULL
)
RETURNS TABLE(
  employee_id UUID, employee_name TEXT, role TEXT,
  sales_count BIGINT, sales_total NUMERIC,
  kitchen_tasks_completed BIGINT, avg_kitchen_minutes NUMERIC,
  last_activity TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id,coalesce(e.full_name,e.name),coalesce(e.role,'employee'),
    count(a.id) FILTER(WHERE a.action='cashier_sale'),
    coalesce(sum(a.amount) FILTER(WHERE a.action='cashier_sale'),0),
    count(a.id) FILTER(WHERE a.action='kitchen_completed'),
    round(avg(a.duration_seconds/60.0) FILTER(WHERE a.action='kitchen_completed'),1),
    max(a.created_at)
  FROM public.employee_profiles e
  LEFT JOIN public.employee_activity a
    ON a.employee_id=e.id AND a.created_at>=p_from AND a.created_at<p_to
   AND (p_branch IS NULL OR a.branch_id=p_branch)
  WHERE e.tenant_id IN (SELECT public.current_paid_tenant_ids())
    AND (p_branch IS NULL OR e.branch_id IS NULL OR e.branch_id=p_branch)
  GROUP BY e.id,e.full_name,e.name,e.role
  ORDER BY count(a.id) FILTER(WHERE a.action='cashier_sale') DESC,
           count(a.id) FILTER(WHERE a.action='kitchen_completed') DESC;
$$;

REVOKE ALL ON FUNCTION public.set_kitchen_task_status(UUID,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_kitchen_task_status(UUID,TEXT,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) TO authenticated;

INSERT INTO public.migration_status (migration,note)
VALUES ('051_kitchen_sections_employee_performance','Adds kitchen stations and assigned employees, per-section order tasks, cashier/kitchen activity tracking and employee performance summaries.')
ON CONFLICT(migration) DO NOTHING;