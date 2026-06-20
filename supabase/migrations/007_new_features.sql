-- ══════════════════════════════════════════════════════
-- فلسي v6 — Migration 007: الجداول الجديدة
-- subscriptions, payment_codes, support_tickets,
-- support_messages, domains, offers
-- ══════════════════════════════════════════════════════

-- ─── 1. جدول الاشتراكات ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan         TEXT NOT NULL DEFAULT 'pro',          -- starter | pro | enterprise
  status       TEXT NOT NULL DEFAULT 'pending',      -- pending | active | expired | cancelled
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  payment_code TEXT,
  amount_paid  NUMERIC(10,2),
  branch_id    UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. جدول رموز الدفع ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL DEFAULT 'pro',
  months     INTEGER NOT NULL DEFAULT 1,
  amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  signature  TEXT,                  -- HMAC-SHA256 للتحقق من صحة الرمز
  used       BOOLEAN NOT NULL DEFAULT false,
  used_at    TIMESTAMPTZ,
  branch_id  UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. جدول تذاكر الدعم ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL DEFAULT 'guest',
  user_name  TEXT,
  subject    TEXT,
  status     TEXT NOT NULL DEFAULT 'open',   -- open | pending | closed
  priority   TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
  branch_id  UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. جدول رسائل الدعم ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'user',  -- user | agent
  content     TEXT NOT NULL,
  sender_name TEXT,
  is_bot      BOOLEAN DEFAULT false,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. جدول الدوماينات ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending | pending_verification | active | expired | suspended
  provider        TEXT DEFAULT 'namecheap',  -- namecheap | external | cloudflare
  is_active       BOOLEAN DEFAULT false,
  dns_configured  BOOLEAN DEFAULT false,
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  price           NUMERIC(10,2),
  expires_at      TIMESTAMPTZ,
  namecheap_id    TEXT,         -- Namecheap order ID
  verification_token TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 6. جدول العروض ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT,
  title_ar          TEXT,
  description       TEXT,
  discount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  type              TEXT NOT NULL DEFAULT 'percent',  -- percent | fixed
  plan              TEXT DEFAULT 'pro',
  valid_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to          DATE NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  show_on_homepage  BOOLEAN DEFAULT true,
  badge_text        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS Policies ─────────────────────────────────────
ALTER TABLE public.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers            ENABLE ROW LEVEL SECURITY;

-- السماح بالقراءة والكتابة للمصادقين
CREATE POLICY "auth_all_subscriptions"   ON public.subscriptions     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_payment_codes"   ON public.payment_codes     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_support_tickets" ON public.support_tickets   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_support_messages"ON public.support_messages  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_domains"         ON public.domains           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_offers"         ON public.offers            FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "auth_write_offers"        ON public.offers            FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- السماح anon بالقراءة والكتابة على بعض الجداول (للنظام بدون Supabase Auth)
CREATE POLICY "anon_subscriptions"    ON public.subscriptions    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_payment_codes"    ON public.payment_codes    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_support_tickets"  ON public.support_tickets  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_support_messages" ON public.support_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_domains"          ON public.domains          FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── Realtime ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;

-- ─── Updated_at triggers ─────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at   BEFORE UPDATE ON public.subscriptions   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER domains_updated_at         BEFORE UPDATE ON public.domains         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
