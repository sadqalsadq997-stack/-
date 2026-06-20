# 🔌 دليل تكامل الكشك والبيجر — Felsy v8

## الملفات المُضافة

| الملف | الوصف |
|-------|-------|
| `supabase/migrations/010_kiosk_pager_integration.sql` | الجداول والأعمدة الجديدة |
| `src/pages/KioskIntegration.jsx` | صفحة الإعدادات الكاملة (API + بيجر + منتجات) |
| `src/lib/kioskOrderFlow.js` | منطق التدفق الآلي للطلبات |
| `src/pages/KitchenDisplay.jsx` | شاشة المطبخ المحدّثة مع دعم البيجر |

---

## البنية المعمارية

```
[كشك الطلبات]
      │
      │  POST /functions/kiosk-webhook
      │  Header: x-api-key: <مفتاح العميل>
      ▼
[Supabase Edge Function: kiosk-webhook]
      │
      │  INSERT into orders (status='pending', source='kiosk')
      ▼
[Supabase Realtime Channel: 'kitchen']
      │
      ├──► [KitchenDisplay.jsx]  ← يظهر الطلب فوراً على الشاشة
      │
      │  عند الضغط على "جاهز"
      │  UPDATE orders SET status='ready'
      ▼
[KioskOrderFlow.startListening()]
      │
      │  يكتشف: source='kiosk' AND status='ready'
      ├──► ringPager(table_number)   → إرسال بايت عبر USB Serial
      └──► INSERT pager_events       → تسجيل في قاعدة البيانات
```

---

## خطوات التفعيل

### 1. تشغيل Migration
```bash
supabase db push
# أو من لوحة Supabase → SQL Editor → الصق محتوى الملف
```

### 2. إضافة الصفحة للـ Router
```jsx
// في src/App.jsx أضف:
import KioskIntegration from '@/pages/KioskIntegration';

<Route path="/kiosk-integration" element={<KioskIntegration />} />
```

### 3. إضافة رابط في القائمة الجانبية
```jsx
// في src/components/layout/Sidebar.jsx أضف ضمن ROUTES:
{ path: '/kiosk-integration', label: 'الكشك والبيجر', icon: Plug }
```

### 4. متغيرات البيئة
```env
# .env.local
VITE_KIOSK_API_BASE=https://api.yourkiosk.com
```

### 5. Edge Function الـ Webhook (اختياري)
```bash
supabase functions new kiosk-webhook
# الصق محتوى WEBHOOK_HANDLER_CODE من kioskOrderFlow.js
supabase functions deploy kiosk-webhook
```

---

## تدفق العميل (Plug & Play)

```
العميل يفتح صفحة "الكشك والبيجر"
         │
         ▼
  [1] يُدخل مفتاح API → يضغط "اتصال وحفظ"
         │ النظام يختبر الاتصال فوراً
         │ ✅ الكشك متصل
         ▼
  [2] يوصّل البيجر USB → يضغط "فحص تلقائي"
         │ المتصفح يطلب إذن المنفذ (مرة واحدة فقط)
         │ ✅ تم اكتشاف البيجر
         ▼
  [3] تظهر قائمة المنتجات
         │ يرفع الصور ويعدّل الأسعار
         │ ✅ الكشك يُحدَّث لحظياً
         ▼
  [4] النظام يعمل تلقائياً:
      كشك → طلب → مطبخ → "جاهز" → 🔔 بيجر
```

---

## ملاحظات تقنية

### Web Serial API
- يعمل على Chrome وEdge 89+
- يتطلب إذن المستخدم مرة واحدة فقط
- في بيئة Electron/Tauri: استبدل بـ `serialport` npm package

### بروتوكول البيجر
البروتوكول الافتراضي: `[0xFF, رقم_البيجر, 0x00]`
عدّله في `kioskOrderFlow.js` دالة `defaultRingPager` حسب مواصفات جهازك.

### التحديث اللحظي للكشك
يعمل على مستويين:
1. **PATCH مباشر** عبر API الكشك (أسرع)
2. **Supabase Realtime** كـ fallback تلقائي (إن دعمه الكشك)
