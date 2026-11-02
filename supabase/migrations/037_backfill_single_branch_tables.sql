-- 037: Backfill branch_id only when a tenant has exactly one active branch.
-- Multi-branch tenants are intentionally left untouched to avoid assigning tables incorrectly.
WITH single_active_branch AS (
  SELECT tenant_id, min(id::text)::uuid AS branch_id
  FROM public.branches
  WHERE coalesce(is_active, true)
  GROUP BY tenant_id
  HAVING count(*) = 1
)
UPDATE public.tables_map t
SET branch_id = b.branch_id,
    updated_at = now()
FROM single_active_branch b
WHERE t.tenant_id = b.tenant_id
  AND t.branch_id IS NULL
  AND t.current_order_id IS NULL;
