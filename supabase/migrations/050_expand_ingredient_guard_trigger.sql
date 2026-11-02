-- 050: Ensure ingredient integrity checks also run for unit and active-state changes.
DROP TRIGGER IF EXISTS trg_enforce_ingredient_product_flags ON public.products;
CREATE TRIGGER trg_enforce_ingredient_product_flags
BEFORE INSERT OR UPDATE OF is_ingredient, track_inventory, show_in_menu, show_in_store, unit_type, is_active
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ingredient_product_flags();
