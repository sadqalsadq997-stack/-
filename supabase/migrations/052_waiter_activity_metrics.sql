-- 052: Attribute waiter approvals to the employee who approved the QR request.
ALTER TABLE public.table_guest_requests
  ADD COLUMN IF NOT EXISTS processed_employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.approve_table_guest_request(UUID);
CREATE OR REPLACE FUNCTION public.approve_table_guest_request(
  p_request_id UUID,
  p_employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.table_guest_requests%ROWTYPE;
  v_employee public.employee_profiles%ROWTYPE;
  v_items JSONB;
  v_result JSONB;
  v_order_id UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO v_req FROM public.table_guest_requests
  WHERE id=p_request_id AND tenant_id IN (SELECT public.current_paid_tenant_ids())
  FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'pending_approval' THEN RAISE EXCEPTION 'الطلب لم يعد بانتظار الموافقة'; END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO v_employee FROM public.employee_profiles
    WHERE id=p_employee_id AND tenant_id=v_req.tenant_id AND is_active
      AND (branch_id IS NULL OR branch_id=v_req.branch_id);
    IF v_employee.id IS NULL OR v_employee.role NOT IN ('waiter','manager','branch_manager','admin','owner') THEN
      RAISE EXCEPTION 'الموظف غير مؤهل لاعتماد طلبات الطاولات';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id',item->>'product_id','qty',(item->>'qty')::INTEGER)),
         coalesce(sum((item->>'total')::NUMERIC),0)
  INTO v_items,v_amount
  FROM jsonb_array_elements(v_req.items) item;

  IF v_req.request_type='edit_round' THEN
    v_result := public.replace_table_order_round(v_req.order_id,v_req.round_id,v_items,v_req.notes);
  ELSE
    v_result := public.add_table_order_round(v_req.table_id,v_items,v_req.notes,NULL);
  END IF;
  v_order_id := nullif(v_result->'order'->>'id','')::UUID;

  UPDATE public.table_guest_requests
  SET status='approved',order_id=v_order_id,processed_at=now(),
      processed_by=auth.uid(),processed_employee_id=p_employee_id
  WHERE id=v_req.id;

  IF v_req.request_type='edit_round' THEN
    UPDATE public.table_guest_requests
    SET status='cancelled',reject_reason='تم اعتماد تعديل آخر لهذه الجولة',
        processed_at=now(),processed_by=auth.uid(),processed_employee_id=p_employee_id
    WHERE id<>v_req.id AND order_id=v_req.order_id AND round_id=v_req.round_id
      AND request_type='edit_round' AND status='pending_approval';
  END IF;

  IF p_employee_id IS NOT NULL THEN
    INSERT INTO public.employee_activity(tenant_id,branch_id,employee_id,action,order_id,amount,metadata)
    VALUES(v_req.tenant_id,v_req.branch_id,p_employee_id,'waiter_approved',v_order_id,v_amount,
      jsonb_build_object('request_id',v_req.id,'request_type',v_req.request_type,'table_number',v_req.table_number));
  END IF;

  RETURN jsonb_build_object('request_id',v_req.id,'order_id',v_order_id,'status','approved');
END;
$$;

DROP FUNCTION IF EXISTS public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID);
CREATE OR REPLACE FUNCTION public.employee_performance_summary(
  p_from TIMESTAMPTZ DEFAULT now()-interval '30 days',
  p_to TIMESTAMPTZ DEFAULT now(),
  p_branch UUID DEFAULT NULL
)
RETURNS TABLE(
  employee_id UUID, employee_name TEXT, role TEXT,
  sales_count BIGINT, sales_total NUMERIC,
  kitchen_tasks_completed BIGINT, waiter_approvals BIGINT,
  avg_kitchen_minutes NUMERIC, last_activity TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id,coalesce(e.full_name,e.name),coalesce(e.role,'employee'),
    count(a.id) FILTER(WHERE a.action='cashier_sale'),
    coalesce(sum(a.amount) FILTER(WHERE a.action='cashier_sale'),0),
    count(a.id) FILTER(WHERE a.action='kitchen_completed'),
    count(a.id) FILTER(WHERE a.action='waiter_approved'),
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
           count(a.id) FILTER(WHERE a.action='kitchen_completed') DESC,
           count(a.id) FILTER(WHERE a.action='waiter_approved') DESC;
$$;

REVOKE ALL ON FUNCTION public.approve_table_guest_request(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_table_guest_request(UUID,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) TO authenticated;

INSERT INTO public.migration_status(migration,note)
VALUES('052_waiter_activity_metrics','Tracks which waiter approves each table QR request and includes waiter approvals in employee performance summaries.')
ON CONFLICT(migration) DO NOTHING;