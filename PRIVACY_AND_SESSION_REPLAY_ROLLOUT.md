# Felsy privacy, child-consent, Session Replay and cancellation rollout

## Scope of this change

This PR adds database foundations and hardens the existing cancellation endpoint. It is **not** a claim of legal compliance in every Arab country and does not by itself complete the child signup or replay-provider integration.

## Subscription cancellation

- The existing account screen already exposes cancel and resume actions.
- The existing billing cycle already checks `cancel_at_period_end` before charging.
- The Edge Function now checks read and write errors, returns success only after the database confirms the update, and stores requested/effective timestamps.
- The paid period is not shortened. The service remains usable until `current_period_end`; the renewal job must not charge after a cancellation request.
- Resume is accepted only before the paid period ends.
- Before deployment, verify that the scheduled `billing-run-cycle` job is active and that it uses the current function version.

## Children and guardian consent

The public signup now requires a date of birth and an explicit adult-owner declaration. The Edge Function independently validates that the proposed owner is at least 18 before creating an auth user or tenant. The full date of birth is not persisted. Terms, privacy notice and adult-age attestation are recorded in the append-only consent log.

This blocks direct self-service signup for minors; it does not yet implement a child-account workflow. If a future product feature permits minors to use Felsy as staff or account members, require a verified guardian workflow and apply the country-specific threshold before provisioning access. The parental-consent request table is service-role-only and is not exposed as an active signup path. Do not treat a checkbox as identity verification.

## Session Replay

A source scan of the repository did not find a direct PostHog, Clarity or Hotjar integration. This does not rule out a vendor script injected by the hosting platform or tag manager.

The new preference table defaults to `enabled = false`. Before enabling any replay provider:
- Inventory every provider and the region where recordings are stored.
- Gate initialization on explicit consent where required.
- Mask all inputs by default; never capture passwords, payment fields, authentication tokens, identity documents, tax/customer data or private notes.
- Exclude checkout, login, signup, account recovery and sensitive business screens unless a documented lawful basis and robust redaction justify otherwise.
- Apply short, documented retention and deletion workflows.
- Ensure withdrawal stops future recording and propagate deletion requests to the provider.
- Do not use replay data for advertising or profiling children.

## Privacy and legal review

The processing register has an initial inventory for Supabase, Moyasar, Vercel and ZATCA. The Supabase project is hosted in ap-south-1 (Mumbai, India). Legal bases and retention periods are marked pending review where they have not been established; Moyasar and Vercel processing regions still need vendor confirmation. Do not fill it with generic claims.

Before public release, prepare country-specific notices and terms for each market where Felsy is offered, and obtain qualified local legal review. At minimum review Saudi Arabia, UAE, Qatar, Bahrain, Kuwait, Oman, Jordan, Egypt and any other launch market. The database structures are technical controls, not legal advice or proof of compliance.

## Deployment checklist

1. Review this PR and merge it only after code review.
2. Migration `20261103_privacy_consent_replay_and_cancellation` has been applied to the connected Supabase production project and its four new tables were verified with RLS enabled and no direct client policies (service-role only).
3. Deploy the updated `account-manage` Edge Function.
4. Test cancel, repeated cancel, resume, repeated resume, expired subscription and database failure paths.
5. Confirm a cancelled recurring subscription is skipped by the billing cron and remains active until the paid period end.
6. The current owner signup endpoint enforces an adult age gate server-side; verify all other account-provisioning paths before enabling minor staff accounts.
7. Do not claim Session Replay is opt-in until the provider SDK itself checks `session_replay_preferences` before recording.
8. GitHub Actions build and Edge Function type-check passed for this PR. The production Edge Function deployments and live signup/cancellation end-to-end tests remain to be completed.
