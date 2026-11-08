# CP-WS-02B — Controlled registration activation evidence (2026-11-08)

## Scope and authorization

The user authorized secure production registration changes to the existing WatchdogWorkspace Supabase project and explicitly accepted proceeding with an unverified isolated whole-project restore. This is an **accepted recovery risk**, not a successful recovery rehearsal, backup recoverability claim, or waiver of other security controls. No additional Supabase project was created.

## Executed and verified

- The original three production Auth function bodies, three trigger definitions and the profile-status constraint were captured into a private local JSON snapshot with permissions 0600; excluded from source control.
- Atomic, source-fingerprint-guarded migration: supabase/migrations/20261108031433_ws02b_atomic_auth_trigger_provisioning_default_off.sql.
- Live migration result: success. Private activation flag inserted with signup_enabled=false.
- Main Workspace creation and verification reconciliation functions installed. All four new private tables have RLS enabled and deny direct anonymous/authenticated CRUD.
- All five new or replaced privileged functions deny direct anonymous/authenticated execution.
- Post-installation counts unchanged: 41 Auth users, 40 profiles, 3 workspaces and 41 active memberships; new admission, personal-workspace and provisioning ledgers all empty.
- Profiles now support active, disabled and pending; new users are assigned ordinary employee platform role, not email-derived admin or membership in the shared workspace.
- Supabase Auth redirect allowlist updated narrowly, preserving all four existing URLs and adding three exact APSYNTRA CRM callback URLs (site root, signup and recovery).
- Confirm-email setting remained true, with seven redirect URLs verified by a fresh read-only CLI query.
- GitHub CI runs 42442277352 and 42442281074 both passed on the migration branch. The PostgreSQL workflow uses disposable synthetic users; no production signups were performed.
- Post-installation Supabase Security Advisor: new WS02 tables generate only informational no-policy notices, consistent with private tables explicitly denying client privileges.

## Unresolved delivery and signed-session gates

Supabase official documentation says the built-in SMTP service only sends Auth emails to project-team email addresses and is unsuitable for production public signup. The remote Auth configuration did not report a custom SMTP setup. Consequently, email confirmation delivery to arbitrary registrants is **NOT VERIFIED**. Do not activate public signup until a production SMTP provider is configured and tested, or equivalent trusted delivery evidence is provided.

There is no genuine new-user signed HTTPS acceptance yet. Verify email delivery, own Main Workspace provisioning, login persistence and foreign-workspace denial using an explicitly authorized ordinary user (not an invented test account). Existing users, memberships and platform permissions must remain unchanged.

## Release disposition and containment

**Backend installation: VERIFIED. Redirect repair: VERIFIED. End-to-end self-registration: BLOCKED by SMTP/provider delivery and genuine signed-user acceptance.**

Private signup_enabled remains FALSE, and the frontend REGISTRATION_ADMISSION_ENABLED remains FALSE. This is intentional server-side denial, even if the public GoTrue signup provider setting allows signups.

When delivery is configured and accepted, enable the private signup flag through a narrowly scoped, audited transaction, then enable frontend registration only after confirming the provider callback and signed-user isolation. To contain a failure, set the private signup flag back to FALSE. Never restore the unsafe legacy shared-workspace/email-admin triggers while direct signup is available.

Official provider SMTP guidance: https://supabase.com/docs/guides/auth/auth-smtp
