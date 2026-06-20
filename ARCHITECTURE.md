# Felsy SaaS Platform — Enterprise Architecture

## نظرة عامة

منصة SaaS متكاملة للمطاعم والمتاجر (ERP + POS + محاسبة + ZATCA)
مبنية على: React + TypeScript + Supabase + Vite

---

## طبقات النظام (7 Layers)

```
┌─────────────────────────────────────────────────┐
│  Layer 1: UI (React Components + Tailwind)       │
├─────────────────────────────────────────────────┤
│  Layer 2: RBAC (src/lib/rbac/)                  │
│  • hasPermission(role, resource, action)         │
│  • canAccessRoute(role, path)                    │
│  • 10 roles × 20 resources × 6 actions           │
├─────────────────────────────────────────────────┤
│  Layer 3: Business Logic (src/lib/business/)    │
│  • processCheckout() — Fixed-Point Arithmetic    │
│  • validateBundle() — Inventory Check            │
│  • processRefund() — Auto Credit Note            │
│  • createAccountingEntry() — Auto Journal        │
├─────────────────────────────────────────────────┤
│  Layer 4: Accounting Engine (src/lib/accounting/)│
│  • Chart of Accounts (20 default accounts)       │
│  • Trial Balance + Income Statement              │
│  • Aging Reports (30/60/90/120 days)             │
│  • Vouchers (Receipt/Payment/Journal)            │
├─────────────────────────────────────────────────┤
│  Layer 5: Integration Layer (src/lib/integrations/)│
│  • Plugin Registry (13 future partners)          │
│  • Event Bus (on/emit)                           │
│  • Webhook Manager (HMAC-signed)                 │
├─────────────────────────────────────────────────┤
│  Layer 6: Security (src/lib/security/)          │
│  • AES-256 Encrypted Session                     │
│  • PBKDF2 PIN Hashing (100k iterations)          │
│  • Anti-Tamper + CSP                             │
│  • 5-wall Brute-Force Protection                 │
├─────────────────────────────────────────────────┤
│  Layer 7: Audit Log (src/lib/audit/)            │
│  • Every action logged: User+Branch+IP+Device    │
│  • Non-blocking async writes                     │
└─────────────────────────────────────────────────┘
```

---

## إضافة تكامل جديد (مثال: سلة)

```typescript
// src/lib/integrations/plugins/salla.ts
import { registerPlugin } from '@/lib/integrations';

registerPlugin({
  id: 'salla',
  name: 'Salla',
  name_ar: 'سلة',
  category: 'ecommerce',
  version: '1.0',
  status: 'connected',

  async onSaleComplete({ invoiceId, items }) {
    // مزامنة الطلب مع سلة
    await sallaAPI.createOrder({ invoiceId, items });
  },

  async onProductUpdate({ productId, action }) {
    // تحديث المنتج في سلة
    await sallaAPI.syncProduct(productId);
  },
});
```

**لا تعديل على أي ملف آخر.**

---

## الأدوار والصلاحيات

| الدور | الوصول |
|---|---|
| super_admin | كل شيء |
| business_owner | منشأته كاملاً |
| accountant | محاسبة + تقارير |
| inventory_manager | مخزون + موردون |
| branch_manager | فرعه + عمليات |
| cashier | POS + طلبات + عملاء |
| waiter | طاولات + طلبات |
| kitchen | مطبخ فقط |
| support_agent | دعم فني فقط |

---

## Database Schema (Supabase)

### Core Tables
- `invoices` — الفواتير (B2C, B2B, credit_note, debit_note)
- `journal_entries` — القيود المحاسبية التلقائية
- `chart_of_accounts` — دليل الحسابات (20 حساب افتراضي)
- `vouchers` — السندات (قبض/صرف/قيد)
- `audit_logs` — سجل المراقبة الكامل
- `warehouses` — المستودعات متعددة
- `inventory_items` — المخزون per warehouse
- `inventory_movements` — حركات المخزون
- `webhooks` — ربط خارجي
- `integration_connections` — حالة التكاملات
- `cost_centers` — مراكز التكلفة
- `customer_balances` — ذمم مدينة
- `supplier_balances` — ذمم دائنة
- `blog_posts` — المدونة + SEO
- `subscription_plans` — خطط الاشتراك
- `owner_notifications` — رسائل المالكين
- `system_settings` — إعدادات النظام

### RPCs
- `deduct_stock(product_id, warehouse_id, quantity, invoice_id)` — خصم مخزون
- `add_stock(product_id, warehouse_id, quantity, invoice_id)` — إضافة مخزون

---

## خطوات تشغيل قاعدة البيانات

```sql
-- الترتيب مهم:
1. supabase/migrations/20240601_new_features.sql
2. supabase/migrations/20240602_enterprise_schema.sql
```

---

## الأمان — 5 جدارات حماية

1. **PBKDF2 PIN** — هاش 100k iteration بدلاً من SHA-256 العادي
2. **AES-256 Session** — الجلسة مشفّرة بالكامل في sessionStorage
3. **RBAC 403** — كل مسار يُتحقق منه server-side
4. **Brute Force Lock** — قفل بعد 5 محاولات × 2 دقيقة
5. **Anti-Tamper + CSP** — منع التلاعب وأدوات المطور في Production

---

## خارطة التطوير المستقبلي

- [ ] سلة Integration
- [ ] زد Integration  
- [ ] Moyasar Payment
- [ ] تمارا / تابي
- [ ] WhatsApp Business Notifications
- [ ] تقارير PDF قابلة للتصدير
- [ ] iOS / Android PWA
- [ ] Multi-language (EN/AR toggle)
- [ ] AI Financial Anomaly Detection
