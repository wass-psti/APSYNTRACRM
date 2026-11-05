# CP-WS-01 — Multi-Workspace Selector, Discovery, and Creation

## Goal and verified architecture baseline (2026-11-05)

Use the nine user-supplied Monday.com reference screenshots as interaction guidance, **not** as evidence of APSYNTRA CRM backend functionality. Retain APSYNTRA identity and the preexisting single GoTrue authentication, one Supabase project, and all board/module security boundaries.

The existing production backend was inspected read-only:

- `public.workspaces` has `id`, `name`, `created_at`; there is **no workspace privacy or owner column**.
- `public.workspace_members` has `workspace_id`, `user_id`, `active`, `created_at`; it **does not distinguish owner, member, collaborator**.
- Both tables have RLS enabled and **no direct authenticated SELECT or INSERT grants**. Direct client queries cannot implement safe discovery/creation.
- `public.current_workspace_id(p_user_id)` deterministically chooses the user's **earliest active workspace membership**. Neither session-specific switching nor an authorized switch RPC exists.
- `public.wm_auth_access_context()`, `wm_list_boards()`, `work_board_access()` and multiple modules depend on that authoritative current workspace. Replacing it without auditing the entire authorization graph would create a cross-workspace risk.
- Production currently has two workspaces, but the second has no active membership. This prevents the separate TradeLink genuine foreign-workspace signed negative acceptance from passing.

## Increment CP-WS-01A — frontend shell (IMPLEMENTED, live deployment pending acceptance)

Changes on `main`:

- `frontend/workspace-ui.js` renders a signed-context **workspace selector** replacing the static sidebar workspace label.
- Searchable **Recent workspaces** dropdown, **Browse all** dialog, search and **All/Recent/Owner/Member/Collaborator** category controls.
- **Add workspace** dialog with name and **Open/Closed** privacy input and client-side validation; button is explicitly **Review readiness**, not an unauthorized create operation.
- `frontend/workspace-ui.css` provides APSYNTRA-branded desktop/mobile dialogs and accessible focus, Escape and outside-click handling, reduced-motion compatibility.
- `frontend/app.js` wires the sidebar/topbar entry point, preserves central auth, and clears workspace overlays on sign-out/session expiration.
- `index.html` loads the styles, and `scripts/pages-smoke.mjs` requires the new JavaScript and CSS assets on Pages.

**Security boundary:** the frontend currently shows only `workspaceCatalog({id: context.workspace_id, name: workspaceName()})` from the verified existing `DomainApi.context()`. It never reads other workspace identifiers, runs a workspace mutation RPC, persists a second workspace, or presents an unverified owner label. Owner/collaborator filters correctly return no claims until the backend has a real workspace-role model. The create review cannot write production data.

Explicit disabled gates: `WS01_DISCOVERY_ENABLED=false`, `WS01_CREATION_ENABLED=false`, `WS01_SWITCHING_ENABLED=false`.

## Increment CP-WS-01B — server-authorized discovery contract (STAGED, NOT ACTIVATED)

- `sql/cp-ws01-discovery-activation-candidate.sql` stages `public.wm_ws01_list()` returning only the real actor's active memberships and workspace names.
- Requires live `auth.uid()`, existing `private.wm_board_config_session_active()`, active profile, and active membership; uses fully qualified table references and a restricted, authenticated-only EXECUTE grant.
- The candidate **was not executed in Supabase**. Its production EXECUTE grant is a production permission change requiring separate approval.
- `normalizeServerWorkspaceCatalog` validates exact actor/current-workspace correspondence and unique server-returned memberships. It exists for later integration; the browser does not call the staged RPC yet.

## Next backend work — not authorized for production activation

1. Add a well-defined workspace ownership/membership/collaboration model, including a privacy policy and invitation/admission mechanism. Separate workspace owner from platform bootstrap admin; do not use editable user metadata for permissions.
2. Implement an account-authorized creation transaction with workspace name uniqueness/validation policy, initial owner membership, audit, idempotency, and rollback.
3. Implement **session-bound** authoritative workspace selection. Validate current `auth.sessions`, active target membership, and server-side current-workspace scope. Keep no arbitrary workspace override in HTTP headers, local storage, user metadata, or caller-controlled JWT claims.
4. Audit every consuming module and board RPC for cross-workspace safety. Update platform-sync cache keys, board list/detail access, attendance/finance/TradeLink projections, files, activities and subscription scopes on switches. Establish revocation, concurrent session and data-isolation acceptance.
5. After staged disposable database tests and separate production approvals, activate read discovery, creation and switching one gate at a time. Run actual signed-user Pages acceptance under primary and foreign workspace memberships.

## Evidence and classification

- Focused JavaScript source-replay regression assertions: **9/9 PASS**, validating no foreign disclosure, safe search/filtering, names/HTML escaping, privacy form validation, signed RPC normalization, and disabled mutation/creation paths.
- GitHub Pages full frontend CI, live interactive browser UX, and deploy asset check: **PENDING separate verification**.
- Production schema or permission changes for CP-WS-01: **NONE**. Only read-only catalog/security inspection was performed.
- **Overall CP-WS-01: PARTIALLY IMPLEMENTED**. The selector and browse/create review UI exist; genuine multi-workspace discovery, creation, ownership, privacy and switching remain blocked on server contracts and separate activation approval.

## CP-WS-01B — Server-authorized lifecycle contracts (2026-11-05)

**Classification:** IMPLEMENTED IN SOURCE — DISPOSABLE POSTGRESQL CI PENDING INDEPENDENT RESULT — PRODUCTION NOT ACTIVATED. The prior signed-context sidebar remains read-only. No production workspace, membership, role, grant, schema or record mutation was made.

### Actual production readiness evidence

Read-only SQL from `sql/tests/cp-ws01b-production-readiness.sql` was executed against existing Supabase project `jtlusodorfnyzgyuewkz` and returned
`SCHEMA_PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_REQUIRED`.

- All existing `public.workspaces`, `public.workspace_members`, `public.profiles`, `auth.sessions` and existing active-session guard prerequisites exist.
- `auth.sessions.id` has a primary key; previously staged WS01 tables and RPCs remain absent.
- Direct authenticated workspace-table SELECT/INSERT privileges remain denied.
- Existing workspaces: **2**; active membership rows: **40**.
- `public.current_workspace_id` is referenced by **62 database function definitions**, so switching is a cross-platform authorization change. No central function was replaced in production.

This preflight does **not** demonstrate that migration candidates compile or pass runtime acceptance on the real installation. It is a compatibility inventory only.

### Staged server contract (no production DDL executed)

1. `sql/cp-ws01b-lifecycle-contract-candidate.sql`: private, RLS-enabled `ws01_workspace_policy`, `ws01_member_roles`, `ws01_create_requests`, `ws01_session_choices`, `ws01_lifecycle_flags` and `ws01_events`. The default owner and privacy of legacy workspaces are deliberately **not inferred**: a missing role is `member`, and a missing policy is `closed`. Existing records and memberships are preserved.
2. `sql/cp-ws01-discovery-activation-candidate.sql`: `public.wm_ws01_list()` lists **only active memberships of the real signed caller**, with server-owned `owner/member/collaborator` relation and privacy fields. Requires an active profile, a live GoTrue session and an existing active workspace. Direct table grants remain denied. The `authenticated` RPC EXECUTE grant exists **only in the unexecuted candidate file**.
3. `public.wm_ws01_create(name,privacy,requestId)`: transactionally inserts a new workspace, active owner membership, closed/open privacy policy, server role assignment, idempotency receipt and audit event. Serializes same-user claims by profile-row lock. An identical request is idempotent; altered replay fails. Creating a workspace **does not implicitly switch** the caller's active workspace. The RPC has no authenticated EXECUTE grant, and `creation_enabled=false` by default.
4. `sql/cp-ws01b-session-cutover-candidate.sql`: **SEPARATE HIGH-RISK GATE**. Stages a session-scoped `current_workspace_id` replacement, `public.wm_ws01_select(target,expected)` with stale-context CAS, per-GoTrue-session row lock, signed target-membership verification, and a trigger that deletes selections when a membership is revoked. Current-workspace behavior remains unchanged while `selection_enabled=false`; the select RPC is not granted to authenticated users. This file is **not** authorized for production execution.

**Open/Closed semantics currently enforce conservative non-disclosure.** `open` is recorded as privacy metadata but cannot expose a workspace to, or automatically admit, an unrelated account without a verified shared account/organization boundary and an independently reviewed join/invitation policy. An Open workspace is **not** globally public.

### Client contract and automated test staging

- `frontend/workspace-lifecycle-client.js` adds signed identity checks, strict server receipts, exact workspace CAS verification and a requirement to reread authoritative `wm_auth_access_context` after switching. The compile-time discovery/creation/switching flags remain **false**; existing UI does not invoke any new RPC.
- `frontend/workspace-ui.js` now validates a future server-issued `owner/member/collaborator` role and `open/closed` privacy without inventing privileges for the current legacy workspace.
- `frontend/tests/workspace-ui.test.mjs`: **10/10 source-replayed JS checks PASS**.
- `frontend/tests/workspace-lifecycle-client.test.mjs`: **6/6 source-replayed JS checks PASS**.
- `.github/workflows/cp-ws01b-disposable-postgres.yml` stages a **PostgreSQL 17 disposable database** with synthetic GoTrue users/sessions and runs `sql/tests/cp-ws01b-disposable-setup.sql`, both staged migration candidates, preactivation denial and postactivation signed acceptance **only in that disposable database**. The SQL assertions cover user/session revocation, foreign-workspace denial, permission/default-deny, scoped owner/collaborator discovery, idempotency, concurrent independent sessions, stale-CAS, membership revocation, privacy non-disclosure and audit.
- **Disposable PostgreSQL runtime outcome and current GitHub Actions checks: NOT VERIFIED HERE.** Do not treat source-replayed JavaScript assertions or a successful production preflight as a PostgreSQL runtime PASS. A green independently inspected disposable workflow run is required.

### Production activation decision gates (all PENDING separate approval)

| Stage | Required boundary |
| --- | --- |
| B0 — source/CI | Confirm disposable PostgreSQL 17 run succeeded; verify frontend CI and live assets |
| B1 — additive private schema | Separate approval for production schema/RLS/functions; prerequisite audit and backup evidence |
| B2 — read-only member discovery | Separate approval for `authenticated` read RPC grant; genuine signed-manager, nonmanager and foreign-membership tests |
| B3 — transactional creation | Separate approval for creation grant and activation flag; accepted name, owner, privacy, audit and idempotency checks |
| B4 — session-bound switching | Separate high-risk approval to replace `current_workspace_id`, create membership-revocation trigger and grant selection; assess all 62 affected functions and their board/module/storage/cache consumers |
| B5 — cross-workspace acceptance | Real signed cross-user and same-user two-session tests, revocation, expired sessions, cross-workspace board/document/attachment isolation, synchronization/cache invalidation and negative tests |

No separate Supabase project, second login, direct client table access, production test fixture, role bypass, or unverified workspace ownership will be introduced.

### Security-relevant caveats

- Workspace-level **owner** is independent of the existing APSYNTRA platform role. The existing backend platform-role ceiling must be reviewed for users who belong to more than one workspace; a global platform administrator must not gain unauthorized access by relying solely on a UI selection.
- Workspace switching affects data consumers beyond board lists: TradeLink, TimeTracker, FRT, 12 typed boards, file storage, realtime, audit and platform-sync state. The current source boundary must remain disabled until comprehensive authorization tests pass.
- The legacy primary-workspace behavior is untouched in production. This phase does not unblock CP-TL-03C's separate genuine foreign-workspace denial test, because the foreign workspace currently has no active member.
