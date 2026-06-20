-- ══════════════════════════════════════════════════════════════════
-- Felsy Enterprise Schema — Multi-Tenant SaaS
-- يدعم: ملايين الفواتير | آلاف المنشآت | آلاف الفروع
-- ══════════════════════════════════════════════════════════════════

-- ── Audit Logs ──────────────────────────────────────────────────
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  action       text not null,
  resource     text not null,
  resource_id  text,
  old_value    text,
  new_value    text,
  meta         text,
  user_id      text,
  user_name    text,
  user_role    text,
  branch_id    uuid,
  device_info  text,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz default now()
);
create index if not exists audit_logs_action_idx    on audit_logs(action);
create index if not exists audit_logs_user_idx      on audit_logs(user_id);
create index if not exists audit_logs_created_idx   on audit_logs(created_at desc);
create index if not exists audit_logs_resource_idx  on audit_logs(resource, resource_id);

-- ── Chart of Accounts ───────────────────────────────────────────
create table if not exists chart_of_accounts (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,
  name      text not null,
  name_en   text,
  type      text not null, -- asset | liability | equity | revenue | expense
  parent    text,          -- parent code
  is_group  boolean default false,
  is_active boolean default true,
  tenant_id uuid,
  created_at timestamptz default now()
);
create index if not exists coa_code_idx on chart_of_accounts(code);
create index if not exists coa_type_idx on chart_of_accounts(type);

-- ── Journal Entries ─────────────────────────────────────────────
create table if not exists journal_entries (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     text,
  branch_id      uuid,
  entry_type     text default 'auto', -- auto | manual
  debit_account  text not null references chart_of_accounts(code) on delete restrict,
  credit_account text not null references chart_of_accounts(code) on delete restrict,
  amount         numeric(14,2) not null,
  description    text,
  reference      text,
  created_at     timestamptz default now()
);
create index if not exists je_invoice_idx on journal_entries(invoice_id);
create index if not exists je_branch_idx  on journal_entries(branch_id);
create index if not exists je_date_idx    on journal_entries(created_at desc);

-- ── Vouchers ────────────────────────────────────────────────────
create table if not exists vouchers (
  id           uuid primary key default gen_random_uuid(),
  voucher_no   text unique not null,
  type         text not null, -- receipt | payment | journal
  amount       numeric(14,2) not null,
  account      text,
  counterpart  text,
  description  text,
  branch_id    uuid,
  reference_id text,
  status       text default 'draft', -- draft | approved | cancelled
  created_at   timestamptz default now()
);

-- ── Warehouses (Multi-Warehouse) ─────────────────────────────────
create table if not exists warehouses (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  branch_id uuid,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── Inventory Items (per warehouse) ─────────────────────────────
create table if not exists inventory_items (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null,
  warehouse_id uuid not null references warehouses(id),
  quantity     numeric(14,3) default 0,
  cost_price   numeric(14,2) default 0,
  reorder_level numeric(14,3) default 0,
  updated_at   timestamptz default now(),
  unique(product_id, warehouse_id)
);
create index if not exists inv_product_idx   on inventory_items(product_id);
create index if not exists inv_warehouse_idx on inventory_items(warehouse_id);

-- ── Inventory Movements ─────────────────────────────────────────
create table if not exists inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null,
  warehouse_id uuid not null,
  quantity     numeric(14,3) not null, -- موجب = دخول، سالب = خروج
  type         text not null, -- sale | purchase | adjustment | transfer | return
  reference_id text,
  note         text,
  created_at   timestamptz default now()
);
create index if not exists invmov_product_idx on inventory_movements(product_id);

-- ── Customer/Supplier Balances (for Aging) ──────────────────────
create table if not exists customer_balances (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid unique not null,
  name              text,
  balance           numeric(14,2) default 0,
  credit_limit      numeric(14,2) default 0,
  last_invoice_date timestamptz,
  updated_at        timestamptz default now()
);

create table if not exists supplier_balances (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid unique not null,
  name              text,
  balance           numeric(14,2) default 0,
  last_invoice_date timestamptz,
  updated_at        timestamptz default now()
);

-- ── Webhooks Registry ───────────────────────────────────────────
create table if not exists webhooks (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  events     text[] not null,
  secret     text not null,
  active     boolean default true,
  tenant_id  uuid,
  created_at timestamptz default now()
);

-- ── Integration Connections ──────────────────────────────────────
create table if not exists integration_connections (
  id           uuid primary key default gen_random_uuid(),
  plugin_id    text not null,
  tenant_id    uuid,
  config       jsonb default '{}',
  access_token text,
  refresh_token text,
  expires_at   timestamptz,
  status       text default 'connected',
  created_at   timestamptz default now()
);
create index if not exists integrations_plugin_idx  on integration_connections(plugin_id);
create index if not exists integrations_tenant_idx  on integration_connections(tenant_id);

-- ── Credit Notes & Debit Notes ───────────────────────────────────
alter table invoices
  add column if not exists invoice_type        text default 'B2C',
  add column if not exists original_invoice_id uuid,
  add column if not exists uuid                text,
  add column if not exists zatca_status        text default 'pending',
  add column if not exists reason              text;

-- ── Cost Centers ─────────────────────────────────────────────────
create table if not exists cost_centers (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  type      text default 'branch', -- branch | project | department
  parent_id uuid,
  tenant_id uuid,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── RPC: deduct_stock ────────────────────────────────────────────
create or replace function deduct_stock(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_quantity     numeric,
  p_invoice_id   text
) returns void language plpgsql as $$
begin
  update inventory_items
  set quantity   = quantity - p_quantity,
      updated_at = now()
  where product_id = p_product_id and warehouse_id = p_warehouse_id;

  insert into inventory_movements (product_id, warehouse_id, quantity, type, reference_id)
  values (p_product_id, p_warehouse_id, -p_quantity, 'sale', p_invoice_id);
end;
$$;

-- ── RPC: add_stock ───────────────────────────────────────────────
create or replace function add_stock(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_quantity     numeric,
  p_invoice_id   text
) returns void language plpgsql as $$
begin
  insert into inventory_items (product_id, warehouse_id, quantity)
  values (p_product_id, p_warehouse_id, p_quantity)
  on conflict (product_id, warehouse_id)
  do update set quantity = inventory_items.quantity + excluded.quantity,
                updated_at = now();

  insert into inventory_movements (product_id, warehouse_id, quantity, type, reference_id)
  values (p_product_id, p_warehouse_id, p_quantity, 'return', p_invoice_id);
end;
$$;

-- ── إدخال دليل الحسابات الافتراضي ─────────────────────────────
insert into chart_of_accounts (code,name,name_en,type,parent,is_group) values
  ('1000','الأصول','Assets','asset',null,true),
  ('1100','النقدية وما في حكمها','Cash & Equivalents','asset','1000',false),
  ('1110','الصندوق','Cash on Hand','asset','1100',false),
  ('1120','البنك','Bank Account','asset','1100',false),
  ('1200','الذمم المدينة','Accounts Receivable','asset','1000',false),
  ('1300','المخزون','Inventory','asset','1000',false),
  ('1400','ضريبة قيمة مضافة مدفوعة','VAT Paid','asset','1000',false),
  ('2000','الخصوم','Liabilities','liability',null,true),
  ('2100','الذمم الدائنة','Accounts Payable','liability','2000',false),
  ('2200','ضريبة قيمة مضافة محصلة','VAT Payable','liability','2000',false),
  ('3000','حقوق الملكية','Equity','equity',null,true),
  ('3100','رأس المال','Capital','equity','3000',false),
  ('3200','الأرباح المحتجزة','Retained Earnings','equity','3000',false),
  ('4000','الإيرادات','Revenue','revenue',null,true),
  ('4100','إيرادات المبيعات','Sales Revenue','revenue','4000',false),
  ('5000','المصروفات','Expenses','expense',null,true),
  ('5100','تكلفة البضاعة المباعة','COGS','expense','5000',false),
  ('5200','مصروفات تشغيلية','Operating Expenses','expense','5000',false),
  ('5210','رواتب','Salaries','expense','5200',false),
  ('5220','إيجار','Rent','expense','5200',false)
on conflict (code) do nothing;
