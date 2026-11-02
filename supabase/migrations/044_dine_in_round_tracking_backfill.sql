-- 044: Backfill round metadata for existing open dine-in bills.
WITH target AS (
  SELECT id, gen_random_uuid() AS legacy_round_id, status, notes, created_at, items
  FROM public.orders
  WHERE order_type = 'dine_in'
    AND status IN ('pending', 'preparing', 'ready')
    AND jsonb_typeof(coalesce(items, '[]'::jsonb)) = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(items, '[]'::jsonb)) i
      WHERE NOT (i ? 'round_id')
    )
), rebuilt AS (
  SELECT t.id,
         jsonb_agg(
           CASE WHEN item ? 'round_id' THEN item
             ELSE item || jsonb_build_object(
               'round_id', t.legacy_round_id,
               'round_number', 1,
               'round_status', coalesce(nullif(item->>'round_status',''), t.status, 'pending'),
               'round_added_at', coalesce(nullif(item->>'round_added_at','')::timestamptz, t.created_at),
               'round_notes', coalesce(nullif(item->>'round_notes',''), t.notes)
             )
           END ORDER BY ord
         ) AS items
  FROM target t
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(t.items, '[]'::jsonb)) WITH ORDINALITY e(item, ord)
  GROUP BY t.id
)
UPDATE public.orders o
SET items = rebuilt.items, updated_at = now()
FROM rebuilt
WHERE o.id = rebuilt.id;

INSERT INTO public.migration_status (migration, note)
VALUES ('044_dine_in_round_tracking_backfill', 'Backfills open dine-in orders with independent round identifiers and status metadata.')
ON CONFLICT (migration) DO NOTHING;