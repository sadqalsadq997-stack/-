# 🏪 فلسي POS v6 — دليل الإعداد الشامل

## ✅ المميزات الجديدة في v6

### 1. 🔒 بوابة الدفع
- يُمنع الوصول للنظام حتى يتم الدفع
- رمز الدفع يُولّد من لوحة المدير مع توقيع HMAC-SHA256
- التحقق التلقائي من صحة الرمز
- دعم خطط: مبتدئ، احترافي، مؤسسي

### 2. 💬 الدعم الفني بالشات
- شات مباشر مع ذكاء اصطناعي (Gemini)
- تذاكر دعم مرتبطة بـ Supabase Realtime
- لوحة تحكم للمدير لعرض كل التذاكر والرد عليها
- معلومات تواصل + ساعات العمل + حالة النظام

### 3. 🌐 إدارة الدومين
- شراء دومين من Namecheap مباشرة
- ربط DNS تلقائياً بعد الشراء
- ربط دومين خارجي موجود
- التحقق من DNS عبر Google DNS

### 4. 📊 إدارة الاشتراكات
- تمديد اشتراكات العملاء من الداشبورد
- توليد رموز دفع موقّعة
- إضافة عروض تظهر في الصفحة الرئيسية

### 5. 🎨 انيميشنات احترافية
- دخول الصفحات بتأثيرات سلسة
- hover effects على البطاقات
- انيميشن رسائل الشات
- تأثيرات الضغط والتموج

---

## 🚀 خطوات الإعداد

### الخطوة 1 — تثبيت المتطلبات
```bash
cd felsy-v6
npm install
```

### الخطوة 2 — إعداد Supabase
1. اذهب لـ [supabase.com](https://supabase.com) وأنشئ مشروع
2. من **SQL Editor**، شغّل الملفات بالترتيب:
   ```
   supabase/migrations/007_new_features.sql
   ```
3. انسخ مفاتيح API من **Settings → API**

### الخطوة 3 — تعديل `.env`
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_GEMINI_API_KEY=AIzaSy...           # اختياري
VITE_PAYMENT_SECRET=your-secret-key     # غيّره!
VITE_APP_HOST=app.yoursite.com
```

### الخطوة 4 — نشر Edge Functions
```bash
supabase functions deploy domain-check
supabase functions deploy domain-purchase
supabase functions deploy domain-setup-dns
supabase functions deploy domain-verify-dns
```

ثم أضف الأسرار في **Supabase Dashboard → Edge Functions → Secrets**:
```
NAMECHEAP_API_USER=your_username
NAMECHEAP_API_KEY=your_api_key
NAMECHEAP_CLIENT_IP=your_server_ip
APP_SERVER_IP=your_server_ip
REGISTRANT_EMAIL=...
```

### الخطوة 5 — تشغيل المشروع
```bash
npm run dev
```

---

## 🔐 نظام الأمان

### بوابة الدفع
```
عميل جديد → PaymentGate → لا يفتح إلا بعد رمز دفع صحيح
رمز الدفع ← يولّده المدير ← موقّع بـ HMAC-SHA256 ← يُرسل للعميل
العميل يدخل الرمز ← يتحقق من التوقيع ← يفعّل الاشتراك
```

### تسلسل الحماية
```
URL → RequireAuth → AppPINGate → PaymentGate → الصفحة
```

- `/menu` و `/kitchen-display` عامة بدون حماية
- باقي الصفحات تحتاج PIN + اشتراك فعّال
- صلاحيات حسب الدور: admin, branch_manager, cashier, waiter, kitchen

---

## 📡 Edge Functions

| الدالة | الوصف |
|--------|-------|
| `domain-check` | التحقق من توفر الدومين عبر Namecheap |
| `domain-purchase` | شراء دومين تلقائياً |
| `domain-setup-dns` | إعداد DNS بعد الشراء |
| `domain-verify-dns` | التحقق من تطبيق إعدادات DNS |

---

## 🗄️ جداول قاعدة البيانات الجديدة

| الجدول | الوصف |
|--------|-------|
| `subscriptions` | اشتراكات العملاء |
| `payment_codes` | رموز الدفع الموقّعة |
| `support_tickets` | تذاكر الدعم الفني |
| `support_messages` | رسائل الشات |
| `domains` | الدوماينات المسجّلة |
| `offers` | عروض تظهر في الصفحة الرئيسية |

---

## 🌐 Namecheap API

1. اشترك في [namecheap.com](https://www.namecheap.com)
2. **Account → Profile → API Access → Enable API**
3. أضف IP الخادم في القائمة البيضاء
4. انسخ API Key وأضفه في Supabase Secrets

---

## 📱 هيكل المشروع

```
src/
├── pages/
│   ├── auth/           ← صفحات تسجيل الدخول
│   ├── Dashboard.jsx   ← الرئيسية
│   ├── POSTerminal.jsx ← نقطة البيع
│   ├── PaymentGate.jsx ← 🆕 بوابة الدفع
│   ├── Support.jsx     ← 🆕 الدعم الفني
│   ├── AdminSupport.jsx← 🆕 إدارة التذاكر
│   ├── DomainManagement.jsx ← 🆕 الدومين
│   └── SubscriptionManagement.jsx ← 🆕 الاشتراكات
├── lib/
│   ├── AuthContext.jsx
│   ├── permissions.js
│   ├── i18n.jsx
│   └── query-client.js
├── integrations/supabase/
│   ├── client.ts
│   └── types.ts
└── components/
    ├── layout/
    │   ├── AppLayout.jsx
    │   └── Sidebar.jsx   ← محدّث بعناصر جديدة
    └── AppPINGate.jsx    ← حماية بـ PIN
supabase/
├── migrations/
│   └── 007_new_features.sql ← 🆕
└── functions/
    ├── domain-check/
    ├── domain-purchase/
    ├── domain-setup-dns/
    └── domain-verify-dns/
```
