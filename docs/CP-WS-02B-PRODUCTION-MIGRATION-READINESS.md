# CP-WS-02B — Controlled Production Migration Readiness

**Status as of 2026-11-05:** `AUTOMATED-DISPOSABLE-PASS / READ-ONLY-PRODUCTION-BASELINE-PASS / PRODUCTION-ACTIVATION-BLOCKED`

**Scope:** Prepare self-service verified-account registration and automatic personal Main Workspace provisioning in the **existing** Supabase project `jtlusodorfnyzgyuewkz`. This document is an evidence and rollback plan, **not** authorization to run the migration or change provider settings.

## 1. Approved policy and invariants

- All eligible, verified, non-anonymous APSYNTRA CRM accounts may own workspaces. Every genuinely new account receives exactly one personal **Main Workspace**. Workspace ownership never grants a global platform-administrator role.
- Preserve every existing Auth identity, profile, bootstrap/platform role, shared workspace membership, board, module assignment, operational record, storage object and audit trail. Do not backfill legacy users or reassign current membership.
- A new unverified user stays `profiles.status='pending'` and receives **no** membership, workspace, application grant or module-role sync. A disabled account never becomes active merely through email verification. Email verification changes must fail closed on lost verification.
- The registration UI flag is **not** an authorization boundary; a direct Supabase signup request could otherwise bypass it. Backend admission requires a private activation flag and, before activation, provider configuration review.
- The current `public.wm_auth_access_context()` returns no active workspace when profile status is not `active`; `public.current_workspace_id(uuid)` also filters to active profiles and memberships. Retain these server-side checks.
- CP-WS-01C/B2 remains a signed, membership-scoped read-only discovery function. CP-WS-01C/B3 (user-created additional workspace) and B4 (session workspace switching) remain **disabled** and outside this migration.

## 2. Live production baseline (read-only)

The checked-in read-only SQL `sql/tests/cp-ws02b-production-migration-readiness-preflight.sql` was executed against production and returned:

```
WS02B_BASELINE_VERIFIED__SEPARATE_PRODUCTION_AUTHORIZATION_REQUIRED
```

The three original triggers are enabled and their full function definitions match these stored **fingerprints only**:

| Routine | MD5 of `pg_get_functiondef` |
| --- | --- |
| `public.handle_new_user()` | `89efd34397c75bb0a823d19c2dbeed75` |
| `public.ensure_default_workspace_membership()` | `a8b4fff0e5bd27acbb16e3aab3768a25` |
| `public.sync_profile_email_verification()` | `51a5b28aa039e72a1485726071d465fe` |

Production `profiles_status_check` allows only `active/disabled`. The legacy email-based administrator assignment and shared-workspace membership insertion remain installed. Existing inventory at this snapshot: **41 Auth users, 40 profiles, 2 workspaces, 40 active workspace memberships**. These counts are monitoring baselines, not criteria to forbid legitimate subsequent existing-user activity. No personal-provisioning ledger/function or signup-activation flag exists in production. B3/B4 functions and enablement flags remain disabled/absent.

The function fingerprints must be **rechecked immediately before any approved release**. A mismatch blocks the release until reconciled; do not apply a migration against unseen changes.

## 3. Staged source and verification

| Component | Staged candidate / test | Tested result |
| --- | --- | --- |
| Personal Main Workspace + owner/member/closed policy + event + unique ledger | `sql/cp-ws02b-main-provisioning-candidate.sql` | Isolated pass |
| Hardened signup, pending status, verification, disabling legacy shared admission | `sql/cp-ws02b-self-service-auth-trigger-candidate.sql` | Isolated pass |
| **Backend signup gate disabled by default** | `private.ws02_activation_flags.signup_enabled=false` in trigger candidate | Denied initial signup; isolated pass |
| Privileged idempotent recovery for verified pending accounts | `private.ws02_reconcile_verified_admission(uuid)` | Disabled-gate denial, recovery, legacy-account denial, disabled-profile denial; isolated pass |
| Synthetic legacy triggers and new signup/reverification/rollback tests | `sql/tests/cp-ws02b-disposable-legacy-auth-fixture.sql` and `sql/tests/cp-ws02b-disposable-auth-trigger-acceptance.sql` | Isolated pass |

[GitHub Actions PG17 run #60](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41980433542) completed **success**, including prior B2 denial, B3 idempotent create/rollback, Main Workspace uniqueness, signup trigger replacement, server-side disabled-gate, lost-email-verification, disabled-account and recovery acceptance. All tests used disposable synthetic accounts; no live Auth signup, delivery or concurrent cross-process traffic was exercised. The production preflight has separately passed, without modifying production.

The staged candidate creates private RLS tables and private SECURITY DEFINER helpers with `PUBLIC/anon/authenticated` execution revoked. The existing public Auth trigger functions are replaced by explicit `SECURITY DEFINER SET search_path=''` implementations and client execution privileges remain revoked. **The only additional trusted activation switch is a private, default-off flag; it is not exposed to the frontend.**

## 4. Required release sequence (NOT YET AUTHORIZED)

**Gate 0 — external prerequisites:** Obtain separate, scoped approval for replacing production Auth triggers/profile constraint, installing trusted private helpers, and later enabling new account admission. Verify a recoverable production backup or independently valid restore evidence, check Supabase Auth settings **Allow new users to sign up**, **Confirm Email**, redirect allowlist, delivery/SMTP, anti-abuse/rate-limit configuration and provider-specific invitations. The frontend's disabled form does not establish whether backend signup is currently enabled. Ensure a maintenance/rollback contact is assigned.

**Gate 1 — immutable preflight:** Re-run the checked-in read-only fingerprint and catalog query; confirm live Auth trigger source definitions match the three hashes, status constraint is still `active/disabled`, B1/B2 scope is unchanged, B3/B4 remain inactive, and no WS02B objects were independently installed. Export the **original full** trigger/function/constraint definitions to controlled private backup storage (not this public repository), and verify the backup can be read. Do not publish user data, credentials, source email literals or secret keys.

**Gate 2 — dormant installation (separate permission-change approval required):** After proper change authorization, install `sql/cp-ws02b-main-provisioning-candidate.sql` followed by `sql/cp-ws02b-self-service-auth-trigger-candidate.sql` in separately audited migrations, ensuring the signup activation flag stays **false**. The first migration is additive and does not modify Auth triggers. The second replaces the legacy signup/shared-membership trigger behavior and updates the profile status constraint, so its short-lived signup interruption is an operational change and must be scheduled/approved. It must **not** enable registration implicitly, even if Supabase Auth currently allows direct signups. Confirm existing users can sign in and old workspaces/roles are unchanged. Do not stage B3 or B4 permissions in this step.

**Gate 3 — postinstallation default-deny:** Verify new account requests are blocked when `signup_enabled=false`, no public/client execution on private helpers or tables, no unexpected direct workspace grants, no changes in preexisting account records, no email administrator escalation, no B2 or board authorization regression. Confirm the authoritative workspace resolver still scopes by active profile and active membership.

**Gate 4 — production registration activation (separate activation approval):** Only after approved real test-account strategy and Auth provider/SMTP/redirect review, explicitly set `signup_enabled=true` in a controlled transaction, then enable the frontend registration entry point. Verify one ordinary signed verified user receives their independent Main Workspace and owner membership, same account can sign in after refresh, and account remains `employee` globally. Verify negative attempts (unverified, anonymous, disabled, expired/revoked session, replay, unsafe duplicate name or invitation) and audit. Do not use production employee records or another user account as a test fixture without authorization.

**Gate 5 — observe and accept:** Re-verify independent workspace isolation, ledger/audit identity consistency, idempotent retries and concurrent verification where possible, module/board startup behavior, B2 membership non-disclosure, and no implicit B4 session switch. Keep feature flags gated until evidence is signed off. Invitation workflow is CP-WS-02D and not automatically activated by this release.

## 5. Fail-closed rollback and recovery

**Emergency containment:** First disable the new private signup flag (`signup_enabled=false`) by a separately authorized backend change, then disable the UI signup entry and, if required, provider signup. Verify attempted new registrations are rejected. **Do not restore the unsafe legacy email-derived administrator or shared-workspace admission triggers** while signup is reachable. Preserve existing authenticated user login, production boards and memberships.

**Before any new user records exist:** Roll back an uncommitted migration transaction normally. A full schema uninstall may be planned only if no WS02B ledger, Main Workspace, admission or audit entries exist and the old Auth trigger restore is independently reviewed and guarded so unsafe signups cannot resume.

**After real new accounts/workspaces exist:** Prefer functional rollback (disable signup and keep existing WS02B tables, ledgers, memberships and audits) and an audited forward-fix. Do not drop new workspaces or reassign users; deleting/reverting irreversible data requires separate destructive approval. Maintain all prior verified-account access and owner rights where safe.

**Interrupted or paused verification:** The private `ws02_reconcile_verified_admission(uuid)` helper is restricted to trusted backend operations; it only reconciles a newly admitted, email-verified, non-anonymous, non-disabled user while the activation flag is enabled. It is idempotent and will not reactivate a deliberately disabled workspace membership. It is never an authenticated browser RPC.

**Important limitation:** The current readiness CI proves sequential idempotency and rollback in one disposable runner; independently concurrent GoTrue verification, actual SMTP/email confirmation, cross-device browser acceptance and backup restoration remain unverified. Treat them as acceptance gates, not assumed capabilities.

## 6. Readiness disposition

| Criterion | Classification |
| --- | --- |
| Production trigger/constraint fingerprints and inventory | **VERIFIED** (live read-only) |
| No WS02B production activation, unchanged B2/B3/B4 | **VERIFIED** |
| Automatic Main Workspace idempotency/ownership/legacy preservation | **VERIFIED** in disposable PG17 only |
| Fail-closed signup gate, pending/disabled/reverification denial | **VERIFIED** in disposable PG17 only |
| Privileged recovery, idempotent retry and RLS/default-deny | **VERIFIED** in disposable PG17 only |
| Reversible release and data-preserving containment sequence | **IMPLEMENTED-UNVERIFIED** (documented only) |
| Provider email confirmation, SMTP, redirect, rate-limit settings | **PENDING** |
| Independently proven production database restore | **PENDING** |
| Genuine provider signup and multi-session/concurrency acceptance | **PENDING** |
| Separate scoped production authorization / release execution | **BLOCKED** |

**Gate decision:** PREACTIVATION WORK COMPLETED IN PART; NOT PRODUCTION-READY. No production schema, Auth triggers, provider configuration, accounts, roles, sessions, permissions, membership, lifecycle flag or records were changed during the readiness checks.
