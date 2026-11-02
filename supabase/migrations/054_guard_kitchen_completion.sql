-- 054: Cancel pending kitchen station tasks with their order and block premature checkout.
CREATE OR REPLACE FUNCTION public.sync_kitchen_tasks_from_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_default UUID;
  v_group RECORD;
  v_round_no SMALLINT;
  v_assignee UUID;
BEGIN
  IF NEW.status = 'cancelled' THEN
    UPDATE public.kitchen_tasks SET status='cancelled',updated_at=now()
    WHERE order_id=NEW.id AND status IN ('pending','preparing');
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION public.guard_order_completion_until_kitchen_ready()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $function$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND EXISTS (
       SELECT 1 FROM public.kitchen_tasks kt
       WHERE kt.order_id=OLD.id AND kt.status NOT IN ('ready','cancelled')
     ) THEN
    RAISE EXCEPTION 'لا يمكن إغلاق الفاتورة قبل اكتمال جميع أقسام المطبخ';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_order_completion_until_kitchen_ready ON public.orders;
CREATE TRIGGER trg_guard_order_completion_until_kitchen_ready
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_completion_until_kitchen_ready();

INSERT INTO public.migration_status(migration,note)
VALUES('054_guard_kitchen_completion','Cancels pending kitchen tasks when an order is cancelled and prevents checkout before all station tasks are ready.')
ON CONFLICT(migration) DO NOTHING;