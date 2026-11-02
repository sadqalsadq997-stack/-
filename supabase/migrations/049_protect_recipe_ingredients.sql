-- 049: Protect ingredient units and active status while recipes reference them.
CREATE OR REPLACE FUNCTION public.enforce_ingredient_product_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_used BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_ingredient THEN
    SELECT EXISTS (SELECT 1 FROM public.product_recipe_items WHERE ingredient_product_id = OLD.id)
    INTO v_used;
    IF v_used AND NOT NEW.is_ingredient THEN
      RAISE EXCEPTION 'لا يمكن تحويل مادة خام مستخدمة في وصفات إلى منتج بيع';
    END IF;
    IF v_used AND NEW.unit_type IS DISTINCT FROM OLD.unit_type THEN
      RAISE EXCEPTION 'لا يمكن تغيير وحدة مادة خام مرتبطة بوصفات؛ عدّل الوصفات أولاً';
    END IF;
    IF v_used AND OLD.is_active AND NOT NEW.is_active THEN
      RAISE EXCEPTION 'لا يمكن إيقاف مادة خام مستخدمة في وصفات؛ استبدلها في الوصفات أولاً';
    END IF;
  END IF;
  IF NEW.is_ingredient THEN
    IF EXISTS (SELECT 1 FROM public.product_recipes WHERE product_id = NEW.id) THEN
      RAISE EXCEPTION 'لا يمكن تحويل منتج له وصفة إلى مادة خام';
    END IF;
    NEW.track_inventory := true;
    NEW.show_in_menu := false;
    NEW.show_in_store := false;
  END IF;
  RETURN NEW;
END;
$$;
