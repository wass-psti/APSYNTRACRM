# CP-WS-01C/B3 — Controlled per-user workspace creation handoff

**Evidence date:** 2026-11-06. **Production-connected project:** existing WatchdogWorkspace `jtlusodorfnyzgyuewkz`. No other Supabase project or test accounts required.

**Scope:** Replace the passive "Draft validated" UI as an application feature **only after** reviewed server-side creation authorization. Implement and verify creation flow behind default-off controls; do not execute SQL or enable privileges without the separate production approval. Preserve board/TimeTracker/TradeLink permissions, current workspace, and existing 40 active memberships.

## 1. Verified cause and current live security state

Read-only production checks confirmed:

- `public.wm_ws01_create(text,text,uuid)`: **absent**.
- `private.ws01_lifecycle_flags.creation_enabled`: **false**; workspace selection remains disabled.
- Six private workspace lifecycle tables exist with RLS enabled and no direct client grants.
- `public.wm_ws01_list()` is signed caller-only and existing.
- Existing workspace count: **2**; active membership count: **40** (inventory time).
- Existing private create-request and lifecycle event rows: **0** (inventory time).
- Existing tables and membership required columns match the staged SQL creation candidate.

**Authoritative preflight:** `sql/tests/cp-ws01c-b3-production-readonly-preflight.sql` returned
`B3_PREACTIVATION_SCHEMA_READY__ROLE_CEILING_AND_PRODUCTION_APPROVAL_PENDING`.
No production SQL, roles, RLS/grants, account, session, workspace or member records were changed during inspection.

## 2. Implemented frontend source (production default-OFF)

- `frontend/workspace-ui.js` now implements an actual conditional creation submit path, reusing the existing modal design, input validation, and **Closed** privacy default. The dialog continues to display **Validate draft** and the server-activation explanation while `WS01_CREATION_ENABLED=false`.
- When separately enabled, the action becomes **Create workspace** and uses only the injected signed `WorkspaceLifecycleClient`; it does not fetch privileged credentials, build its own JWT, trust arbitrary workspace selectors or insert directly into tables.
- A cryptographically random per-draft UUID is generated once and reused for retries. Changed drafts receive new IDs; double submits are suppressed; ambiguous timeout responses retain the original ID for safe idempotent retry.
- `frontend/workspace-lifecycle-client.js` already calls `public.wm_ws01_create` under a verified GoTrue actor, active workspace, and stable pre/post context, then validates the exact server creation receipt.
- Browser feedback differentiates invalid input, not-authorized/not-deployed, expired session, request conflict, unconfirmed network result and a positive owner receipt. A success explicitly states that the current workspace was **not** switched. Raw server error/credentials/IDs are not displayed.
- `frontend/app.js` injects its existing `AuthClient` and `DomainApi` into the workspace UI. **With the flag OFF, no creation RPC is issued.**

## 3. Existing server-side creation candidate

`sql/cp-ws01c-b3-create-contract-candidate.sql` is a **disposable-tested/default-off contract**, not a production migration that can be silently applied. It requires a real signed and active `auth.sessions` row, verified nonanonymous user, active profile and established membership, and `creation_enabled=true` before it creates any workspace.

The transaction atomically creates a public workspace, active membership, private workspace privacy metadata, **workspace-local** owner role, idempotency request receipt and audit event. It serializes per-actor requests on the profile row and returns `active:false` so B4 switching cannot be bypassed. It does not grant platform admin, auto-join other users or allow unrestricted discovery via Open metadata.

The SQL function is `SECURITY DEFINER`, so **its function owner, complete body, search_path, default EXECUTE grants, and session/RLS boundary require a dedicated independent review** before a direct `authenticated` grant. Supabase database advisors warn that authenticated-callable SECURITY DEFINER functions can be high risk. Do not weaken or bypass RLS to achieve functionality.

## 4. Staged activation and rollback candidates (NOT EXECUTED)

1. **Preflight:** run read-only source and catalog checks, verify source against peer-reviewed immutable version and inspect backup/recovery state.
2. **Dormant function installation:** in a separately approved production change window, execute the reviewed creation candidate **with no client EXECUTE grant and creation flag FALSE**; re-run read-only postconditions.
3. **Controlled activation:** only after an additional explicit approval, apply `sql/cp-ws01c-b3-controlled-production-activation-candidate.sql`. Its fail-closed transaction checks the required private RLS tables, existing signed discovery, disabled B4, no anomalous grants, then atomically grants only `EXECUTE` on the dedicated creation RPC to `authenticated` and sets `creation_enabled=true`. No direct INSERT grants.
4. **Frontend activation:** only after the live backend and authorized genuine-user negative tests, change `WS01_CREATION_ENABLED` from `false` to `true` in a dedicated reviewed frontend commit and deploy under normal GitHub Pages protections.
5. **Rollback:** `sql/cp-ws01c-b3-controlled-production-disable-candidate.sql` removes the authenticated function EXECUTE grant and sets creation flag FALSE, without deleting records or downgrading any RLS. Revert the one-line frontend flag if needed.

The two staged SQL scripts are **not automatically executed** by the frontend, GitHub Pages, or the connected Supabase tool. Disposable tests are run only on database `workspace_disposable`, which is isolated from the production project.

## 5. Mandatory genuine-session acceptance after approval

- **Happy path:** one previously verified, active legitimate user submits one approved workspace name and privacy; observe a unique, valid owner receipt and public workspace/private policy/member/audit records through authorized, read-only diagnostics.
- **Idempotency/concurrency:** exact request retry yields the same workspace; conflicting payload for the same key is rejected; concurrent requests do not duplicate membership, audit or workspaces.
- **Session denial:** anonymous, expired, revoked, mismatched JWT session ID, unverified or disabled profile, and removed membership all fail with **no write**.
- **Isolation/role ceiling:** a distinct signed foreign user cannot read or switch into the new closed workspace, cannot obtain a platform-level role, and the creator cannot access foreign records merely by being a workspace owner.
- **No silent switch:** the original active workspace remains authoritative; B4 switching is separately controlled, and creation must not imply broad membership discovery.
- **Privacy:** Open and Closed have explicit server-side meaning. Open remains metadata-only until discovery/admission authorization contracts are deployed; it is not a public-join toggle.
- **Recovery:** rollback disables new creation, preserves already committed records, restores signed session behavior, and leaves user-visible feedback nondeceptive.

**Important:** A synthetic PostgreSQL/CI PASS or a successful build does not establish signed-user production acceptance. Do not manufacture test accounts or alter roles to satisfy criteria.

## 6. Evidence and authorization decision

Stage outcomes are tracked independently:

| Requirement | Status |
| --- | --- |
| Production cause and private schema baseline | **VERIFIED — read-only catalog** |
| Guarded UI, signed client injection, receipt/idempotency/error handling | **IMPLEMENTED — default-OFF** |
| Disposable PostgreSQL creation + activation/rollback tests | **VERIFIED — disposable PG17 only** |
| Production dormant RPC installation | **PENDING separate approval** |
| Authenticated creation grant + lifecycle flag | **PENDING separate approval** |
| Frontend enablement and genuine signed creation acceptance | **PENDING** |
| Independent cross-user/foreign-table RLS and B4 selection | **Separate gates; not waived** |

**Verified CI:** [Workspace-controlled UI regression 42182676274](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42182676274) **SUCCESS**, 29/29 focused and 1,087/1,087 frontend tests. [Disposable PG17 lifecycle 42182676301](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42182676301) **SUCCESS**, 41/41 UI contracts, 44/44 trusted backend tests and the marker `CP_WS01C_B3_CONTROLLED_DISPOSABLE_ACTIVATION_AND_ROLLBACK_PASS`. The later PR-head CI also passed focused create-modal, B3 signed HTTPS and genuine-negative synthetic integration. These successes are not production authorized creation acceptance.

**Explicit production authorization needed:** separately approve installation of the reviewed B3 workspace creation functions; the single authenticated EXECUTE grant and creation lifecycle flag; and genuine signed creation of one real workspace for acceptance, each with rollback and no other role/RLS/grant/domain changes. A request to repair this modal or a generic development authorization does not itself approve those security-sensitive production changes.
