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

The migration adds a service-role-only request table. It deliberately does not store a child's full date of birth. Guardian contact must be encrypted by the backend before storage; a keyed hash can support lookup and abuse prevention.

**Still required before enabling child accounts:**
1. Add an age/eligibility step to every signup path, including email and OAuth.
2. Resolve the applicable minimum age and guardian rules from the user's jurisdiction; do not assume one age threshold for all countries.
3. If guardian consent is required, do not create/activate the child account until a verified guardian flow succeeds.
4. Verify guardian control using a suitable independent verification method; an unchecked checkbox or email link alone may not be sufficient in every jurisdiction.
5. Support consent withdrawal, account restrictions, access/deletion requests and an auditable record of the policy version.
6. Test bypass attempts against direct Edge Function calls, not only the browser form.

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

The processing register is intentionally empty until Felsy records actual data categories, purposes, legal bases, processors, retention periods and international transfer safeguards. Do not fill it with generic claims.

Before public release, prepare country-specific notices and terms for each market where Felsy is offered, and obtain qualified local legal review. At minimum review Saudi Arabia, UAE, Qatar, Bahrain, Kuwait, Oman, Jordan, Egypt and any other launch market. The database structures are technical controls, not legal advice or proof of compliance.

## Deployment checklist

1. Review this PR and merge it only after code review.
2. Apply migration `034_privacy_consent_replay_and_cancellation` to the intended Supabase project.
3. Deploy the updated `account-manage` Edge Function.
4. Test cancel, repeated cancel, resume, repeated resume, expired subscription and database failure paths.
5. Confirm a cancelled recurring subscription is skipped by the billing cron and remains active until the paid period end.
6. Do not claim child signup is protected until every signup/OAuth path enforces guardian approval server-side.
7. Do not claim Session Replay is opt-in until the provider SDK itself checks `session_replay_preferences` before recording.
8. Run the app build, Edge Function checks, SQL migration checks and an end-to-end test in staging before production deployment.
