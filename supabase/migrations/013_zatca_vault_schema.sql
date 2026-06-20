-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 013: ZATCA Zero-Knowledge Vault Schema
-- دمج بنية Vault مع جداول ZATCA الموجودة
--
-- هذا الملف يُضيف دعم Supabase Vault للمفاتيح الخاصة
-- بدون كسر الإعداد القائم على branch_id
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. تفعيل Extensions المطلوبة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "vault";    -- Supabase Vault (يتطلب pgsodium)
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- للتشفير الإضافي

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. إضافة أعمدة Vault إلى جدول zatca_config الموجود
--    (التوافق مع branch_id الموجود + دعم profile_id الجديد للـ SaaS)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zatca_config
  ADD COLUMN IF NOT EXISTS vault_secret_id TEXT,          -- مرجع Supabase Vault
  ADD COLUMN IF NOT EXISTS public_key_fingerprint TEXT,  -- بصمة المفتاح العام فقط
  ADD COLUMN IF NOT EXISTS csid_encrypted BYTEA,         -- CSID مشفّر (pgsodium)
  ADD COLUMN IF NOT EXISTS csid_nonce     BYTEA,
  ADD COLUMN IF NOT EXISTS pcsid_encrypted BYTEA,        -- PCSID مشفّر
  ADD COLUMN IF NOT EXISTS pcsid_nonce     BYTEA;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. جدول zatca_private_keys — Fallback مشفَّر عند عدم توفر Vault RPC
--    يعمل مع branch_id (نظام الفروع الحالي)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zatca_private_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,

  -- المفتاح مُشفَّر بـ AES-256-GCM (التشفير يتم في Edge Function)
  encrypted_key  TEXT NOT NULL,    -- base64(AES-GCM(privateKeyPem))

  -- بصمة المفتاح العام فقط للتحقق
  public_key_fingerprint TEXT,

  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),

  UNIQUE (branch_id)
);

-- RLS: ممنوع الوصول المباشر من Frontend — فقط Service Role
ALTER TABLE public.zatca_private_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to private keys" ON public.zatca_private_keys;
CREATE POLICY "No direct access to private keys"
  ON public.zatca_private_keys
  FOR ALL
  USING (false);  -- ← يمنع أي وصول مباشر من الـ Frontend

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vault RPC Functions — واجهة آمنة للتعامل مع Supabase Vault
--    تُستدعى من Edge Functions فقط (Service Role)
-- ─────────────────────────────────────────────────────────────────────────────

-- إنشاء سِّر جديد في الـ Vault
CREATE OR REPLACE FUNCTION vault_create_secret(
  p_secret      TEXT,
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret_id TEXT;
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: only service_role can manage vault secrets';
  END IF;

  INSERT INTO vault.secrets (secret, name, description)
  VALUES (p_secret, p_name, p_description)
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret
  RETURNING id::TEXT INTO v_secret_id;

  RETURN v_secret_id;
END;
$$;

-- قراءة سِّر من الـ Vault
CREATE OR REPLACE FUNCTION vault_read_secret(
  p_name TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: only service_role can read vault secrets';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Secret not found: %', p_name;
  END IF;

  RETURN v_secret;
END;
$$;

-- حذف سِّر من الـ Vault
CREATE OR REPLACE FUNCTION vault_delete_secret(
  p_name TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM vault.secrets WHERE name = p_name;
  RETURN FOUND;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. تحديث دالة عداد الفواتير لدعم secp256k1 counter
-- ─────────────────────────────────────────────────────────────────────────────
-- الدالة الموجودة zatca_next_invoice_counter تبقى كما هي (branch_id)
-- نُضيف فهرساً إضافياً فقط
CREATE INDEX IF NOT EXISTS idx_zatca_pk_branch ON public.zatca_private_keys(branch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigger: تحديث updated_at للجدول الجديد
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_zatca_private_keys_updated_at
  BEFORE UPDATE ON public.zatca_private_keys
  FOR EACH ROW EXECUTE FUNCTION update_zatca_config_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grant Permissions
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION vault_create_secret TO service_role;
GRANT EXECUTE ON FUNCTION vault_read_secret   TO service_role;
GRANT EXECUTE ON FUNCTION vault_delete_secret TO service_role;

COMMENT ON TABLE public.zatca_private_keys IS
  'Fallback مشفَّر للمفاتيح الخاصة. لا يُسمح بالوصول المباشر (RLS = false).';

COMMENT ON COLUMN public.zatca_config.vault_secret_id IS
  'معرِّف السِّر في Supabase Vault. لا يحتوي على أي جزء من المفتاح الخاص.';
