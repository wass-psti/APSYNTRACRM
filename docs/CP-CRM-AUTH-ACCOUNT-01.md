# CP-CRM-AUTH-ACCOUNT-01 — Registration Admission and Password Recovery

## Architecture

APSYNTRA CRM retains centralized Supabase Auth, the existing REST authentication client, signed workspace API, PostgreSQL RLS and centralized role management. The redesigned login page now includes visible Sign in, Create account and Forgot password routes, with native form validation, accessible status notices and existing password visibility controls.

## Production registration blocker — verified by read-only SQL, 2026-11-04

The production auth.users INSERT trigger executes public.handle_new_user(). That function inserts public.profiles with status active and includes a legacy email-specific administrator role branch. The public.profiles INSERT trigger executes public.ensure_default_workspace_membership(), which inserts or reactivates primary workspace membership with active=true for new users.

Public registration cannot be enabled safely until those triggers and admission RPC/RLS checks are hardened. Otherwise new identities can gain membership without approval and the legacy identity branch could assign privileged roles. Accordingly REGISTRATION_ADMISSION_ENABLED is false and the registration form displays the reason but disables account creation. No signup API call is wired.

Before enabling registration, obtain separate production policy-change approval for a reversible and independently tested migration which removes email-derived administrative privileges for new users, creates pending (not active) unapproved profiles, prevents automatic membership, requires verified email and audited administrator approval, and checks pending-state denial through all signed workspace, board and RPC access paths. Preserve existing bootstrap accounts and existing memberships. Verify session/revocation behavior and cross-workspace RLS with nonproduction identities.

No SQL, data, account, role, membership, auth provider or production credential changes were executed in this milestone.

## Password recovery implementation

Password recovery uses the existing AuthClient.passwordRecovery and Supabase Auth provider. The redirect target is fixed to https://wass-psti.github.io/APSYNTRACRM/?auth_action=recovery; it must be allowed in Supabase Authentication URL Configuration. Delivery depends on the hosted SMTP provider and configured rate limits; these settings were not modified or verified.

The browser accepts the provider's implicit recovery access_token fragment or a type=recovery token_hash query, scrubs callback tokens synchronously from browser history before normal app routing, and validates with the existing Auth /user endpoint. The token is held only in ephemeral memory; it is never added to the normal signed workspace session or sessionStorage. Invalid, expired, malformed or unverified links cannot open an enabled reset form.

The new password is locally validated and confirmed, then sent exclusively through PUT /auth/v1/user with the verified recovery bearer. Identity is rechecked before the update. On success, POST /auth/v1/logout?scope=global is attempted, and the local login session is cleared. Global logout revokes refresh sessions when confirmed; already-issued JWT access tokens may remain valid until expiry unless the server independently checks revoked sessions. If logout fails, the UI must not claim global revocation. The workflow never changes roles, memberships, bootstrap classification or board grants.

Registration email confirmation callbacks show a neutral notice but do not create a signed workspace session.

## Tests and remaining acceptance

Mocked test identities verify signup blocking, form rendering, password policy, neutral account recovery responses, callback parsing, URL scrubbing, provider identity checks, reset updates, session clearing, logout failure, and login regression. The CI frontend suite, build and Pages smoke validate source/deployment only.

Still required: separate approved backend admission hardening; production SMTP and redirect allowlist verification; genuine nonproduction email verification/reset and expired/replayed-link tests; real signed-session authorization/RLS checks; keyboard/mobile/screen-reader browser acceptance; and evidence of revocation of old sessions. These are not assumed from frontend tests or Pages asset checks.

Status: frontend registration UI implemented but intentionally BLOCKED; recovery implemented subject to provider redirect/email configuration and authenticated end-to-end verification. No production readiness claim until all gates pass.
