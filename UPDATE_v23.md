# تحديث v23 — الاشتراك من الموقع + ميسر + التحويل البنكي + الولاء + الكاشير

> نفّذ خطوات `SECURITY_UPDATE_v21.md` أولاً إذا ما نفذتها، ثم هذي بالترتيب.

## ١) قاعدة البيانات (SQL Editor) — بالترتيب
1. `021_security_fortress.sql` (نسخة محدّثة — أعد تشغيلها)
2. `022_accounting_per_tenant.sql`
3. `023_orders_loyalty_pricing.sql`

## ٢) نشر الدوال
```bash
supabase functions deploy billing-order auth-login owner-admin-api verify-owner-pin --no-verify-jwt
supabase functions deploy moyasar-webhook --no-verify-jwt
supabase functions deploy billing-run-cycle ai-chat zatca-invoice zatca-compliance zatca-onboarding domain-check domain-verify-dns
```

## ٣) ميسر (Moyasar)
- Vercel: `VITE_MOYASAR_PUBLISHABLE_KEY` = المفتاح العام **pk_live_…** (للتجربة pk_test_…). ثم Redeploy.
- Supabase Secrets: `MOYASAR_SECRET_KEY` (sk_live_…) — السيرفر يتأكد من كل دفعة منه.
- لوحة ميسر → Webhooks: الرابط `https://<مشروعك>.supabase.co/functions/v1/moyasar-webhook` + Secret Token = `MOYASAR_WEBHOOK_SECRET`.
- **Apple Pay**: لوحة ميسر → Apple Pay → أضف الدومين `felsy.org`، نزّل ملف التحقق وحطه في
  `public/.well-known/apple-developer-merchantid-domain-association` ثم انشر.
- **STC Pay**: لازم تطلب تفعيله من مدير حسابك في ميسر. إلى أن يتفعل، اضبط في Vercel:
  `VITE_MOYASAR_METHODS=creditcard,applepay` (وبعد التفعيل احذف المتغير).

## ٤) شعارات وسائل الدفع (الفوتر)
ضع الشعارات الرسمية SVG في `public/payments/` بأسماء:
`applepay.svg mada.svg visa.svg mastercard.svg stcpay.svg` — بدونها يظهر الاسم نصاً.

## ٥) الأسعار الافتراضية (عدّلها من لوحة المالك)
| الإعداد | القيمة |
|---|---|
| الأساسي | 29 ر.س · يشمل فرع · الفرع الإضافي 29 |
| الاحترافي | 59 ر.س · يشمل 3 فروع · الفرع الإضافي 59 |
| المؤسسي | 119 ر.س · فروع غير محدودة |
| المدد | شهر 0% · 6 أشهر خصم 10% · 12 شهر خصم 20% |
| الضريبة | 15% تُضاف على الإجمالي (لأن موقعك يقول الأسعار لا تشمل الضريبة) |

الخصومات وسعر الفرع الإضافي: **لوحة المالك → طلبات الاشتراك** و **الفوترة الدورية**.

## ٦) التحويل البنكي
الحساب الظاهر للعميل: البنك الأهلي السعودي — مؤسسة إبره وخيط الإسكافي للتجارة —
IBAN `SA9710000020500000892605` (لتغييره: `src/lib/contact.js`).
الإيصال يرفعه العميل لمخزن خاص (غير عام). تعتمده من **لوحة المالك → طلبات الاشتراك → تأكيد الاستلام وتفعيل**.

## ٧) الطباعة الفورية بدون نافذة المتصفح
شغّل كروم على جهاز الكاشير بخيار: `--kiosk-printing` واجعل الطابعة الحرارية الافتراضية.
