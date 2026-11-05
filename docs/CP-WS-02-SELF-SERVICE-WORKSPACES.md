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
| CP-WS-02D | Single-use invitation lifecycle, accepted recipient membership | **PENDING** |
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
