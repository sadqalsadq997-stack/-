-- 041: Keep round metadata synchronized with legacy clients that still update orders.status directly.
CREATE OR REPLACE FUNCTION public.sync_dine_in_round_status_from_legacy_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_type = 'dine_in'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.items IS NOT DISTINCT FROM OLD.items
     AND NEW.status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled') THEN
    SELECT coalesce(jsonb_agg(
      CASE WHEN item ? 'round_id'
        THEN item || jsonb_build_object('round_status', NEW.status)
        ELSE item || jsonb_build_object(
          'round_number', 1,
          'round_status', NEW.status,
          'round_added_at', coalesce(item->>'round_added_at', NEW.created_at::TEXT)
        )
      END
    ), '[]'::JSONB)
    INTO NEW.items
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::JSONB)) item;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dine_in_round_status_legacy ON public.orders;
CREATE TRIGGER trg_sync_dine_in_round_status_legacy
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_dine_in_round_status_from_legacy_update();

COMMENT ON FUNCTION public.sync_dine_in_round_status_from_legacy_update()
IS 'Keeps dine-in round status metadata in sync when older clients update only orders.status.';
