-- 034: Enforce cashier payment approval and prevent cancellation after preparation.
CREATE OR REPLACE FUNCTION public.guard_order_workflow_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.source = 'online'
     AND OLD.status = 'awaiting_payment'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      NULL; -- Customer/cashier may cancel before preparation starts.
    ELSIF NEW.status <> 'pending'
       OR NULLIF(trim(coalesce(NEW.payment_method, '')), '') IS NULL
       OR coalesce(NEW.amount_paid, 0) < coalesce(OLD.total, 0) THEN
      RAISE EXCEPTION 'الطلب الأونلاين غير معتمد: يجب على الكاشير تسجيل استلام كامل المبلغ قبل إرساله للمطبخ';
    END IF;
  END IF;

  IF NEW.status = 'cancelled'
     AND OLD.status IN ('preparing', 'ready', 'completed') THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الطلب بعد بدء التجهيز';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_workflow_transitions ON public.orders;
CREATE TRIGGER trg_guard_order_workflow_transitions
BEFORE UPDATE OF status, payment_method, amount_paid ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_workflow_transitions();

COMMENT ON FUNCTION public.guard_order_workflow_transitions()
IS 'Prevents unpaid online orders entering kitchen workflow and blocks cancellation after preparation starts.';
