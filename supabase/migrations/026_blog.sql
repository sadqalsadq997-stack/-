-- ══════════════════════════════════════════════════════════════════
-- فلسي v25 — المدونة (حلول ونصائح لأصحاب المنشآت)
-- الكتابة من لوحة المالك فقط (owner-admin-api)، والقراءة عامة للمنشور.
-- شغّله بعد 025. آمن للتكرار.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS cover_alt TEXT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT 'فريق فلسي';
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS reading_minutes INT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS cta TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE public.blog_posts ALTER COLUMN published SET DEFAULT false;
ALTER TABLE public.blog_posts ALTER COLUMN published_at SET DEFAULT now();
UPDATE public.blog_posts SET category = 'solutions' WHERE category = 'article';
UPDATE public.blog_posts SET category = 'updates' WHERE category = 'update';
CREATE INDEX IF NOT EXISTS blog_posts_live_idx ON public.blog_posts(published, published_at DESC);

-- دقائق القراءة تُحسب دائماً من المحتوى (العربي ~180 كلمة/دقيقة)
CREATE OR REPLACE FUNCTION public.blog_reading_minutes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.reading_minutes := greatest(1, round(coalesce(array_length(regexp_split_to_array(trim(coalesce(NEW.content, '')), '\s+'), 1), 0) / 180.0)::INT);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_blog_reading_minutes ON public.blog_posts;
CREATE TRIGGER trg_blog_reading_minutes BEFORE INSERT OR UPDATE OF content ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_reading_minutes();
UPDATE public.blog_posts SET content = content WHERE reading_minutes IS NULL;

-- المنشور فقط، والمجدول يظهر وقت موعده
DROP POLICY IF EXISTS blog_posts_public ON public.blog_posts;
CREATE POLICY blog_posts_public ON public.blog_posts FOR SELECT TO anon, authenticated
  USING (published AND published_at <= now());
REVOKE INSERT, UPDATE, DELETE ON public.blog_posts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.blog_card(b public.blog_posts)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('slug', b.slug, 'title', b.title, 'excerpt', b.excerpt, 'cover_url', b.cover_url, 'cover_alt', b.cover_alt,
    'category', b.category, 'tags', b.tags, 'published_at', b.published_at, 'updated_at', b.updated_at,
    'reading_minutes', b.reading_minutes, 'author_name', b.author_name, 'featured', b.featured);
$$;

-- قائمة المقالات (تصنيف + بحث + صفحات)
CREATE OR REPLACE FUNCTION public.public_blog_list(p_category TEXT DEFAULT NULL, p_q TEXT DEFAULT NULL, p_limit INT DEFAULT 12, p_offset INT DEFAULT 0)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT * FROM public.blog_posts b
     WHERE b.published AND b.published_at <= now()
       AND (p_category IS NULL OR p_category = '' OR b.category = p_category)
       AND (p_q IS NULL OR length(trim(p_q)) < 2
            OR b.title ILIKE '%' || trim(p_q) || '%' OR b.excerpt ILIKE '%' || trim(p_q) || '%' OR trim(p_q) = ANY (b.tags))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', coalesce((SELECT jsonb_agg(public.blog_card(x) ORDER BY x.featured DESC, x.published_at DESC)
                        FROM (SELECT * FROM base ORDER BY featured DESC, published_at DESC
                              LIMIT least(greatest(p_limit, 1), 50) OFFSET greatest(p_offset, 0)) x), '[]'::JSONB),
    'categories', coalesce((SELECT jsonb_object_agg(category, n) FROM (
        SELECT category, count(*) n FROM public.blog_posts WHERE published AND published_at <= now() GROUP BY category) c), '{}'::JSONB));
$$;

-- مقالة كاملة + مقالات ذات صلة
CREATE OR REPLACE FUNCTION public.public_blog_post(p_slug TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.blog_card(b) || jsonb_build_object('content', b.content, 'seo_title', b.seo_title,
           'seo_description', b.seo_description, 'faq', b.faq, 'cta', b.cta,
           'related', coalesce((SELECT jsonb_agg(public.blog_card(r)) FROM (
               SELECT * FROM public.blog_posts r WHERE r.published AND r.published_at <= now() AND r.id <> b.id
                ORDER BY (r.category = b.category) DESC, (r.tags && b.tags) DESC, r.published_at DESC LIMIT 3) r), '[]'::JSONB))
    FROM public.blog_posts b
   WHERE b.slug = p_slug AND b.published AND b.published_at <= now();
$$;

-- لخريطة الموقع وRSS
CREATE OR REPLACE FUNCTION public.public_blog_feed()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(public.blog_card(b) ORDER BY b.published_at DESC), '[]'::JSONB)
    FROM (SELECT * FROM public.blog_posts WHERE published AND published_at <= now() ORDER BY published_at DESC LIMIT 1000) b;
$$;
GRANT EXECUTE ON FUNCTION public.public_blog_list(TEXT, TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_blog_post(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_blog_feed() TO anon, authenticated;

-- صور المدونة: مخزن عام للصور فقط (الرفع من لوحة المالك عبر السيرفر)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('blog', 'blog', true, 1048576, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 1048576, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];
  END IF;
END $$;

INSERT INTO public.migration_status (migration, note) VALUES (
  '026_blog', 'المدونة: غلاف، وسوم، جدولة النشر، أسئلة شائعة، قراءة عامة آمنة، صور.'
) ON CONFLICT (migration) DO NOTHING;
