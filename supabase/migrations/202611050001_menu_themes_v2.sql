-- توسيع قيد menu_theme ليقبل التصاميم الثمانية الجديدة (القديمة تبقى مقبولة)
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_menu_theme_chk;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_menu_theme_chk
  CHECK (menu_theme IN ('fresh','photo','night','minimal','lux','najdi','snow','pop','news','mint','glass','craft'));
