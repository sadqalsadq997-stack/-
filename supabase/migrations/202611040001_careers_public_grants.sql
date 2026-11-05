-- Allow the public careers site to read published job postings and submit consented applications.
-- RLS remains the row-level boundary: job_posts SELECT is restricted to status='published';
-- job_applications INSERT is restricted by the existing privacy_consent=true policy.
grant select on table public.job_posts to anon;
grant insert on table public.job_applications to anon;
