-- 055: Track kitchen task assignments as well as completions.
CREATE OR REPLACE FUNCTION public.log_kitchen_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NEW.assigned_employee_id IS NOT NULL AND NEW.status='pending'
     AND (TG_OP='INSERT' OR OLD.assigned_employee_id IS DISTINCT FROM NEW.assigned_employee_id) THEN
    INSERT INTO public.employee_activity(tenant_id,branch_id,employee_id,action,order_id,task_id,metadata)
    VALUES(NEW.tenant_id,NEW.branch_id,NEW.assigned_employee_id,'kitchen_assigned',NEW.order_id,NEW.id,
      jsonb_build_object('section_id',NEW.section_id,'round_id',NEW.round_id));
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_log_kitchen_task_assignment ON public.kitchen_tasks;
CREATE TRIGGER trg_log_kitchen_task_assignment
AFTER INSERT OR UPDATE OF assigned_employee_id ON public.kitchen_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_kitchen_task_assignment();

DROP FUNCTION IF EXISTS public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID);
CREATE OR REPLACE FUNCTION public.employee_performance_summary(
  p_from TIMESTAMPTZ DEFAULT now()-interval '30 days',
  p_to TIMESTAMPTZ DEFAULT now(),
  p_branch UUID DEFAULT NULL
)
RETURNS TABLE(
  employee_id UUID, employee_name TEXT, role TEXT,
  sales_count BIGINT, sales_total NUMERIC,
  kitchen_tasks_assigned BIGINT, kitchen_tasks_completed BIGINT,
  waiter_approvals BIGINT, avg_kitchen_minutes NUMERIC,
  last_activity TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT e.id,coalesce(e.full_name,e.name),coalesce(e.role,'employee'),
    count(a.id) FILTER(WHERE a.action='cashier_sale'),
    coalesce(sum(a.amount) FILTER(WHERE a.action='cashier_sale'),0),
    count(a.id) FILTER(WHERE a.action='kitchen_assigned'),
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
$function$;

REVOKE ALL ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_performance_summary(TIMESTAMPTZ,TIMESTAMPTZ,UUID) TO authenticated;

INSERT INTO public.migration_status(migration,note)
VALUES('055_kitchen_task_assignment_metrics','Logs when kitchen work is assigned to employees and reports assigned versus completed tasks.')
ON CONFLICT(migration) DO NOTHING;