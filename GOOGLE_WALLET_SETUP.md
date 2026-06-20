# دليل تفعيل Google Wallet — فلسي

هذا الدليل يشرح **بالضبط** كل خطوة عملية متبقية عليك حتى تشتغل ميزة Google Wallet
بشكل حقيقي وكامل. كل الكود جاهز ومبني، الباقي فقط إعدادات وحسابات.

---

## ✅ ما تم بناؤه (جاهز بالكامل، لا حاجة لأي تعديل)

| الملف | الوظيفة |
|---|---|
| `supabase/migrations/014_multi_tenant_foundation.sql` | يحوّل النظام لدعم آلاف المنشآت بأمان (tenant_id + RLS) |
| `supabase/migrations/015_google_wallet.sql` | جداول تصميم البطاقة، البطاقات المُصدرة، عنوان الفروع |
| `supabase/functions/google-wallet-issue/` | يصدر بطاقة Google Wallet حقيقية لعميل معيّن |
| `supabase/functions/google-wallet-update/` | يحدّث رصيد البطاقة المحفوظة عند العميل تلقائياً |
| `supabase/functions/send-wallet-sms/` | يرسل رابط البطاقة للعميل عبر SMS |
| `src/pages/LoyaltyCardDesigner.jsx` | شاشة تصميم البطاقة (شعار، ألوان، نوع البرنامج) |
| `src/pages/LoyaltyQR.jsx` | الصفحة التي يفتحها العميل بعد مسح QR — مسار `/wallet/:token` |
| `src/pages/BranchAddressSettings.jsx` | شاشة عنوان كل فرع لرسائل SMS |
| تعديلات بسيطة على `Customers.jsx` و `App.jsx` | زر إصدار البطاقة، بحث برقم الجوال، الـ routes الجديدة |

**لم يُحذف ولم يُعدَّل أي سطر من الكود القديم العامل حالياً.**

---

## 🔲 الخطوات المتبقية عليك (بالترتيب)

### الخطوة 1 — تشغيل الـ Migrations الجديدة على قاعدة بياناتك
في لوحة Supabase → SQL Editor، نفّذ الملفين بالترتيب:
1. `014_multi_tenant_foundation.sql`
2. `015_google_wallet.sql`

> ⚠️ هذا الملف الأول (014) يضيف عمود `tenant_id` لجميع جداولك، وينسب كل بياناتك
> الحالية تلقائياً لمنشأة افتراضية واحدة — **لن يحدث أي فقدان بيانات**. السياسات
> القديمة للأمان (USING true) تبقى فعّالة بالتوازي، فلن ينكسر شيء فوراً.

### الخطوة 2 — الحصول على بيانات Google Wallet الحقيقية (Service Account)
ملف JSON الذي أرسلته لي (`client_secret_...json`) هو ملف **تسجيل دخول OAuth**،
وليس مخصصاً لإصدار بطاقات Wallet. تحتاج ملفاً مختلفاً تماماً:

1. اذهب إلى [Google Pay & Wallet Console](https://pay.google.com/business/console)
2. تأكد أن **Merchant ID: BCR2DN5TR6BIXTIE** مفعّل تحت "Google Wallet API"
3. من تبويب **Service Accounts**: أنشئ Service Account جديد إذا لم يوجد، وحمّل
   ملف JSON الخاص به (يحتوي على `private_key` و `client_email`)
4. تأكد أن هذا الـ Service Account له صلاحية **Wallet Object Issuer** على حساب Merchant
5. لاحظ **Issuer ID** (رقم يظهر في إعدادات الحساب، غير Merchant ID)

### الخطوة 3 — ضبط الأسرار (Secrets) في Supabase
في لوحة Supabase → Edge Functions → Secrets، أضف:

| المتغير | القيمة |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | الرقم من الخطوة 2 (Issuer ID) |
| `GOOGLE_WALLET_SERVICE_ACCOUNT` | محتوى ملف Service Account **كاملاً** كنص JSON واحد |
| `APP_PUBLIC_URL` | `https://felsy.org` (أو رابط نطاقك) |

> ⚠️ **لا تضع هذه القيم في أي ملف `.env` يُرفع للواجهة الأمامية (React).** هذه
> أسرار سيرفر بحتة — وضعها هنا فقط بـ Supabase Secrets يحميها بالكامل.

### الخطوة 4 — نشر Edge Functions الثلاثة
```bash
supabase functions deploy google-wallet-issue
supabase functions deploy google-wallet-update
supabase functions deploy send-wallet-sms
```

### الخطوة 5 — ربط حسابك (Owner) بمنشأتك في جدول tenant_users
بعد تشغيل migration 014، يوجد منشأة افتراضية واحدة بهذا المعرّف:
`00000000-0000-0000-0000-000000000001`

نفّذ بـ SQL Editor (بدّل `YOUR_AUTH_USER_ID` بمعرّف حسابك من جدول `auth.users`):
```sql
INSERT INTO public.tenant_users (tenant_id, auth_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'YOUR_AUTH_USER_ID', 'owner');
```
بدون هذي الخطوة، شاشة "تصميم بطاقة الولاء" و زر "إصدار Google Wallet" لن يعملا
(لأنهما يحتاجان معرفة tenant_id الخاص بك).

### الخطوة 6 — تصميم بطاقتك
من القائمة الجانبية، افتح شاشة **"تصميم بطاقة الولاء"** (مسار `/loyalty-card-design`):
ارفع الشعار، اختر الألوان، حدد نوع البرنامج (طوابع أو نقاط)، واحفظ.

### الخطوة 7 — إصدار أول بطاقة تجريبية
من شاشة **العملاء**، اضغط أيقونة 💳 (Google Wallet) بجانب أي عميل. سيتم:
- إنشاء "Loyalty Class" لمنشأتك في جوجل (مرة واحدة فقط)
- إنشاء "Loyalty Object" خاص بهذا العميل
- نسخ رابط صفحة QR الخاصة به (`/wallet/xxxxx`)

افتح هذا الرابط من جوال أندرويد → سيظهر زر "أضف إلى Google Wallet" → اضغطه
وستُحفظ البطاقة فعلياً في محفظة جوجل.

### الخطوة 8 — (اختياري) ربط مزوّد SMS
إذا تبي إرسال رابط البطاقة آلياً عبر SMS، أضف بـ Supabase Secrets:
`SMS_PROVIDER_URL` و `SMS_PROVIDER_API_KEY` (حسب المزوّد اللي تختاره مثل
Taqnyat أو Unifonic). بدون هذي الخطوة، الدالة `send-wallet-sms` ترجع الرابط
بنفسها بدون فشل، فتقدر تستخدمه يدوياً أو بواتساب مؤقتاً.

---

## ⚠️ تذكير أمان مهم
ملف `client_secret_...json` الذي رفعته ظهر بهذه المحادثة، فيُعتبر مكشوفاً.
أنصحك تروح إلى Google Cloud Console → Credentials → تختار هذا OAuth Client →
**Reset Secret**، حتى لو لم تستخدمه هنا مباشرة.

---

## 🔜 الخطوة التالية المنطقية (لم تُبنَ بعد، بانتظار قرارك)
- **القفل النهائي للـ RLS القديم**: حذف سياسات `USING (true)` القديمة بعد
  تأكدك من ربط كل المستخدمين الحاليين بـ `tenant_users` (لتفادي قطع الوصول
  عن أي مستخدم لم يُربط بعد).
- **Apple Wallet**: يحتاج حساب Apple Developer ($99/سنة) وشهادات Pass Type ID.
- **شاشة Super Admin لإدارة المنشآت** (تعليق/تفعيل منشأة، عرض كل الـ 3000-15000
  منشأة من مكان واحد) — بنية `tenants` جاهزة لذلك، تحتاج فقط واجهة.
