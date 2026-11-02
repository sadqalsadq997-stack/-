-- 048: Never expose the branch's private pager lookup token in public menu JSON.
CREATE OR REPLACE FUNCTION public.strip_private(j JSONB)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT j - ARRAY[
    'tenant_id','account_id','cost','cost_price','purchase_price','supplier_id','supplier',
    'profit','margin','created_by','updated_by','notes_internal','barcode_internal','sku',
    'stock','stock_quantity','quantity','min_stock','min_stock_alert','track_inventory',
    'vat_number','cr_number','zatca_vat_number','zatca_seller_name','zatca_invoice_counter',
    'email','owner_phone','notification_phone','notification_phone_country','notification_sms_sender',
    'api_key','secret','base_price','carton_price','expiry_date','pager_public_token'
  ];
$$;

INSERT INTO public.migration_status (migration, note)
VALUES ('048_hide_pager_branch_token', 'Removes the private branch pager token from public menu payloads.')
ON CONFLICT (migration) DO NOTHING;