# CP-WS-02 — Self-Service Workspaces, Ownership, Invitations, Membership and Switching

## Decision and authorization scope

**Approved product decision:** Each eligible, email-verified APSYNTRA CRM account receives an independent personal **Main Workspace**, can create and own additional workspaces without approval from a platform administrator, may accept or decline invitations to other users' workspaces, and may switch only among authorized memberships. A workspace owner is **not** granted platform-administrator rights by creation or invitation.

This supersedes the earlier administrator-only/delegated-creator policy suggestion. It does **not** authorize bypassing existing platform security restrictions, password/authentication requirements, bootstrap protections, production change approvals or RLS. Account registration is still gated until the production auth triggers can be replaced safely.

Architecture stays **one platform / one Supabase Auth identity / many isolated workspaces / workspace-scoped boards and applications / one central backend + PostgreSQL and storage**. Existing user accounts, primary workspace memberships, bootstraps, operational records and role assignments must remain intact.

## Authoritative observed production baseline (2026-11-05; read-only)

- `public.profiles` contains global `platform_role`, `status`, `email_verified_at`; `auth.users` contains `email_confirmed_at` and `is_anonymous`.
- The `auth.users` insert trigger `on_auth_user_created` executes `public.handle_new_user()`, whose source has an **email-specific `admin_general_manager` role branch** and calls `public.sync_module_roles`.
- The `public.profiles` insert trigger `profiles_default_workspace_membership` executes `public.ensure_default_workspace_membership()`, which assigns the **same legacy primary workspace** and can reactivate a membership on conflict. Its behavior is unacceptable for independent self-service Main Workspaces.
- A separate email verification synchronization trigger exists; it currently does not provision an independently owned Main Workspace.
- Existing inventory: **41 auth users, 40 profiles, 2 workspaces and 40 active memberships** at review. There are no profiles without active memberships in this snapshot. These totals are historical observation only; never infer consent to provision or reassign them.
- B1 six private tables retain RLS/default-deny. B2 `wm_ws01_list()` is active and signed-membership-scoped. B3 `wm_ws01_create()`, B4 `wm_ws01_select()`, and production creation/switch flags remain absent/off.
- The new read-only check `sql/tests/cp-ws02a-production-readonly-discovery.sql` returned `WS02A_BLOCKED_LEGACY_SIGNUP_ROLE_AND_SHARED_MEMBERSHIP_TRIGGERS`. No SQL/role/profile/session/workspace changes were executed.

## Domain ownership and permission precedence

1. **Identity:** `auth.users` is the single login identity; `public.profiles.platform_role` retains centrally administered platform permissions. Never derive admin role from email/user-edited metadata.
2. **Workspace:** membership is keyed by `(workspace_id,user_id)`. One user may own multiple workspaces and be a member of other workspaces. Each workspace owns isolated configurations, membership policy, board catalog, records, storage, audit and invitations.
3. **Workspace role:** Owner > delegated Workspace Administrator > Member > scoped Guest (subject to platform role ceilings). Legacy private `ws01_member_roles.relation` currently permits only `owner/member/collaborator`; adding explicit Workspace Administrator and Guest and mapping existing collaborators requires a separate additive, tested migration. Never silently reinterpret historic roles.
4. **Application/board permissions:** must satisfy signed GoTrue session, active profile, active membership in the **current authoritative workspace**, platform security ceilings and resource-level RBAC/RLS. Workspace ownership is not a platform role; workspace role must never elevate cross-workspace rights or override platform restrictions.
5. **Creation:** all eligible verified users can create. Existing B3 candidate requires an active membership; an onboarding path must provision the first Main Workspace for newly verified users before normal B3 UI calls. Creator gets workspace-local Owner + active membership + audit event, not elevated global `platform_role`.
6. **Switch:** server-authoritative session choice, membership checked afresh, old scope revoked, no arbitrary client-supplied workspace override. B4 stays disabled until independent authorized acceptance.

## Main Workspace onboarding contract (CP-WS-02B)

- A genuinely **new** account is admitted with least-privilege platform role and no legacy shared-workspace membership. Email verification (and non-anonymous Auth status) is prerequisite to active workspace access.
- After verification, create exactly one independent `Main Workspace` linked to the account as Owner, with workspace policy, active membership, event and unique provisioning ledger in a database transaction.
- Implement deterministic per-account provisioning idempotency across registration retries, concurrent verification callbacks and re-login; never create duplicates or re-activate an intentionally revoked membership.
- Registration may complete while provisioning is interrupted; provide a permission-scoped, idempotent repair/retry that only targets that new verified account.
- Preserve existing 40 profiles and current workspaces: **no historical account backfill or automatic reparenting**. Reconcile existing accounts separately before any opt-in legacy provisioning.
- Do not enable signup while either the email-based administrator role assignment or the legacy shared-membership trigger is active. Trigger replacement must be independently verified and separately authorized for production.

## Workspace creation contract (CP-WS-02C)

- `wm_ws01_create(name,privacy,request_id)` is the staged B3 candidate: authenticated verified non-anonymous session, active profile and membership, `creation_enabled` flag, input validation, actor-keyed concurrency lock and idempotency, one transaction for workspace+owner membership+privacy+audit, no implicit session switching.
- Open workspace privacy is **not** public admission. No unrestricted read/join. A newly created workspace does not automatically gain apps or boards outside approved initialization.
- Ordinary nonadministrator creation is explicitly permitted; creator's existing `platform_role` remains unchanged. Unverified and anonymous identities are denied.
- Until the server-side production grant/flag is separately approved, UI create remains a nonmutating readiness dialog.

## CP-WS-02D invitation interface checkpoint — 2026-11-05

The [workspace invitation UI and acceptance plan](./CP-WS-02D-INVITATION-UI.md) now covers the signed workspace **Invite members** entry points, a multi-email draft dialog, Admin/Member/Viewer workspace-role previews, optional custom message and accessible review. Automated frontend, Postgres regression and Pages deployment workflows passed. **Invitation sending remains explicitly disabled** pending signed backend authorization, invitation persistence and secure delivery. The current database role enum does not yet implement the preview Admin/Viewer roles; no platform role elevation or production schema/permission change is implied.

## CP-WS-02D/B3 default-off GoTrue/session backend integration — 2026-11-05

[Integration report](./CP-WS-02D-B3-SIGNED-READ-TRUSTED-CONTRACT.md) and [CI #176](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42007719449) verify a backend-only GoTrue HTTPS user identity reader and parameterized PostgreSQL active-session reader (including deleted/banned user rejection), composed under the existing strict signed verifier. Production read-only SQL syntax verification passed with synthetic nonmember IDs. **Genuine signed-user B3 read acceptance remains pending**: run the existing Security-page button and provide only the sanitized report. Neither browser invitation sending nor any backend/private issuer/role ceiling/WS01C B4 switching is activated; readiness remains **5/10**.

## CP-WS-02D/B3 signed authorization, CAS races and delivery readiness — 2026-11-05

[Evidence report](./CP-WS-02D-B3-SIGNED-AUTH-DOMAIN-DELIVERY-READINESS.md): [PG17/Node CI #167](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42005082083) passed signed-actor mock, HTTP/provisioning boundaries and genuine **two-connection** database CAS races. Production catalog check verified **17/17 domain tables with RLS**, zero direct client table-write grants, original 24/24 domain function bodies unchanged, and WS02D invitation runtime still absent. This checkpoint establishes **5/10 defined development/readiness criteria**, not live or production acceptance. A genuine signed-user B3 read-only report, backend GoTrue/session integration, real trusted provider/webhooks, scoped authorization cutover and separate B4 workspace switching are still blocked or pending.

## CP-WS-02D/B3 remaining domain writes and trusted delivery prerequisites — 2026-11-05

[Detailed B3 acceptance and provider-readiness evidence](./CP-WS-02D-B3-DOMAIN-WRITES-DELIVERY-READINESS.md) records passing disposable PG17/Node tests for four shared module-state/lock write ceilings, the FuelTrack Admin-only import, a signed invitation HTTP boundary, and a private provider delivery-outcome ledger. The original two B2 board-creation guards bring the staged integrated subset to **7 of 30** independent mutation candidates, with **23 remaining for per-domain review**. [CI #131](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41995268080) passed the current staged test suite. Read-only production checks verify that all WS02D private objects are absent, original production function fingerprints are unchanged, and B3/B4 are still disabled. Provider choice, trusted deployment, actual delivery, signed recipient acceptance, domain permissions and production migration approval are **PENDING**.

## CP-WS-02D/B2 board-creation permission regression — 2026-11-05

[PG17 run #104](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41990746425) **PASSED** additional staged `wm_create_board` and `wm_create_board_configured` edit-ceiling tests: signed Members can create boards, Viewers cannot, scoped Admin does not become platform Admin, and expired sessions cannot write. The original functions, board initialization and audit behavior are preserved in disposable tests. This covers **two** of the **30** identified independent domain review candidates at the staging boundary; 28 still need dedicated reviews. None of these candidate modifications were installed in production.

## CP-WS-02D/B2 verified board ACL integration and mock email provider — 2026-11-05

[Detailed B2 evidence](./CP-WS-02D-B2-ROLE-PROVIDER-ACCEPTANCE.md): integrated workspace-role `AND` ceiling for `work_board_access` is staged and tested in disposable PG17; [CI #99](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41989469639) passed with Viewer denial, platform ceiling, role membership, foreign workspace and revoked-session tests. Optional server-only Resend transport passed mock HTTP/secret-handling tests but is neither deployed nor configured. The read-only production source inventory found **53 board ACL references** and **30 independent domain review candidates**; those candidates are not independently classified as vulnerabilities and require targeted RBAC review. Live Auth, boards, roles, provider, invited members and invitation send remain unchanged.

## CP-WS-02D/B bounded delivery and role-ceiling checkpoint — 2026-11-05

[Trusted delivery and role-ceiling evidence](./CP-WS-02D-B-DELIVERY-ROLE-SIGNED-ACCEPTANCE.md) records [PG17/Node CI #87](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41987273034) **PASS** for rate limits, mock trusted delivery, signed-session ceiling, replay/revocation and prior regression checks. A read-only live SQL fingerprint check confirmed invitation runtime absent and the existing board ACL unchanged. Real provider sending, link acceptance routing, all board/domain Viewer/Admin ceilings and genuine signed-user invitation acceptance are **PENDING**; production changes remain unauthorized and disabled.

## CP-WS-02D private invitation server-stage checkpoint — 2026-11-05

[Server invitation acceptance evidence](./CP-WS-02D-SERVER-INVITATIONS.md) documents private default-deny token storage, salted SHA256 token digests, workspace owner/delegated-admin eligibility, verified-email recipient acceptance, idempotent issuance, atomic membership/audit, token revocation, and synthetic role/session/foreign-workspace denial. [Disposable PostgreSQL 17 run #75](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41985272232) **PASSED** including B2/B3 regressions.

**Production remains unchanged:** no WS02D private schema/RPCs/grants are installed; B3/B4 remain disabled. The user-visible Invite members dialog still only validates a preview, never sends. Actual email provider delivery, rate limits, invite decline/expiry-state transitions, genuine signed-session acceptance and Admin/Viewer permission-ceiling enforcement are outstanding. No production-activation authority is inferred from the passing isolated tests.

## Invitation contract (CP-WS-02D)

- Only workspace Owners and delegated authorized workspace administrators may issue, resend or revoke invitations.
- Invitations are scoped to `workspace_id` and intended **verified recipient email**, with salted/hashed one-time cryptographic token, expiry, anti-enumeration response, capped attempts/rate limiting, `pending/accepted/declined/expired/revoked` lifecycle, idempotency and audit.
- Existing users sign in and accept with the same account. New invited users register/verify, receive an independent personal Main Workspace, and then accept the pending invitation into the inviter's workspace.
- Never create a workspace membership merely by sending/opening an invitation; acceptance checks the signed actor's verified email, live permission/role ceiling, unconsumed token and workspace admission rules transactionally. Expired/revoked/replayed tokens cannot grant access.
- No invitation send provider or new table has been activated; mail configuration, domain, delivery and abuse controls require separate evidence.

## Workspace controls and switching (CP-WS-02E/F)

Workspace switcher shows **My Workspaces, Joined Workspaces, Pending Invitations, Create Workspace, Settings and Recent Workspaces**. All entries derive from signed server-validated membership and invitation reads, never fabricated client state. Revalidate membership on session restore, CAS-check switching and deny revoked sessions.

Ownership transfer must be accepted by an eligible member, atomic and audited, and preserve at least one valid owner. Membership removal affects only that workspace. Archival is reversible; deletion is separately approved and preserves retention/recovery obligations. No cross-tenant data is copied by switching.

## Gates and evidence

| Gate | Acceptance focus | Current classification |
| --- | --- | --- |
| CP-WS-02A | Existing auth/role/workspace contracts, security architecture | **IMPLEMENTED-UNVERIFIED**: live inventory and design documented; unsafe signup trigger is a known blocker |
| CP-WS-02B | New-user Main Workspace idempotent verified-email provisioning | **IMPLEMENTED-UNVERIFIED**: dormant private candidate and isolated PG17 pass; no Auth trigger |
| CP-WS-02C | Ordinary-member workspace ownership + audited creation | **IMPLEMENTED-UNVERIFIED**: verified-email ordinary-member PG17 pass; production disabled |
| CP-WS-02D | Single-use invitation lifecycle, accepted recipient membership | **IMPLEMENTED-UNVERIFIED**: private dormant issue/accept/revoke, isolated PG17 PASS; email and signed E2E pending |
| CP-WS-02E | Multi-membership, secure switching and restoration | **PENDING** |
| CP-WS-02F | Ownership transfer, delegated admins, removal, archival | **PENDING** |
| CP-WS-02G | Isolation, RLS/RBAC, role denial, token abuse and audit | **PENDING** |
| CP-WS-02H | Controlled production activation and signed E2E acceptance | **BLOCKED** pending security/permission approvals and prior gates |

**No CP-WS-02 checkpoint is yet finally accepted for production.** An isolated PG17 pass and frontend deployment do not prove registration, emails, workspace creation or switching work live. B2 still lacks real disjoint foreign-workspace and expired/revoked browser acceptance.

## Production change boundary

Read-only inspection and disposable fixture/code changes are in scope. Explicit, separate approval is required **before** mutating production Auth triggers, role-admission policies, creating default workspace records for existing users, granting or enabling new production SECURITY DEFINER RPCs, changing invitation/email provider configuration, or removing any production records. Preserve same project and default-deny until those changes pass signed-user acceptance. Do not create a new Supabase project.


## Verified nonproduction implementation increment — 2026-11-05

**CI PASS:** [Workspace lifecycle run #44](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41977702471), commit `5c03d951829f330ba7604ff0a56abbfe2ba4cafb`, completed `success`. Every B2 read/denial step, B3 atomic creation/rollback step, new private Main Workspace staging step and new Main provisioning rollback/denial step succeeded in the isolated PostgreSQL 17 runner.

**CP-WS-02B new dormant code:** `sql/cp-ws02b-main-provisioning-candidate.sql` creates three private RLS/default-deny tables: new-account admission markers, a unique per-user personal workspace ledger, and provisioning audit events. Its private SECURITY DEFINER function verifies the account's confirmed email, non-anonymous status, active profile and **new-account admission marker**, then transactionally creates `Main Workspace`, private closed policy, owner membership, ledger and audit event; replay does not duplicate or reactivate a revoked membership. No Auth trigger or client EXECUTE grant is introduced. `sql/tests/cp-ws02b-disposable-provisioning-acceptance.sql` tests legacy-account non-backfill, idempotent replay, denied unverified/anonymous users, verified recovery, workspace/ownership audit and transaction rollback. **Concurrency under independently running transactions, real signup trigger replacement, email delivery and live verification are not yet tested**.

**CP-WS-02C strengthened dormant code:** `sql/cp-ws01c-b3-create-contract-candidate.sql` checks `auth.users.email_confirmed_at IS NOT NULL` and `is_anonymous IS FALSE`, in addition to active signed GoTrue session/profile/membership. Isolated B3 regression now proves a nonadministrator can create and own a workspace without changing their global platform role, and rejects unverified/anonymous accounts. Ordinary users with no initial membership depend on the separately gated Main Workspace provisioning path.

**Frontend copy and CI:** Registration form remains disabled but the messaging now explains secure self-service onboarding and independent personal ownership, instead of the old administrator-controlled admission decision. [Frontend Validation run](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41977001742) completed success for the amended copy and regression test. This does not make signup active.

**Production postcheck:** The connected database still has two workspaces, 40 active memberships, neither B3/B4 RPC nor WS02B provisioning function/ledger, and both workspace lifecycle flags disabled. The legacy signup/admin-role and shared-membership triggers remain active and are the next server-side blocker. This gate involved no production SQL DML/DDL, signup, account, role, membership or permission changes.

**Updated scoped status:** CP-WS-02A **IMPLEMENTED-UNVERIFIED** (architecture, live inventory and blockers documented); CP-WS-02B **IMPLEMENTED-UNVERIFIED** (dormant provisioning candidate and isolated CI only); CP-WS-02C **IMPLEMENTED-UNVERIFIED** (dormant verified self-service creator guard and isolated CI only); CP-WS-02D/E/F/G remain PENDING; CP-WS-02H BLOCKED. **0/8 production acceptance checkpoints complete**. Do not infer production readiness from passing isolated CI.


## Disposable signup-trigger integration acceptance — 2026-11-05

**Source added (review only):** `sql/cp-ws02b-self-service-auth-trigger-candidate.sql` extends the existing production `profiles_status_check` to include a distinct `pending` state, makes the legacy profile-insert membership trigger a no-op, replaces the legacy email-specific-admin `public.handle_new_user()` behavior with a least-privilege `employee` profile and a new-account admission marker, and updates email-verification synchronization to activate pending profiles and idempotently provision a private personal Main Workspace only after verified, non-anonymous Auth confirmation.

**Why the status migration is needed:** A connected read-only production query found `profiles_status_check` currently permits only `active` and `disabled`. Reusing `disabled` as unverified `pending` risks accidentally reactivating an intentionally disabled account during confirmation. The candidate explicitly introduces `pending`; no production constraint was changed.

**Disposable fixtures and assertions:** `sql/tests/cp-ws02b-disposable-legacy-auth-fixture.sql` simulates the existing unsafe trigger family. `sql/tests/cp-ws02b-disposable-auth-trigger-acceptance.sql` validates pending signup with no shared-membership grant, signed email-confirmation transition, one independent Main Workspace and owner membership, replay idempotency, instant-confirmation onboarding, nonpromotion for a legacy-bootstrap-style email, anonymous denial, preservation of an existing administrator and workspace, and full transaction rollback.

**CI:** [Workspace lifecycle run #54](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41978867995), commit `237a099c95f0ed6a0875b7dfceda8fad338fba7e`, completed **SUCCESS**. All B2/B3, new Main provisioning and signup replacement steps passed. Frontend registration remains explicitly disabled. The earlier unsuccessful workflow revealed missing `updated_at` in the synthetic profile fixture; it was corrected to match the live schema, and rerun #54 passed. The acceptance exercise used only disposable synthetic users.

**Production unchanged:** After the CI pass, a fresh production read-only check confirmed the old email-specific-admin and primary-workspace-insertion trigger bodies remain installed; `profiles_status_check` remains active/disabled; neither `private.ws02_provision_main_workspace` nor its personal workspace ledger exists; B3 creation and B4 switching RPCs are absent; both flags remain off; workspaces 2, active memberships 40. No user signup, production trigger replacement, schema or permissions mutation was performed.

**Required next checks before separate production authorization:** preserve exact rollback definitions of legacy triggers/functions and the existing profile constraint; verify new and invited identity onboarding without unexpected global roles, blocked/unverified/disabled account denial, OTP replay, provider email delivery, rate limits, concurrency under real parallel GoTrue sessions, backend module access, existing bootstrap protections, schema/role compatibility and RLS isolation. Do not enable public signup or production writes based on isolated CI.


## CP-WS-02B controlled production migration readiness — 2026-11-05

[Dedicated activation/rollback runbook](./CP-WS-02B-PRODUCTION-MIGRATION-READINESS.md). Fingerprinted, read-only live schema preflight returned `WS02B_BASELINE_VERIFIED__SEPARATE_PRODUCTION_AUTHORIZATION_REQUIRED`; all three original triggers/constraint match the captured fingerprints; no WS02B database objects exist in production; B3/B4 remain inactive. Live inventory unchanged at 41 Auth users, 40 profiles, two workspaces and 40 active memberships.

Staged contracts now enforce **backend signup disabled by default**, `pending` for unverified accounts, rejection of legacy email-admin privilege, independent personal Main provisioning, safe verification-loss/restoration, disabled-profile nonreactivation, and a private, client-denied verified-admission recovery helper. [Disposable PG17 run #60](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41980433542) completed `success`, including the new checks and existing B2/B3 regressions. None of this is production account admission acceptance.

**Remaining release blockers:** separate Auth-trigger/permission approval, independently checked backup/restore, Supabase provider signup/email-confirmation/SMTP/redirect/rate-limit settings, true GoTrue concurrent and end-to-end signup tests, operational rollback review and signed production acceptance. Do not install or enable B3/B4 or `REGISTRATION_ADMISSION_ENABLED` as part of this documentation update.
