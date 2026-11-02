-- 053: Keep pending kitchen tasks synchronized with station assignments.
CREATE OR REPLACE FUNCTION public.sync_kitchen_section_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  UPDATE public.kitchen_tasks
  SET assigned_employee_id=NEW.assigned_employee_id,updated_at=now()
  WHERE section_id=NEW.id AND status='pending';
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_sync_kitchen_section_assignment ON public.kitchen_sections;
CREATE TRIGGER trg_sync_kitchen_section_assignment
AFTER UPDATE OF assigned_employee_id ON public.kitchen_sections
FOR EACH ROW
WHEN (OLD.assigned_employee_id IS DISTINCT FROM NEW.assigned_employee_id)
EXECUTE FUNCTION public.sync_kitchen_section_assignment();

CREATE OR REPLACE FUNCTION public.unassign_inactive_kitchen_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    UPDATE public.kitchen_sections SET assigned_employee_id=NULL,updated_at=now()
    WHERE assigned_employee_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_unassign_inactive_kitchen_employee ON public.employee_profiles;
CREATE TRIGGER trg_unassign_inactive_kitchen_employee
AFTER UPDATE OF is_active ON public.employee_profiles
FOR EACH ROW EXECUTE FUNCTION public.unassign_inactive_kitchen_employee();

INSERT INTO public.migration_status(migration,note)
VALUES('053_sync_kitchen_section_assignments','Keeps pending kitchen tasks assigned to the current section employee and releases tasks when an employee is deactivated.')
ON CONFLICT(migration) DO NOTHING;