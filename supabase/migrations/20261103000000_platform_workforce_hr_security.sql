alter table public.platform_team_members
 add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
 add column if not exists employment_status text not null default 'active' check (employment_status in ('active','probation','leave','suspended','terminated')),
 add column if not exists employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','freelance','intern')),
 add column if not exists hire_date date,
 add column if not exists manager_id uuid references public.platform_team_members(id) on delete set null,
 add column if not exists last_login_at timestamptz,
 add column if not exists must_change_password boolean not null default true,
 add column if not exists permission_version integer not null default 1;
create table if not exists public.platform_employee_private(member_id uuid primary key references public.platform_team_members(id) on delete cascade,sensitive_data_ciphertext text,sensitive_data_key_version text not null default 'v1',emergency_contact_ciphertext text,bank_data_ciphertext text,updated_at timestamptz not null default now(),updated_by uuid);
create table if not exists public.platform_payroll_records(id uuid primary key default gen_random_uuid(),member_id uuid not null references public.platform_team_members(id) on delete cascade,pay_period date not null,base_salary numeric(12,2) not null default 0 check(base_salary>=0),allowances numeric(12,2) not null default 0 check(allowances>=0),deductions numeric(12,2) not null default 0 check(deductions>=0),bonus numeric(12,2) not null default 0 check(bonus>=0),currency text not null default 'SAR',status text not null default 'draft' check(status in ('draft','approved','paid','cancelled')),payment_reference text,notes text,created_by uuid,approved_by uuid,approved_at timestamptz,paid_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(member_id,pay_period));
create table if not exists public.platform_team_tasks(id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',assigned_to uuid not null references public.platform_team_members(id) on delete restrict,created_by uuid,priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),status text not null default 'new' check(status in ('new','in_progress','blocked','completed','cancelled')),due_at timestamptz,started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.platform_team_audit_logs(id uuid primary key default gen_random_uuid(),actor_member_id uuid references public.platform_team_members(id) on delete set null,target_member_id uuid references public.platform_team_members(id) on delete set null,action text not null,entity_type text not null,entity_id uuid,metadata jsonb not null default '{}'::jsonb,ip_hash text,created_at timestamptz not null default now());
create index if not exists platform_team_tasks_assignee_status_idx on public.platform_team_tasks(assigned_to,status,due_at);
create index if not exists platform_payroll_member_period_idx on public.platform_payroll_records(member_id,pay_period desc);
create index if not exists platform_team_audit_target_created_idx on public.platform_team_audit_logs(target_member_id,created_at desc);
alter table public.platform_employee_private enable row level security;
alter table public.platform_payroll_records enable row level security;
alter table public.platform_team_tasks enable row level security;
alter table public.platform_team_audit_logs enable row level security;
alter table public.platform_team_members enable row level security;
revoke all on public.platform_employee_private,public.platform_payroll_records,public.platform_team_tasks,public.platform_team_audit_logs,public.platform_team_members from anon,authenticated;
grant all on public.platform_employee_private,public.platform_payroll_records,public.platform_team_tasks,public.platform_team_audit_logs,public.platform_team_members to service_role;