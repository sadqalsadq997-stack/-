# تحديث الحماية v21 — خطوات التفعيل (بالترتيب)

> كل خطوة هنا لازم تسويها أنت (ما تنفع من الكود). الترتيب مهم.

## ١) قاعدة البيانات — Supabase → SQL Editor
شغّل الملفين بالترتيب (آمنين للتكرار):
1. `supabase/migrations/021_security_fortress.sql`
2. `supabase/migrations/022_accounting_per_tenant.sql`

بعدها شغّل هذا الفحص — المفروض يرجع صفر صفوف:
```sql
SELECT tablename, policyname, roles FROM pg_policies
WHERE schemaname='public' AND (roles @> '{anon}' OR roles @> '{public}')
  AND tablename NOT IN ('billing_plans','blog_posts','subscription_plans','offers');
```

## ٢) أسرار السيرفر — Supabase → Edge Functions → Secrets
| السر | القيمة |
|---|---|
| `GEMINI_API_KEY` | مفتاح Gemini **جديد** (القديم كان ظاهر في الموقع — ألغه من Google AI Studio) |
| `OWNER_PIN_HASH` | إذا مو مضبوط: sha256 لـ `رمزك:felsy-owner` بصيغة hex |
| الباقي كما هو | `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `BILLING_CRON_SECRET`, `APP_PUBLIC_URL` … |

## ٣) نشر الدوال
```bash
supabase functions deploy auth-login owner-admin-api verify-owner-pin --no-verify-jwt
supabase functions deploy ai-chat zatca-invoice zatca-compliance zatca-onboarding domain-check domain-verify-dns billing-run-cycle billing-subscribe
```

## ٤) Vercel → Settings → Environment Variables
**أضف** (بدون بادئة VITE_ — هذا اللي يخفيها عن المتصفح):
- `SUPABASE_URL` = رابط مشروعك
- `SUPABASE_ANON_KEY` = المفتاح العام (anon / publishable)

**احذف نهائياً**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GEMINI_API_KEY`, `VITE_PAYMENT_SECRET`

خلّ `VITE_MOYASAR_PUBLISHABLE_KEY` (مفتاح عام pk_ مسموح يظهر). ثم **Redeploy**.

## ٥) تدوير المفاتيح (مهم — القديمة كانت مكشوفة في كود الموقع)
- **Gemini**: ألغِ المفتاح القديم من Google AI Studio وحط الجديد في `GEMINI_API_KEY` (خطوة ٢).
- **Supabase**: الرابط والمفتاح العام كانوا ظاهرين في كود الموقع، فأي أحد نسخهم يقدر يكلّم قاعدتك مباشرة بدون المرور على حماية الموقع (مثل حد المحاولات). قاعدة البيانات نفسها صارت مقفلة بعد ملف 021، لكن للإغلاق الكامل:
  1. Supabase → Settings → API Keys → أنشئ مفتاح **publishable** جديد.
  2. حطه في Vercel (`SUPABASE_ANON_KEY`) وفي Supabase Secrets باسم `FELSY_PUBLISHABLE_KEY`، وأعد النشر.
  3. جرّب الدخول من الموقع. إذا اشتغل، عطّل المفاتيح القديمة (Legacy API keys).
  4. إذا وقفت أي دالة بعد التعطيل: أعد تفعيل المفاتيح القديمة وكلمني — بعض دوال Supabase القديمة تعتمد عليها.

## ٦) بعد التفعيل
- **المستخدمين يسجلون دخول مرة وحدة من جديد** (تغيّر مكان حفظ الجلسة).
- **رموز PIN**: انتقلت تلقائياً لخزنة مشفّرة (bcrypt). أي رمز قديم كان محفوظ كنص عادي انحذف — الموظف المعني يحتاج المدير يعيد إدخال رمزه.
- **الصور الجديدة** تنرفع داخل مجلد المنشأة. الصور القديمة تشتغل عادي.
- **التحديث اللحظي** (المطبخ، البيجر، الدعم) صار كل 4 ثواني بدل WebSocket — لأن الـ WebSocket يكشف رابط Supabase.

## اختياري لكن أنصح فيه
**Supabase Custom Domain** (مثل `api.felsy.org`) — إضافة مدفوعة من Supabase. بدونها: شاشة "الدخول بحساب جوجل" تعرض اسم مشروع Supabase للمستخدم لحظة الموافقة.

---

## وش تغيّر (ملخص تقني)
| الثغرة | الحل |
|---|---|
| الزائر يقدر يقرأ مفاتيح ZATCA الخاصة (`vault_read_secret` مفتوحة للكل) | كل دوال القاعدة مقفلة عن الزائر إلا 7 دوال عامة محددة |
| الزائر يقرأ `zatca_config` / `zatca_invoices` وكل منتجات وفروع كل المنشآت | لا صلاحية مباشرة لأي جدول — المنيو العام عبر `public_menu` (فرع واحد، بدون التكلفة) |
| أي مستخدم مسجّل يغيّر أسعار الباقات والعروض والمدونة | الكتابة عبر `owner-admin-api` فقط بجلسة المالك |
| جداول بدون عزل (kiosk_orders, pager_events, zatca_*, invoices …) | `tenant_id` لكل جدول + حارس RLS تلقائي على كل جدول |
| الطلب من المنيو العام يقبل أي سعر يرسله المتصفح | `public_place_order` يحسب السعر من القاعدة + حد 5 طلبات/10 دقائق لكل IP |
| بطاقة الولاء العامة تكشف جوال وبريد العميل | ترجع الاسم الأول والطوابع فقط |
| سر توقيع رموز الدفع ومفتاح Gemini في كود الموقع | انحذفت الصفحة القديمة، والذكاء الاصطناعي عبر `ai-chat` في السيرفر |
| رابط ومفتاح Supabase ظاهرين في المتصفح | وكيل `/api/db` في Vercel يضيفهم في السيرفر |
| رموز PIN بملح ثابت ويقرأها المتصفح | خزنة `secure_pins` بـ bcrypt — المتصفح يشوف كلمة `set` فقط |
| توكن بطاقة العميل (Moyasar) نص عادي | مشفّر AES-256 بمفتاح في Supabase Vault |
| محاولات دخول غير محدودة | 10 محاولات خاطئة لكل جهاز ثم قفل 30 دقيقة (+ 20 للحساب، 50 للـ IP) — للدخول بكلمة المرور، PIN، ولوحة المالك |
| دوال ZATCA والدومين تشتغل لأي أحد على أي فرع | لازم مستخدم مسجّل والفرع من منشأته |
| `owner-admin-api` مفقودة (لوحة المالك ما تشتغل) | انكتبت كاملة |
| رفع ملفات SVG/HTML ممكن يحمل سكربت | صور فقط + الملفات تُعرض بوضع sandbox |
| بدون Content-Security-Policy ولا HSTS | أُضيفت كل رؤوس الحماية في `vercel.json` |
