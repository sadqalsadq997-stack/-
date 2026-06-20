-- ══════════════════════════════════════════════════════
-- فلسي v8 — Migration 008
-- إضافة theme وتحسينات ZATCA وSEO
-- ══════════════════════════════════════════════════════

-- إضافة حقل theme لـ app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- إضافة حقول ZATCA لجدول branches
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS zatca_seller_name TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS zatca_vat_number TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS zatca_city TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS zatca_phase2_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL;

-- إضافة حقل branch_id للدومين (ربط لكل منشأة)
ALTER TABLE public.domains ADD COLUMN IF NOT EXISTS auto_configured BOOLEAN DEFAULT false;
ALTER TABLE public.domains ADD COLUMN IF NOT EXISTS menu_path TEXT DEFAULT '/menu';
ALTER TABLE public.domains ADD COLUMN IF NOT EXISTS store_path TEXT DEFAULT '/store';

-- إضافة حقول SEO للمنتجات
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- إضافة حقول SEO للتصنيفات  
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- إضافة حقول إضافية للطلبات (لدعم طلبات القائمة العامة)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- View مخصص للـ public menu مع SEO
CREATE OR REPLACE VIEW public.public_menu_data AS
SELECT
  p.id, p.name, p.name_ar, p.description_ar, p.price,
  p.image_url, p.category_id, p.is_featured, p.sort_order,
  p.seo_title, p.seo_description, p.branch_id,
  c.name AS category_name, c.name_ar AS category_name_ar, c.icon AS category_icon,
  b.name AS branch_name, b.name_ar AS branch_name_ar,
  b.logo_url AS branch_logo, b.phone AS branch_phone, b.address AS branch_address
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.branches b ON b.id = p.branch_id
WHERE p.is_active = true;

GRANT SELECT ON public.public_menu_data TO anon, authenticated;
