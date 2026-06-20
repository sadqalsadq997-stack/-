-- ============================================================
-- Migration: 010_kiosk_pager_integration.sql
-- الغرض: إضافة جداول وأعمدة لدعم ربط الكشك والبيجر
-- ============================================================

-- 1. إضافة أعمدة إعدادات الكشك على جدول app_settings الموجود
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS kiosk_api_key        TEXT,
  ADD COLUMN IF NOT EXISTS kiosk_webhook_url     TEXT,
  ADD COLUMN IF NOT EXISTS kiosk_connected       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kiosk_last_ping       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pager_port            TEXT,   -- e.g. "COM3" or "/dev/ttyUSB0"
  ADD COLUMN IF NOT EXISTS pager_baud_rate       INTEGER DEFAULT 9600,
  ADD COLUMN IF NOT EXISTS pager_detected        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pager_device_name     TEXT;

-- 2. جدول سجل طلبات الكشك
CREATE TABLE IF NOT EXISTS kiosk_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  kiosk_order_ref TEXT,                          -- رقم مرجعي من الكشك
  source          TEXT DEFAULT 'kiosk',
  raw_payload     JSONB,                          -- الـ payload الكامل من الكشك
  received_at     TIMESTAMPTZ DEFAULT NOW(),
  processed       BOOLEAN DEFAULT FALSE
);

-- 3. جدول سجلات أحداث البيجر
CREATE TABLE IF NOT EXISTS pager_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  pager_number TEXT,                              -- رقم البيجر إن وُجد
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT DEFAULT 'sent',               -- sent | failed | ack
  error_msg   TEXT
);

-- 4. إضافة عمود مصدر الطلب على جدول orders الموجود
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source        TEXT DEFAULT 'pos',  -- pos | kiosk | online
  ADD COLUMN IF NOT EXISTS pager_sent    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pager_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kiosk_ref     TEXT;

-- 5. Enable Realtime على الجداول الحيوية
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE kiosk_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE pager_events;

-- 6. Row Level Security
ALTER TABLE kiosk_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pager_events ENABLE ROW LEVEL SECURITY;

-- سياسة: كل مستخدم مسجّل يرى بياناته فقط (عدّل حسب منطق الـ tenant لديك)
CREATE POLICY "kiosk_orders_owner" ON kiosk_orders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "pager_events_owner" ON pager_events
  FOR ALL USING (auth.role() = 'authenticated');
