-- حاوية شعارات المنشآت (قراءة عامة لأن الفاتورة تعرض الشعار برابط https)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 307200, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- رفع الشعار للمستخدمين المسجلين فقط.
-- ⚠ راجع هذه السياسة مع نموذج العزل عندكم (الدخول عبر auth-login): لو الرفع من المتصفح لا يحمل
-- دور authenticated فالأسلم الرفع عبر Edge Function بدل فتح الكتابة.
drop policy if exists "logos_insert_authenticated" on storage.objects;
create policy "logos_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos');
