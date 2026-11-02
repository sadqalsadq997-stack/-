-- 035: Close the unpaid-online-order payment-field bypass.
-- Payment fields cannot be written while the order remains awaiting_payment.
-- The transition to pending must carry the payment details in the same atomic update.
CREATE OR REPLACE FUNCTION public.guard_order_workflow_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.source = 'online' AND OLD.status = 'awaiting_payment' THEN
    IF NEW.status = 'awaiting_payment'
       AND (
         NEW.payment_method IS DISTINCT FROM OLD.payment_method
         OR coalesce(NEW.amount_paid, 0) IS DISTINCT FROM coalesce(OLD.amount_paid, 0)
         OR coalesce(NEW.change_due, 0) IS DISTINCT FROM coalesce(OLD.change_due, 0)
       ) THEN
      RAISE EXCEPTION 'لا يمكن تسجيل الدفع دون اعتماد الطلب وإرساله للمطبخ في نفس العملية';
    ELSIF NEW.status = 'pending' THEN
      IF NULLIF(trim(coalesce(NEW.payment_method, '')), '') IS NULL
         OR coalesce(NEW.amount_paid, 0) < coalesce(OLD.total, 0) THEN
        RAISE EXCEPTION 'الطلب الأونلاين غير معتمد: يجب تسجيل استلام كامل المبلغ قبل إرساله للمطبخ';
      END IF;
    ELSIF NEW.status NOT IN ('awaiting_payment', 'cancelled') THEN
      RAISE EXCEPTION 'لا يمكن تغيير حالة الطلب الأونلاين قبل اعتماد الدفع';
    END IF;
  END IF;

  IF NEW.status = 'cancelled'
     AND OLD.status IN ('preparing', 'ready', 'completed') THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الطلب بعد بدء التجهيز';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_order_workflow_transitions()
IS 'Enforces atomic payment approval for online orders and blocks cancellation after preparation starts.';
