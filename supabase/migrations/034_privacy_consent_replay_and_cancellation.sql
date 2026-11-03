-- Felsy privacy foundations and subscription cancellation audit fields.
-- Apply after the existing billing migrations. This migration does not enable
-- a replay SDK or approve a child signup by itself; server-side flows must be
-- connected before those capabilities are advertised as active.

-- The live schema already uses cancel_at_period_end. Keep this migration
-- safe for installations where that field was created by an earlier patch.
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text;

UPDATE public.tenant_subscriptions
SET cancellation_requested_at = COALESCE(cancellation_requested_at, cancelled_at),
    cancellation_effective_at = COALESCE(cancellation_effective_at, current_period_end)
WHERE cancel_at_period_end = true;

CREATE INDEX IF NOT EXISTS tenant_subscriptions_cancel_at_period_end_idx
  ON public.tenant_subscriptions (current_period_end)
  WHERE cancel_at_period_end = true;

-- Minimal, service-managed parental-consent workflow. Contact details must be
-- encrypted by the Edge Function before insertion; only a keyed hash is used
-- for lookup/rate-limiting. Do not store a child's full birth date here.
CREATE TABLE IF NOT EXISTS public.parental_consent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_identity_hash text NOT NULL,
  guardian_contact_ciphertext text NOT NULL,
  guardian_contact_hash text NOT NULL,
  guardian_relationship text,
  jurisdiction_code text NOT NULL,
  age_threshold_years smallint NOT NULL CHECK (age_threshold_years BETWEEN 1 AND 21),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'revoked', 'expired')),
  consent_policy_version text NOT NULL,
  verification_method text,
  verification_reference_hash text,
  child_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'verified') OR verified_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS parental_consent_requests_child_hash_idx
  ON public.parental_consent_requests (child_identity_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS parental_consent_requests_guardian_hash_idx
  ON public.parental_consent_requests (guardian_contact_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS parental_consent_requests_pending_expiry_idx
  ON public.parental_consent_requests (expires_at)
  WHERE status = 'pending';

ALTER TABLE public.parental_consent_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parental_consent_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.parental_consent_requests TO service_role;

-- Consent is recorded as append-only events. Withdrawals are new events,
-- never destructive edits to the original grant.
CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (
    consent_type IN ('terms', 'privacy_notice', 'marketing', 'analytics', 'session_replay', 'parental_consent')
  ),
  decision text NOT NULL CHECK (decision IN ('granted', 'denied', 'withdrawn')),
  policy_version text NOT NULL,
  jurisdiction_code text,
  recorded_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parental_request_id uuid REFERENCES public.parental_consent_requests(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'application',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS privacy_consent_events_subject_idx
  ON public.privacy_consent_events (subject_auth_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS privacy_consent_events_tenant_idx
  ON public.privacy_consent_events (tenant_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_privacy_consent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'privacy consent events are append-only; record a new event instead';
END;
$$;

DROP TRIGGER IF EXISTS privacy_consent_events_append_only ON public.privacy_consent_events;
CREATE TRIGGER privacy_consent_events_append_only
BEFORE UPDATE OR DELETE ON public.privacy_consent_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_privacy_consent_event_mutation();

ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_consent_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.privacy_consent_events TO service_role;
REVOKE ALL ON FUNCTION public.prevent_privacy_consent_event_mutation() FROM PUBLIC, anon, authenticated;

-- Replay is opt-in by default. The replay provider must enforce this preference
-- before creating a recording and must redact sensitive DOM/input values.
CREATE TABLE IF NOT EXISTS public.session_replay_preferences (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  consent_version text,
  consented_at timestamptz,
  revoked_at timestamptz,
  redaction_policy_version text NOT NULL DEFAULT 'baseline-v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((enabled = false) OR (consented_at IS NOT NULL AND consent_version IS NOT NULL))
);

ALTER TABLE public.session_replay_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_replay_preferences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.session_replay_preferences TO service_role;

-- Processing inventory for documenting purpose, legal basis, retention and
-- cross-border processors. Rows are maintained by an authorized backend.
CREATE TABLE IF NOT EXISTS public.privacy_processing_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_category text NOT NULL,
  purpose text NOT NULL,
  legal_basis text NOT NULL,
  retention_days integer CHECK (retention_days IS NULL OR retention_days >= 0),
  processor_name text,
  processing_region text,
  transfer_destination text,
  transfer_safeguard text,
  policy_version text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data_category, purpose, policy_version)
);

ALTER TABLE public.privacy_processing_register ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_processing_register FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.privacy_processing_register TO service_role;

INSERT INTO public.migration_status (migration, note)
VALUES (
  '034_privacy_consent_replay_and_cancellation',
  'Adds service-only parental consent, append-only privacy consent, opt-in replay preferences, processing register and cancellation audit dates.'
)
ON CONFLICT (migration) DO NOTHING;
