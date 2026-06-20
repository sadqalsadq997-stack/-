-- ══════════════════════════════════════════════════════════════
-- Migration: ميزات جديدة — مدونة، خطط، رسائل، إعدادات النظام
-- ══════════════════════════════════════════════════════════════

-- 1. جدول خطط الاشتراك (قابلة للتعديل من مالك النظام)
create table if not exists subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price_monthly numeric(10,2) default 0,
  price_yearly  numeric(10,2) default 0,
  features      jsonb default '[]',
  sort_order    int  default 0,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- 2. جدول المدونة والأخبار
create table if not exists blog_posts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text unique,
  excerpt         text,
  content         text,
  category        text default 'news',  -- news | article | update
  seo_title       text,
  seo_description text,
  published       boolean default false,
  published_at    timestamptz default now(),
  author_id       text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- index للـ SEO (البحث بالـ slug)
create index if not exists blog_posts_slug_idx on blog_posts(slug) where published = true;

-- 3. جدول الإشعارات الجماعية للمالكين
create table if not exists owner_notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   text,
  recipient_name text,
  subject        text not null,
  body           text not null,
  type           text default 'broadcast',  -- broadcast | personal
  read           boolean default false,
  sent_at        timestamptz default now()
);

-- 4. جدول إعدادات النظام العامة (key-value)
create table if not exists system_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

-- إدخال القيمة الافتراضية لاسم المساعد الذكي
insert into system_settings (key, value)
values ('ai_assistant', '{"name":"فلسي مساعد","persona":"أنت مساعد دعم فني ذكي لنظام فلسي POS. أجب بالعربية بأسلوب مهني ومختصر."}')
on conflict (key) do nothing;

-- 5. إضافة حقول مفقودة لجدول العملاء
alter table customers
  add column if not exists branch_id uuid references branches(id) on delete set null,
  add column if not exists total_purchases numeric(12,2) default 0;

-- 6. إضافة حقول مفقودة لجدول الموظفين  
alter table employee_profiles
  add column if not exists permissions jsonb default '{}';

-- 7. فهرس للبحث بالفرع في العملاء
create index if not exists customers_branch_idx on customers(branch_id);
