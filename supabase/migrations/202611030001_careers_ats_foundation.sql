-- Felsy careers foundation. Candidate records and resumes are private.
create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  department text,
  employment_type text not null default 'FULL_TIME',
  workplace_type text not null default 'ONSITE',
  location text,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  date_posted date not null default current_date,
  valid_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_posts_public_idx on public.job_posts(status,date_posted desc);
alter table public.job_posts enable row level security;
drop policy if exists "Public can view published job posts" on public.job_posts;
create policy "Public can view published job posts" on public.job_posts for select to anon, authenticated using (status='published');

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.job_posts(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  location text,
  university text,
  major text,
  experience_years integer check (experience_years is null or experience_years between 0 and 60),
  languages jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  resume_path text,
  privacy_consent boolean not null default false check (privacy_consent=true),
  status text not null default 'received' check (status in ('received','reviewing','shortlisted','rejected','hired')),
  created_at timestamptz not null default now()
);
create index if not exists job_applications_created_idx on public.job_applications(created_at desc);
alter table public.job_applications enable row level security;
revoke all on public.job_applications from anon, authenticated;
grant insert (id,job_id,full_name,email,phone,location,university,major,experience_years,languages,skills,resume_path,privacy_consent) on public.job_applications to anon, authenticated;
drop policy if exists "Applicants can submit applications" on public.job_applications;
create policy "Applicants can submit applications" on public.job_applications for insert to anon, authenticated with check (privacy_consent=true);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('job-resumes','job-resumes',false,8388608,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Applicants can upload private resumes" on storage.objects;
create policy "Applicants can upload private resumes" on storage.objects for insert to anon, authenticated
with check (bucket_id='job-resumes' and (storage.foldername(name))[1] is not null);
