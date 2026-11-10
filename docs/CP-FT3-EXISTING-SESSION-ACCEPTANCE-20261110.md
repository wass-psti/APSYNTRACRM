# CP-FT3-EXISTING-SESSION-ACCEPTANCE — Live Evidence

Date: 2026-11-10 (Asia/Manila)
Repository: wass-psti/APSYNTRACRM
Branch: feat/fueltrack-backend-core-20261109
Draft PR: #185
Project: existing WatchdogWorkspace Supabase project jtlusodorfnyzgyuewkz
Board: 7af78b3f-67bf-4600-9aa1-9006d19d486e
Workspace: 00000000-0000-4000-8000-000000000001

## Decision

**PARTIAL PASS — Admin signed read-only acceptance verified. Full release remains NO-GO.**

A genuine existing Admin browser session was used in the existing Chromium tab.
The session remained in the browser; its access token was used only in page
memory and was never displayed, copied, logged, transmitted to another host,
or returned in the report. The session identity and access token were
unchanged after the probes.

No production records, user accounts, permissions, roles, Storage objects,
migrations, or deployment state were changed.

## Live existing Admin acceptance

The browser-side read-only probe returned
SIGNED_READ_ONLY_ACCEPTANCE_PASS with these actual provider responses:

- Supabase Auth /auth/v1/user matched the existing session identity.
- wm_auth_access_context returned the expected existing workspace and
  same signed user.
- work_board_access granted view for the exact FuelTrack Board.
- fueltrack_v3_read returned VERIFIED_READ, role Admin, exact Board
  and workspace scope, and zero visible request rows.
- fueltrack_v3_analytics returned VERIFIED_READ with the expected
  Board/workspace scope.
- fueltrack_v3_audit_read returned a correctly scoped Admin audit result.
- A fresh random non-existent Board ID was denied by the signed read RPC.
- Fresh random non-existent request IDs were denied by both
  fueltrack_v3_receipt_read and fueltrack_v3_receipt_prepare.
- Anonymous fueltrack_v3_read and receipt metadata read were denied.
- Direct authenticated REST table reads were denied for all three
  FuelTrack tables: requests, receipts and audit events.
- The browser session remained unchanged after all checks.

No request, receipt, audit or Storage mutation RPC was called.

## Live database and Storage inventory

Read-only Supabase SQL/catalog inspection independently confirmed:

- Both production migrations are present in migration history:
  20261110021141 fueltrack_v3_backend_core and
  20261110021200 fueltrack_v3_board_receipts.
- FuelTrack Board remains active in the expected workspace with one group.
- Current counts: requests 0, receipts 0, audit events 0,
  Board items 0, FuelTrack Board Storage objects 0.
- All three FuelTrack tables have RLS enabled.
- anon and authenticated have no direct SELECT/INSERT/UPDATE/DELETE
  privileges on those tables.
- All 15 FuelTrack v3 functions use an empty search_path.
  Anonymous EXECUTE is denied for every function. Ten intended public
  domain RPCs grant EXECUTE to authenticated; internal guard/trigger/
  validation helpers do not.
- Audit immutability and Board-link transition triggers are enabled.
- work-board-files is private (public=false) with a 20 MiB bucket cap.
  Its existing Storage SELECT/INSERT/DELETE policies are restricted to
  authenticated and enforce Board/item access. Option A is unchanged.

### Actual Storage endpoint probes

- Signed Board-prefix list request: HTTP 200, zero visible objects.
- Anonymous Board-prefix list request: HTTP 200, zero visible objects.
  This empty-list response is not treated as proof of denial; RLS may
  simply filter all rows when no matching object exists.
- Anonymous public-object GET against a fresh random path: HTTP 400,
  Bucket not found (the bucket is private).
- Signed authenticated-object GET against a fresh random path: HTTP 400,
  Object not found.
- No object was created, downloaded, signed, registered or deleted.

The signed list and private-bucket checks do not establish positive
binary receipt access. There is no existing FuelTrack receipt object.

## Security Advisor interpretation

The current Supabase Security Advisor reports generic
authenticated_security_definer_function_executable warnings for the
intended FuelTrack v3 RPCs and two existing legacy FuelTrack module-state/
activity functions. The v3 RPCs deliberately use SECURITY DEFINER because
direct table privileges are revoked; the inspected v3 functions use an
empty search path and the domain entry points enforce the FuelTrack
workspace, module role, exact active Board and Board access guard.

The Advisor also reports rls_enabled_no_policy INFO findings for the
three FuelTrack tables. This is consistent with the RPC-only design:
direct table privileges are revoked from both API roles, so no direct
table policy is intended. No blanket function grant/revoke or RLS policy
change was made. The two legacy RPC warnings are outside this v3 acceptance
and must not be silently altered as part of this release.

## Remaining gates

1. Existing standard User session: run the same browser-side signed
   acceptance while authenticated as an existing standard FuelTrack User.
   Verify own-request scope, analytics, Admin audit denial, wrong-Board
   denial and unknown receipt read/prepare denials. No User session was
   available in the accessible active Chromium tab during this execution.
2. Positive transactional lifecycle: no FuelTrack request exists.
   Therefore submission, idempotent retry, Admin approval, refueling,
   completion, Board-item synchronization, audit persistence and
   refresh/session persistence could not be exercised against a real row.
3. Private binary receipt E2E: receipt preparation requires an existing
   Admin-authorized request in refueling_done or completed state.
   No eligible request or receipt object exists. Actual JPEG/PNG/WebP
   upload, metadata registration, signed retrieval, MIME/size/path denial
   and post-refresh retrieval remain pending.
4. Protected frontend release: the deployed GitHub Pages app does not
   yet contain the feature-branch read-only preflight control. The new
   same-session implementation is still on draft PR #185. Keep it draft
   until the remaining signed acceptance and CI checks pass.

Creating a production request, completing a production workflow, or
uploading a test receipt would create production data. Those operations
were deliberately not attempted; they require separate explicit approval
or an already-existing eligible business record. Do not create test users,
synthetic JWTs, or production fixtures.

## Code and CI changes in this increment

- frontend/fueltrack-v3-signed-preflight.js now verifies the Auth user
  through the same in-page AuthClient used by DomainApi, enforces that
  DomainClient and RPC transport share one AuthClient, checks route/session
  continuity after every await, and verifies denial for wrong-Board,
  unknown receipt-read and unknown receipt-prepare probes.
- frontend/app.js supplies the route-continuity predicate.
- frontend/tests/fueltrack-v3-signed-preflight.test.mjs covers Admin and
  User paths, identity mismatch, AuthClient mismatch, context changes and
  fail-closed denial behavior.
- The APSYNTRA frontend workflow now includes this feature branch in its
  push validation branch list. This triggers the full frontend regression
  suite without triggering the main-only Pages deployment job.

## Local verification in this increment

- Full frontend regression after mainline integration: 1,608/1,608 PASS.
- Focused FuelTrack signed-preflight tests: 7/7 PASS.
- FuelTrack signed-runner and release-readiness tests: 16/16 PASS.
- Disposable PostgreSQL FuelTrack backend/Board/receipt acceptance:
  FT3_DISPOSABLE_ACCEPTANCE_PASS.
- All shipped frontend JavaScript syntax checks: PASS.
- GitHub Pages source/CSP/public-key validation: PASS.
- Legacy FRT read-consumer guard: PASS.
- CSS bundle consistency after mainline integration: 41 source files, 835,837 bytes, up to date.
- git diff --check: PASS.

The frontend workflow includes this feature branch in its push trigger.
GitHub Actions workflow #1173 completed SUCCESS after mainline integration:
frontend, disposable PostgreSQL, disposable collaboration PostgreSQL and
disposable overtime PostgreSQL all passed. The main-only live-pages deployment
job was skipped, as expected for a feature branch.

## Mainline integration

The feature branch was integrated with mainline commit 4cafe53 (Material
Request Hub tracker and Priority 5 updates). The only merge conflict was
frontend/app.js. The resolution preserved both the mainline Material Tracker
route/state and FuelTrack backend/preflight state/renderer. The merged
frontend suite passed 1,608 tests. PR #185 is conflict-free
(GitHub mergeable_state=clean) but remains open and draft. No production
release or merge into main was performed.

GitHub branch-protection inspection returned HTTP 403
(Resource not accessible by integration). Required branch rules therefore
could not be independently verified through the current GitHub connection;
no claim of verified branch protection is made.

## Classification

| Requirement | Status |
|---|---|
| Existing Admin Auth identity and workspace | VERIFIED |
| Admin signed read, analytics and audit | VERIFIED |
| Wrong-Board and unknown receipt denial | VERIFIED |
| Anonymous RPC denial and direct table denial | VERIFIED |
| FuelTrack table RLS, direct grants and RPC catalog | VERIFIED |
| Private bucket metadata and policy inventory | VERIFIED |
| Anonymous public-object path denial | VERIFIED |
| Existing User signed session | PENDING |
| Real request lifecycle and Board persistence | PENDING — no records |
| Private binary receipt upload/retrieval | PENDING — no eligible request/object |
| Protected frontend deployment | PENDING |

**Release decision: NO-GO.** Do not merge or deploy PR #185 until the
standard User session, real transactional lifecycle and positive private
receipt binary acceptance are evidenced.
