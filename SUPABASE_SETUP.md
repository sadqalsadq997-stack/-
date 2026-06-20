# 🚀 ربط فلسي بـ Supabase

## الخطوة 1 — إنشاء مشروع Supabase
1. اذهب إلى [supabase.com](https://supabase.com) وسجل دخول
2. اضغط **New Project**
3. اختر اسماً للمشروع وكلمة مرور قاعدة البيانات

## الخطوة 2 — تشغيل الـ Migrations
1. من لوحة Supabase → **SQL Editor**
2. شغّل الملفات بالترتيب:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_hash_pins.sql`
   - `supabase/migrations/003_security_and_roles.sql`
   - `supabase/migrations/004_auth_accounts_zatca.sql`
   - `supabase/migrations/005_car_orders.sql`

## الخطوة 3 — نسخ مفاتيح API
1. من Supabase → **Settings** → **API**
2. انسخ:
   - **Project URL** ← `VITE_SUPABASE_URL`
   - **anon/public key** ← `VITE_SUPABASE_PUBLISHABLE_KEY`

## الخطوة 4 — تعديل ملف `.env`
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJI...
```

## الخطوة 5 — تشغيل المشروع
```bash
npm install
npm run dev
```

## ملاحظات
- **بدون مفاتيح**: النظام يعمل بوضع PIN المحلي فقط (بيانات مؤقتة)
- **مع المفاتيح**: كل البيانات تُحفظ في Supabase وتتزامن بين الأجهزة
