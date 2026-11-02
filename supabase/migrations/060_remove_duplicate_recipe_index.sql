DROP INDEX IF EXISTS public.product_recipe_items_ingredient_idx;
INSERT INTO public.migration_status(migration,note)
VALUES('060_remove_duplicate_recipe_index','Removes the duplicate ingredient lookup index flagged by the database performance advisor; keeps the original index.')
ON CONFLICT(migration) DO NOTHING;