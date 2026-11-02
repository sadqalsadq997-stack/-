-- Multi-store purchasing and warehouse receipts
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id), ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id), ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid'));
CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric(14,4) NOT NULL CHECK(quantity>0), unit_name text NOT NULL DEFAULT 'قطعة',
 unit_factor numeric(14,6) NOT NULL DEFAULT 1 CHECK(unit_factor>0), base_quantity numeric(16,4) NOT NULL CHECK(base_quantity>0),
 unit_cost numeric(14,4) NOT NULL CHECK(unit_cost>=0), base_unit_cost numeric(14,4) NOT NULL CHECK(base_unit_cost>=0),
 tax_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK(tax_rate BETWEEN 0 AND 100),
 net_amount numeric(14,2) NOT NULL CHECK(net_amount>=0), tax_amount numeric(14,2) NOT NULL CHECK(tax_amount>=0),
 total_amount numeric(14,2) NOT NULL CHECK(total_amount>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_invoice_items_invoice_idx ON public.purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS purchase_invoice_items_product_idx ON public.purchase_invoice_items(tenant_id,product_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_warehouse_product_uidx ON public.inventory_items(tenant_id,warehouse_id,product_id);
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_invoice_items_tenant_access ON public.purchase_invoice_items;
CREATE POLICY purchase_invoice_items_tenant_access ON public.purchase_invoice_items FOR ALL TO authenticated USING(tenant_id IN(SELECT public.current_tenant_ids())) WITH CHECK(tenant_id IN(SELECT public.current_tenant_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_invoice_items TO authenticated;
CREATE OR REPLACE FUNCTION public.create_purchase_receipt(p_branch uuid, p_warehouse uuid, p_supplier uuid, p_supplier_name text, p_supplier_vat text, p_invoice_number text, p_invoice_date date, p_paid_amount numeric, p_notes text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid; v_supplier_name text; v_supplier_vat text; v_invoice uuid;
  v_line jsonb; v_product uuid; v_qty numeric; v_factor numeric; v_base_qty numeric;
  v_unit_cost numeric; v_base_cost numeric; v_tax_rate numeric; v_net numeric; v_tax numeric;
  v_total numeric := 0; v_net_total numeric := 0; v_tax_total numeric := 0;
  v_paid numeric := greatest(coalesce(p_paid_amount,0),0);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'أضف صنفاً واحداً على الأقل'; END IF;
  SELECT b.tenant_id INTO v_tenant FROM public.branches b WHERE b.id=p_branch AND b.tenant_id IN (SELECT public.current_tenant_ids()) LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'الفرع غير تابع لحسابك'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse AND w.tenant_id=v_tenant AND w.is_active) THEN RAISE EXCEPTION 'المستودع غير صحيح'; END IF;
  IF p_supplier IS NOT NULL THEN
    SELECT s.name,s.vat_number INTO v_supplier_name,v_supplier_vat FROM public.suppliers s WHERE s.id=p_supplier AND s.tenant_id=v_tenant;
    IF v_supplier_name IS NULL THEN RAISE EXCEPTION 'المورد غير تابع للمنشأة'; END IF;
  ELSE v_supplier_name:=nullif(trim(p_supplier_name),''); v_supplier_vat:=nullif(trim(p_supplier_vat),''); END IF;
  IF v_supplier_name IS NULL THEN RAISE EXCEPTION 'اسم المورد مطلوب'; END IF;
  IF nullif(trim(p_invoice_number),'') IS NULL THEN RAISE EXCEPTION 'رقم فاتورة المورد مطلوب'; END IF;
  IF v_supplier_vat IS NOT NULL AND v_supplier_vat !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'الرقم الضريبي للمورد غير صحيح'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_product:=(v_line->>'product_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    v_factor:=coalesce(nullif(v_line->>'unit_factor','')::numeric,1);
    v_unit_cost:=coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    v_tax_rate:=coalesce(nullif(v_line->>'tax_rate','')::numeric,15);
    IF v_qty<=0 OR v_factor<=0 OR v_unit_cost<0 OR v_tax_rate<0 OR v_tax_rate>100 THEN RAISE EXCEPTION 'بيانات كمية أو تكلفة أو ضريبة غير صحيحة'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=v_product AND p.tenant_id=v_tenant) THEN RAISE EXCEPTION 'أحد المنتجات لا يتبع المنشأة'; END IF;
    v_net:=round(v_qty*v_unit_cost,2); v_tax:=round(v_net*v_tax_rate/100,2);
    v_net_total:=v_net_total+v_net; v_tax_total:=v_tax_total+v_tax;
  END LOOP;
  v_total:=v_net_total+v_tax_total;
  IF v_paid>v_total THEN RAISE EXCEPTION 'المبلغ المدفوع أكبر من إجمالي الفاتورة'; END IF;
  INSERT INTO public.purchase_invoices(tenant_id,branch_id,supplier_id,warehouse_id,supplier_name,supplier_vat,invoice_number,invoice_date,net_amount,vat_amount,notes,invoice_kind,expense_account,paid,paid_amount,payment_status,paid_at)
  VALUES(v_tenant,p_branch,p_supplier,p_warehouse,v_supplier_name,v_supplier_vat,trim(p_invoice_number),coalesce(p_invoice_date,current_date),v_net_total,v_tax_total,p_notes,'tax','1300',v_paid>=v_total,v_paid,CASE WHEN v_paid>=v_total THEN 'paid' WHEN v_paid>0 THEN 'partial' ELSE 'unpaid' END,CASE WHEN v_paid>=v_total THEN current_date ELSE NULL END)
  RETURNING id INTO v_invoice;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_product:=(v_line->>'product_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    v_factor:=coalesce(nullif(v_line->>'unit_factor','')::numeric,1);
    v_unit_cost:=coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    v_tax_rate:=coalesce(nullif(v_line->>'tax_rate','')::numeric,15);
    v_base_qty:=v_qty*v_factor; v_base_cost:=v_unit_cost/v_factor;
    v_net:=round(v_qty*v_unit_cost,2); v_tax:=round(v_net*v_tax_rate/100,2);
    INSERT INTO public.purchase_invoice_items(tenant_id,purchase_invoice_id,product_id,quantity,unit_name,unit_factor,base_quantity,unit_cost,base_unit_cost,tax_rate,net_amount,tax_amount,total_amount)
    VALUES(v_tenant,v_invoice,v_product,v_qty,coalesce(nullif(v_line->>'unit_name',''),'قطعة'),v_factor,v_base_qty,v_unit_cost,v_base_cost,v_tax_rate,v_net,v_tax,v_net+v_tax);
    INSERT INTO public.inventory_items(tenant_id,warehouse_id,product_id,quantity,cost_price) VALUES(v_tenant,p_warehouse,v_product,v_base_qty,v_base_cost)
    ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET
      cost_price=CASE WHEN public.inventory_items.quantity+excluded.quantity>0 THEN ((public.inventory_items.quantity*public.inventory_items.cost_price)+(excluded.quantity*excluded.cost_price))/(public.inventory_items.quantity+excluded.quantity) ELSE excluded.cost_price END,
      quantity=public.inventory_items.quantity+excluded.quantity,updated_at=now();
    INSERT INTO public.inventory_movements(tenant_id,warehouse_id,product_id,quantity,type,reference_id,note)
    VALUES(v_tenant,p_warehouse,v_product,v_base_qty,'purchase',v_invoice::text,'استلام فاتورة مشتريات '||trim(p_invoice_number));
    UPDATE public.products p SET stock_quantity=coalesce(p.stock_quantity,0)+v_base_qty,
      cost_price=CASE WHEN coalesce(p.stock_quantity,0)+v_base_qty>0 THEN ((coalesce(p.stock_quantity,0)*coalesce(p.cost_price,0))+(v_base_qty*v_base_cost))/(coalesce(p.stock_quantity,0)+v_base_qty) ELSE v_base_cost END,
      updated_at=now() WHERE p.id=v_product AND p.tenant_id=v_tenant;
  END LOOP;
  IF p_supplier IS NOT NULL THEN
    UPDATE public.suppliers SET total_credit=coalesce(total_credit,0)+v_total,total_paid=coalesce(total_paid,0)+v_paid,balance_due=coalesce(balance_due,0)+(v_total-v_paid),last_payment_date=CASE WHEN v_paid>0 THEN current_date ELSE last_payment_date END,updated_at=now()
    WHERE id=p_supplier AND tenant_id=v_tenant;
    INSERT INTO public.supplier_balances(supplier_id,tenant_id,name,balance,last_invoice_date) VALUES(p_supplier,v_tenant,v_supplier_name,v_total-v_paid,now())
    ON CONFLICT(supplier_id) DO UPDATE SET balance=coalesce(public.supplier_balances.balance,0)+(v_total-v_paid),last_invoice_date=now(),updated_at=now();
  END IF;
  RETURN v_invoice;
END;
$function$


CREATE OR REPLACE FUNCTION public.felsy_post_purchase(r public.purchase_invoices)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desc text := 'مشتريات ' || coalesce(r.supplier_name,'') || ' ' || coalesce(r.invoice_number,'');
  v_total numeric := r.net_amount + r.vat_amount;
  v_paid numeric := CASE WHEN r.paid THEN v_total ELSE least(coalesce(r.paid_amount,0),v_total) END;
BEGIN
  PERFORM public.felsy_post(r.tenant_id,r.branch_id,'pi:'||r.id,r.invoice_date::timestamptz,v_desc,
    jsonb_build_array(
      jsonb_build_object('dr',r.expense_account,'cr','2100','amount',r.net_amount+CASE WHEN r.deductible THEN 0 ELSE r.vat_amount END),
      jsonb_build_object('dr','1400','cr','2100','amount',CASE WHEN r.deductible THEN r.vat_amount ELSE 0 END,'desc','ضريبة مدخلات '||coalesce(r.invoice_number,''))
    ));
  IF v_paid>0 THEN
    PERFORM public.felsy_post(r.tenant_id,r.branch_id,'pi-pay:'||r.id,coalesce(r.paid_at,r.invoice_date)::timestamptz,'سداد '||v_desc,
      jsonb_build_array(jsonb_build_object('dr','2100','cr','1120','amount',v_paid)));
  ELSE
    DELETE FROM public.journal_entries WHERE tenant_id=r.tenant_id AND entry_type='auto' AND reference='pi-pay:'||r.id;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_receipt(uuid,uuid,uuid,text,text,text,date,numeric,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_receipt(uuid,uuid,uuid,text,text,text,date,numeric,text,jsonb) TO authenticated;
