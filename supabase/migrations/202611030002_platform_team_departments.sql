alter table public.platform_team_members add column if not exists department text not null default 'technical_support';
alter table public.platform_team_members add column if not exists job_title text;
create index if not exists platform_team_members_department_idx on public.platform_team_members(department,is_active);