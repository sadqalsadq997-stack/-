# دليل الفوترة الدورية (الاشتراكات بخصم تلقائي) — فلسي

هذا الدليل يكمّل `GOOGLE_WALLET_SETUP.md` ويشرح نظام **الخصم التلقائي الشهري
الحقيقي** عبر Moyasar، مع دعم عروض ترويجية زمنية (مثل: أول شهرين بـ3 ريال،
ثم السعر الكامل تلقائياً) وتغيّر الأسعار دون التأثير على المشتركين الحاليين.

---

## ✅ ما تم بناؤه (جاهز بالكامل)

| الملف | الوظيفة |
|---|---|
| `supabase/migrations/016_recurring_billing.sql` | خطط تسعير بنسخ تاريخية، عروض ترويجية، اشتراكات، فواتير |
| `supabase/functions/billing-subscribe/` | يربط بطاقة العميل (token) ويفعّل أول دفعة |
| `supabase/functions/billing-run-cycle/` | **محرك الفوترة اليومي** — يسحب الفلوس تلقائياً عند الاستحقاق |
| `supabase/functions/moyasar-webhook/` | يستقبل تأكيدات الدفع من موياسر |
| `src/pages/BillingSubscribe.jsx` | نموذج الاشتراك (إدخال بطاقة + تفعيل) |
| تبويب "الفوترة الدورية" داخل `SuperAdmin.jsx` | إدارة الأسعار والعروض ومتابعة كل الاشتراكات |

**لم يُحذف أو يُعدَّل** نظام `PaymentGate.jsx` / `payment_codes` القديم (التحويل
اليدوي + رمز الدفع) — يبقى يعمل بالتوازي. الانتقال الكامل له قرار تجاري يخصك،
ليس تقنياً مفروضاً عليك.

---

## 🔑 كيف يحل هذا مشكلة "تغيّر السعر بمرور الوقت"

كل تغيير سعر يُنشئ **نسخة جديدة** بجدول `billing_plans` (نفس `plan_code`،
رقم `version` أعلى)، والنسخة القديمة تُعطَّل (`is_active = false`) بدون حذفها.
أي اشتراك قائم مرتبط بـ `billing_plan_id` **ثابت** (مش بالكود `plan_code` فقط)،
فلا يتأثر أبداً بتغيير سعر لاحق. المشترك الجديد فقط يرى ويُحاسَب بالنسخة
النشطة الحالية.

## 🎁 كيف يعمل عرض "أول شهرين بـ3 ريال"

1. تُنشئ عرضاً بتبويب "الفوترة الدورية" → "العروض الترويجية": السعر `3`،
   عدد الفترات `2`، الوحدة `شهر`.
2. عند تسجيل عميل جديد عبر `BillingSubscribe.jsx`، يُسحب أول مبلغ (3 ريال)
   فوراً، ويُحفظ `trial_periods_remaining = 1` (تبقّت فترة واحدة بعد هذي).
3. بعد شهر، `billing-run-cycle` يسحب الفترة الثانية أيضاً بـ3 ريال،
   وينقّص العداد إلى صفر.
4. بعد شهرين، `billing-run-cycle` يسحب تلقائياً **السعر الكامل** للخطة —
   بدون أي تدخل بشري، تماماً كما طلبت.

---

## 🔲 الخطوات المتبقية عليك (بالترتيب)

### الخطوة 1 — تشغيل Migration 016
نفّذ `016_recurring_billing.sql` في SQL Editor (بعد 014 و 015).

### الخطوة 2 — مفتاح Moyasar العام (تم استلامه) ✅
أضيف بالفعل بـ `.env.example`:
```
VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_jqWYhUwgKEH3o4tGxHyS8GLWKRvBQLC4j5k9Y3Pv
```
⚠️ **هذا مفتاح `live` (إنتاج حقيقي)** — أي اختبار به سيسحب فلوساً حقيقية فعلاً.
أنصحك بشدة أن تبدأ الاختبار بمفتاح **test** (`pk_test_...` و `sk_test_...`)
من لوحة Moyasar (تبويب Test/Sandbox)، وتحوّل لمفتاح `live` فقط بعد التأكد
أن كل تدفق العمل يعمل بشكل صحيح بدون أي خطأ.

### الخطوة 3 — المفتاح السري (لم يُستلم بعد)
أضف بـ Supabase Secrets:
```
MOYASAR_SECRET_KEY=sk_live_... (أو sk_test_... للتجربة)
```
هذا المفتاح يُستخدم **فقط** بالخلفية (Edge Functions)، أبداً بالواجهة الأمامية.

### الخطوة 4 — نشر Edge Functions الثلاثة
```bash
supabase functions deploy billing-subscribe
supabase functions deploy billing-run-cycle
supabase functions deploy moyasar-webhook
```

### الخطوة 5 — جدولة محرك الفوترة اليومي (مهم جداً، بدون هذا لا يوجد خصم تلقائي فعلي)
نفّذ بـ SQL Editor (التعليمات الكاملة موجودة أيضاً بنهاية ملف
`billing-run-cycle/index.ts`):
```sql
create extension if not exists pg_cron;

select cron.schedule(
  'daily-billing-cycle',
  '0 3 * * *',  -- كل يوم الساعة 3 فجراً
  $cron$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/billing-run-cycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_BILLING_CRON_SECRET'
    )
  );
  $cron$
);
```
وأضف بـ Supabase Secrets نفس القيمة: `BILLING_CRON_SECRET=YOUR_BILLING_CRON_SECRET`

### الخطوة 6 — ضبط Webhook بلوحة Moyasar
من لوحة Moyasar → Webhooks، أضف:
```
https://YOUR_PROJECT.supabase.co/functions/v1/moyasar-webhook
```
وأضف بـ Supabase Secrets: `MOYASAR_WEBHOOK_SECRET=` (قيمة سرية تختارها، نفس
القيمة تُضبط بلوحة Moyasar إن دعمت سراً مشتركاً، وإلا يمكن تجاوز هذي الخطوة
مؤقتاً والاعتماد على محرك الفوترة اليومي وحده كمصدر التأكيد الأساسي).

### الخطوة 7 — إنشاء أول عرض ترويجي
من `SuperAdmin.jsx` → تبويب "الفوترة الدورية" → "العروض الترويجية" → "عرض
جديد": اسم العرض، الخطة `pro` (أو حسب رمز خطتك)، السعر `3`، عدد الفترات `2`،
الوحدة `شهر`. اتركه بلا كود (يُطبَّق تلقائياً على كل مشترك جديد بهذي الخطة)،
أو حدد كوداً (يحتاج العميل إدخاله).

### الخطوة 8 — تجربة كاملة بمفتاح Test أولاً
افتح `/billing-subscribe?plan=pro` (بعد تسجيل دخولك وربط حسابك بمنشأة، انظر
الخطوة 5 بدليل Google Wallet) واستخدم [بطاقات الاختبار الرسمية من موياسر](https://docs.moyasar.com)
للتأكد من نجاح كل تدفق العمل قبل التحويل لمفتاح `live`.

---

## ⚠️ تذكير مهم جداً قبل التشغيل الفعلي
- **لا تُفعّل محرك الفوترة اليومي (`pg_cron`) بمفتاح `live` قبل اختبار كامل**
  بمفتاح `test` — لأن أي خطأ بالمنطق سيعني خصم فلوس حقيقية بشكل خاطئ من
  عملاء حقيقيين.
- راقب لوحة Moyasar (Dashboard → Payments) بانتظام خلال أول أسبوعين من
  التشغيل الفعلي للتأكد من تطابق كل عملية سحب مع ما يتوقعه النظام.
- المحرك الحالي يحاول السحب 3 مرات (بفواصل أيام، حسب جدولة الـ Cron) قبل
  تعليق الاشتراك (`suspended`) — تأكد أن هذا يناسب سياستك التجارية، ويمكن
  تعديل `MAX_FAILED_ATTEMPTS` بملف `billing-run-cycle/index.ts` بسهولة.
