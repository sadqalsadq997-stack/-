# تحديث فلسي v24 — خطوات التركيب

## 1) قاعدة البيانات (Supabase → SQL Editor)
شغّل الملف بعد 021 و022 و023 (آمن لو انعاد تشغيله):

```
supabase/migrations/024_accounts_returns_vat_scale.sql
```

اللي يضيفه: رقم الحساب لكل منشأة (يبدأ من 100001)، أختام الولاء بالسيرفر، المرتجع كإشعار دائن، فواتير المشتريات، الإقرار الضريبي، ثيمات المنيو والرابط المختصر، التنظيف اليومي، الفهارس، قائمة المشتركين للوحة المالك، الأرشفة، ومخازن الصور.

**pg_cron:** فعّله من Database → Extensions، ثم أعد تشغيل 024 ⇒ التنظيف اليومي يتجدول تلقائياً.

## 2) إلغاء تأكيد البريد
النظام ينشئ الحسابات مؤكدة مسبقاً. للتأكيد الكامل: Authentication → Sign In / Providers → Email → أطفئ **Confirm email**.

## 3) قالب رسالة استعادة كلمة المرور (حتى ما يظهر رابط Supabase للعميل)
Authentication → Emails → Reset Password، غيّر الرابط إلى:
```
{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery
```
وتأكد أن Site URL = `https://felsy.org`.

## 4) الدوال (Edge Functions)
```
supabase functions deploy account-manage --no-verify-jwt
supabase functions deploy owner-admin-api --no-verify-jwt
supabase functions deploy billing-run-cycle --no-verify-jwt
supabase functions deploy archive-orders --no-verify-jwt
```
أسرار جديدة: `SITE_URL=https://felsy.org` (روابط الاستعادة).

## 5) الصور خارج Supabase — Cloudflare R2 (اختياري لكنه مهم مع النمو)
1. Cloudflare → R2 → أنشئ bucket مثل `felsy-images` واربط له دومين عام مثل `img.felsy.org`.
2. أنشئ API Token للـ R2 (Object Read & Write).
3. في Vercel → Environment Variables:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=felsy-images`, `R2_PUBLIC_URL=https://img.felsy.org`

بدون هذي المتغيرات النظام يشتغل عادي ويرفع على Supabase (والصور مضغوطة في الحالتين).

## 6) أرشفة الطلبات القديمة (شهرياً)
- bucket خاص (غير عام) في R2 مثل `felsy-archive`، وفي أسرار Supabase:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ARCHIVE_BUCKET=felsy-archive`, `ARCHIVE_SECRET=<نص عشوائي طويل>`
- جدولة شهرية (SQL Editor، بعد تفعيل pg_cron و pg_net):
```sql
SELECT cron.schedule('felsy-archive', '30 2 2 * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT>.supabase.co/functions/v1/archive-orders',
    headers := jsonb_build_object('Authorization', 'Bearer <ARCHIVE_SECRET>')
  );
$$);
```

## 7) النشر
ارفع المشروع على Vercel كالعادة. ملفات جديدة في `api/`: `menu-seo.js` (منيو مفهرس في Google) و`upload.js` (رفع الصور).

## اختبار سريع بعد النشر
- افتح `felsy.org/m/<رقم حسابك>` ← يظهر المنيو بالتصميم المختار.
- الإعدادات ← تصميم المنيو ← جرّب الثيمات والألوان واحفظ.
- نقطة البيع ← اكتب جوال عميل ← بِع ← افتح بطاقته `/loyalty/<id>` وشوف الختم يوصل خلال 10 ثوانٍ.
- شاشة المطبخ ← "جاهز" ← جوال العميل يرن (افتح رابط البيجر من جوال ثاني).
- الطلبات ← افتح طلب ← مرتجع.
- المحاسبة ← الإقرار الضريبي / فواتير المشتريات.
- لوحة المالك ← المشتركين.

تفاصيل السعة والتكلفة: `docs/CAPACITY.md`.
