-- 059: Keep internal stock and costing helpers private.
REVOKE ALL ON FUNCTION public.felsy_stock_move(UUID,UUID,UUID,NUMERIC,TEXT,TEXT,UUID,NUMERIC) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.felsy_items_cost(UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.orders_after_issue() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validate_retail_product_configuration() FROM PUBLIC,anon,authenticated;

INSERT INTO public.migration_status(migration,note)
VALUES('059_private_inventory_helpers','Revokes direct API execution of internal SECURITY DEFINER stock, costing and trigger helpers; privileged workflows continue through approved server-side functions.')
ON CONFLICT(migration) DO NOTHING;