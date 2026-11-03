create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'bug' check (category in ('bug','outage','performance','security','deployment','request')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','triaged','in_progress','blocked','resolved','closed')),
  affected_area text,
  assigned_to uuid references public.platform_team_members(id) on delete set null,
  reported_by text,
  source text not null default 'owner_console',
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists platform_incidents_status_severity_idx on public.platform_incidents(status,severity,created_at desc);
alter table public.platform_incidents enable row level security;