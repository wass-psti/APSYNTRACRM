# CP-FRT-SEC14 — Server-Side Restricted-Field Protection and Financial Action Authorization

**Date:** 2026-11-01 (Asia/Manila). **Repository:** `wass-psti/APSYNTRACRM`, direct `main`.

## Scope and authority

Build on SEC13's existing authenticated FRT Finance tab without introducing new roles, independent authentication, a new board, a new finance backend or production finance mutations. The existing `private.frt_current_role` session guard and centralized workspace role ceilings remain authoritative. Server eligibility previews are informational; the existing `frt_request_action` RPC remains the execution authority and is not called by the read-only UI.

## Canonical deliverables

- `sql/cp-frt-sec14-restricted-details-action-access.sql`: single additive `frt_restricted_request_detail(p_workspace_id uuid,p_request_id uuid)` function, authenticated caller and deployed role resolver required, validated workspace/request join, explicit allowlisted request metadata, and eight *server-computed* role-and-lifecycle workflow candidates tagged `SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY`. Explicitly excludes bank, recipient, requestor, amount, attachment, comment, nested liquidation/audit, and item values. Restricts execution of the new RPC to authenticated callers and revokes authenticated/PUBLIC/anon execution of the old `frt_get_request` in the same transaction.
- `frontend/frt-finance-workflow.js`: calls only `frt_restricted_request_detail`, validates signed caller/workspace/FRT role and current company access, validates backend server-preview schema and fails closed on inconsistencies; never calls financial mutation RPC.
- `frontend/frt-finance-ui.js`: displays only escaped, allowlisted request data and non-executable workflow eligibility.
- `frontend/tests/frt-finance-workflow.test.mjs`: verifies new server preview contract, denied or stale user/company/workspace, sensitive-field omission and absence of old broad detail and write paths.
- A superseded alternate SQL draft was removed from `main` to prevent conflicting function names or unintended migrations.

## Verified evidence

GitHub Actions [run #41293369004](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293369004), implementation commit `5a9159dc3c10e05a310a41d801fe2d6322084966`, completed **SUCCESS**, including frontend **222/222 PASS**, disposable PostgreSQL and live Pages checks. [Pages deployment #41293368957](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293368957) completed SUCCESS on that same implementation SHA.

Read-only production Supabase inspection after these commits: `public.frt_get_request(uuid,uuid)` remains callable by authenticated role; `public.frt_restricted_request_detail(uuid,uuid)` does not yet exist. Therefore **the new field-level server boundary is not deployed or production-verified**. Browser-side redaction does not prevent an authorized caller from receiving the broad old payload. Do not represent SEC14 as deployed or fully accepted.

## Eight acceptance gates

| Gate | State |
| --- | --- |
| Authoritative legacy request detail and workflow action rules inspected | VERIFIED |
| Server-side restricted-field and workflow preview migration authored | VERIFIED source |
| New authenticated-only RPC and legacy entry-point revocation scripted together | VERIFIED source |
| Existing frontend calls restricted RPC and checks signed role/workspace/company | VERIFIED by CI |
| Read-only workflow presentation and deny/stale/secret regression tests | VERIFIED by CI |
| Frontend, disposable PostgreSQL and Pages integration validation | VERIFIED |
| Controlled production migration and postactivation role/grant/redaction checks | PENDING — NOT DEPLOYED |
| Genuine signed operator read/denial and financial action authorization acceptance | PENDING — no finance writes executed |

**SEC14 development milestone: 6/8 gates verified = 75%**. Production field-level protection and finance execution authorization are not certified. CI07's earlier three administratively waived runtime gates cannot be treated as proof of these SEC14 gates.

## Next action and safety boundary

Controlled deployment requires independent compatibility verification for any existing consumers of `frt_get_request`, an exact predeployment schema/grant comparison, rollback and postdeployment checks, and review of actual signed actors. Revoking an existing production executable function is a material live access-control change; it can break other FRT clients and requires the separate production-change authorization exception. Do not run the migration or grant new financial mutation powers based only on successful mocked/browser tests. Preserve all production role assignments and financial records.


## SEC14 additional server-filtered board reads and controlled cutover (2026-11-01)

**Source reconciliation:** The canonical SEC14 detail contract is `public.frt_restricted_request_detail(uuid,uuid)` in `sql/cp-frt-sec14-restricted-details-action-access.sql`, already consumed by `frontend/frt-finance-workflow.js`. Do not deploy the superseded `frt_board_detail_safe` proposal or create a parallel finance authorization framework. The canonical migration atomically installs the restricted projection and revokes authenticated execution of legacy `frt_get_request`. It is still **not installed in production**.

**New complementary code staged directly on `main`:**
- `sql/cp-frt-sec14-board-safe-read-contracts.sql`: two additive, session-/role-ceiling-aware, `SECURITY DEFINER` functions with blank search paths and explicit authenticated-only grants. `frt_board_list_safe(uuid,text,text)` returns at most 100 entries with only UUID, workspace/company, voucher, title, date and lifecycle fields; `frt_board_dashboard_safe(uuid,text)` returns only five integer counts. Both exclude monetary figures, banking, employee/requester data and nested finance payloads **before HTTP serialization**.
- `sql/cp-frt-sec14-legacy-summary-list-cutover.sql`: later, separately controlled and *not executed* authenticated EXECUTE revoke for the older broad `frt_list_requests` and `frt_dashboard` RPCs, with preconditions proving both safe successors are callable. The canonical restricted-detail migration handles the old detail revoke separately.
- `sql/cp-frt-sec14-legacy-summary-list-rollback.sql`: emergency recovery of the legacy signed list/dashboard grants. This **re-exposes the former field surface** and is only an approved incident recovery fallback, not security-equivalent rollback. The canonical detail rollback remains separate.
- `frontend/frt-finance-readonly.js`: `secureContracts:true` issues **only** the new safe list/dashboard RPC calls with no automatic downgrade. Default remains `false` to preserve existing live FRT compatibility **until server activation, signed validation and coordinated cutover**. The already-implemented request detail path requires the canonical restricted RPC and does not downgrade.
- `frontend/tests/frt-finance-readonly.test.mjs`: positive secure-mode contracts and denial when secure endpoints are missing, without invoking legacy finance read endpoints.

**Disposable PostgreSQL acceptance:** The existing frontend workflow now creates isolated CI03 FRT tables, installs a disposable legacy-detail/list/dashboard grant fixture, executes the canonical restricted-detail cutover and additional safe board RPC migration, revokes the two legacy broad summary/list grants, and verifies authenticated grants, anonymous denials, workspace/caller isolation, restricted JSON key allowlists, amount and recipient exclusion, the eight informational finance-action branches, and unchanged finance row/audit totals. This is deliberately **isolated**, not a claim of production deployment. Initial tests uncovered a nonsecret voucher carrying a restricted-data sentinel and a malformed intermediate additive draft; both were corrected before the successful final run. All edits are recorded in repository history.

**Final CI source:** `5e2525b589e86f895af64aad04abf220511c6746`; [Frontend Validation run #41294205169](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41294205169): frontend, disposable PostgreSQL and live Pages jobs all SUCCESS. Earlier secure-client run [#41294039235](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41294039235) passed 224/224 tests. The current final CI additionally validates the staged SQL revocation; no production Supabase DDL was performed.

**Latest production read-only verification:** The live project has zero FRT requests, two existing FRT audit records, zero liquidations and ten RLS-enabled FRT tables. The private FRT signed-session guard remains installed. `frt_restricted_request_detail`, `frt_board_list_safe`, and `frt_board_dashboard_safe` are all absent; `frt_get_request`, `frt_list_requests`, `frt_dashboard` and existing financial action RPC are still executable by `authenticated`. Thus the SEC14 wire-level field secrecy boundary is **NOT ACTIVE IN PRODUCTION**. No user, role, permission or finance record was changed by this engineering work.

**Release order and material-risk boundary:** (1) reconcile all legitimate external legacy FRT consumers and get change-window approval for live EXECUTE revocations; (2) activate the restricted-detail and additive list/dashboard RPCs with guarded preflight and rollback; (3) deploy APSYNTRA board client with `secureContracts:true`, verify exact GitHub Pages assets and real signed nonbootstrap/GM read/denial behavior; (4) only once consumer compatibility is established, run the legacy summary/list revoke; (5) rerun read-only grants/metadata postchecks, sign-out/session-revocation and financial authorization negative checks in a controlled nonproduction environment, preserving production financial data. Production privilege changes and live finance write acceptance remain subject to separate change authorization and must not be inferred from isolated CI.

**SEC14 final scoped gates:** **6/8 VERIFIED (75%); 2/8 PENDING** — independent production activation/field-grant postchecks and genuine signed financial action acceptance. These gates do not inherit CI07's earlier waived tests.
