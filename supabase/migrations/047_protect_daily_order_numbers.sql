-- 047: Prevent client-side edits to server-issued restaurant order tickets.
CREATE OR REPLACE FUNCTION public.protect_daily_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.daily_order_number IS DISTINCT FROM OLD.daily_order_number
      OR NEW.daily_order_date IS DISTINCT FROM OLD.daily_order_date)
     AND NOT public.felsy_is_server() THEN
    RAISE EXCEPTION 'رقم الطلب اليومي يصدره النظام ولا يمكن تعديله يدوياً';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_daily_order_number ON public.orders;
CREATE TRIGGER trg_protect_daily_order_number
BEFORE UPDATE OF daily_order_number, daily_order_date ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_daily_order_number();
