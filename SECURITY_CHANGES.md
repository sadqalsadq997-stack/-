# تحديث الأمان والدفع — فلسي

## خطوات التفعيل (بالترتيب)
1. **قاعدة البيانات:** شغّل `supabase/migrations/017_access_lockdown.sql` في SQL Editor.
2. **حسابك أنت:** نفّذ الـ SQL المكتوب في آخر ملف 017 (يربط بريدك بالمنشأة الافتراضية ويعطيها اشتراكاً) — وإلا ستظهر لك صفحة الدفع.
3. **Secrets في Supabase:**
   - `MOYASAR_SECRET_KEY` (المفتاح السري من ميسر)
   - `APP_PUBLIC_URL` = `https://felsy.org`
   - `MOYASAR_WEBHOOK_SECRET` (نفس القيمة في لوحة ميسر → Webhooks → Secret token) — **إلزامي الآن**
   - `BILLING_CRON_SECRET` — **إلزامي الآن** (بدونه محرك التجديد يرفض كل الطلبات)
4. **نشر الدوال:**
   `supabase functions deploy billing-subscribe moyasar-webhook billing-run-cycle domain-purchase domain-setup-dns send-wallet-sms google-wallet-issue google-wallet-update`
5. **الأسعار:** تأكد أن أسعار `billing_plans` في لوحة المالك (تبويب الفوترة الدورية) هي نفس أسعارك (90 / 150 / 350). الصفحة الرئيسية وصفحة الدفع تعرض الآن السعر من قاعدة البيانات — وهو نفسه اللي يُخصم.
6. **رموز PIN للموظفين:** كانت تُحفظ بدون تشفير فما كانت تشتغل أصلاً. افتح كل موظف وأعد إدخال رمزه مرة واحدة.
7. **بعد ما تتأكد إن كل شي شغال:** شغّل `018_tenant_paywall_rls.sql` — هذا القفل النهائي في قاعدة البيانات نفسها (عزل بيانات كل منشأة + لا بيانات بدون اشتراك).

## مسار الدخول الجديد
تسجيل حساب → اسم المنشأة → اختيار الباقة + الدفع بالبطاقة (صفحة واحدة) → 3D Secure من البنك → إعداد المنشأة → PIN → النظام.

---

# التحديث الثاني: الأسعار + الدخول + البيجر + SEO

## قاعدة البيانات (بعد 017)
- `019_new_pricing.sql` — الأسعار الجديدة 29 / 59 / 119 ريال (والمشتركون الحاليون ينتقلون للسعر الأرخص تلقائياً).
- `020_electronic_pager.sql` — البيجر الإلكتروني.

## Supabase → Authentication → URL Configuration
أضف في Redirect URLs:
- `https://felsy.org/auth/reset` (استعادة كلمة المرور)
- `https://felsy.org/dashboard` و `https://felsy.org/dashboard?plan=*`

## الظهور في جوجل (مهم جداً — بدونه ما راح يظهر الموقع)
1. ادخل https://search.google.com/search-console وأضف `felsy.org` كـ Domain property (التحقق عبر سجل DNS)،
   أو كـ URL prefix وحط كود التحقق في متغير البيئة `VITE_GOOGLE_SITE_VERIFICATION` في Vercel.
2. من Sitemaps أرسل: `https://felsy.org/sitemap.xml`
3. من URL Inspection اطلب فهرسة: الصفحة الرئيسية، /pricing، /electronic-pager، /accounting-software.
4. نفس الشي في Bing Webmaster Tools (https://www.bing.com/webmasters) — وهو مصدر ChatGPT وCopilot. متغير التحقق: `BING_SITE_VERIFICATION`.
5. أنشئ Google Business Profile باسم "فلسي Felsy" بنفس الرقم والعنوان.

## البناء
أمر البناء صار يولّد HTML ثابت لكل صفحة تسويق + sitemap تلقائياً:
`npm run build` (Vercel يستخدمه تلقائياً).
