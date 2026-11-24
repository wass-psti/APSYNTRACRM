# CP-APP-LOAD-01 — Frontend Startup and Application Read Deduplication

## Objective

Reduce avoidable serial waits and repeated signed reads in APSYNTRA CRM startup and native TimeTracker opening, without changing the application architecture, Supabase schema, RPC contracts, authorization policy, or application behavior.

## Implementation

### 1. Application-list startup fan-out

frontend/workspace-startup-read.js now supports an optional third independent signed read, verifyAdmin.

After the authoritative workspace context has been loaded, readWorkspaceStartup() starts these reads together:

- Active board catalog (wm_list_boards).
- Bootstrap identity classification (apsyntra_role_is_bootstrap).
- CRM Admin classification (apsyntra_role_is_admin).

Each role verifier retains its existing fail-to-false behavior. The board catalog retains its existing fatal/degraded handling. The helper checks the signed user/workspace after all reads complete before returning results.

frontend/app.js now consumes the combined result instead of awaiting CRM Admin verification after the board catalog and bootstrap reads. The startup performance trace records the new admin-role stage.

The signed workspace context remains the prerequisite and is not moved into the parallel fan-out.

### 2. Board preference hydration overlap

loadBoard() now starts the independent board reads immediately. It starts local IndexedDB layout hydration only after the existing signed board-view check has returned successfully, then awaits the outstanding server reads and preference hydration together.

This changes the critical path from:

server reads → local preference hydration

to:

server reads + view check → local preference hydration overlaps remaining server reads

The existing 1,200 ms preference deadline, scoped key, payload validation, and storage fallback remain unchanged. A route-sequence check prevents starting hydration for a route that has already been superseded.

### 3. TimeTracker native-context reuse

The existing private.native_application_board_context(text) implementation already checks active workspace membership, has_module_access, the module role, and the canonical active board. Its normalized frontend result is bound to the signed user and workspace.

TimeTrackerNativeClient.access() now uses that canonical resolver as its access source instead of separately issuing a second api.context() read and a duplicate has_module_access RPC.

When the initial TimeTracker route already has a normalized native context, loadBoard() passes it into loadTimeTracker() and the first TimeTracker snapshot. The existing data-layer normalizer validates the resolver contract and canonical board metadata. The TimeTracker client then verifies the module actor, workspace and board identity before reusing that result.

The final signed identity/workspace rechecks remain in place. The TimeTracker directory read, attendance state read, capability reads, and existing data projections remain unchanged.

The existing background refresh path also reuses the native context it has just resolved rather than resolving it again for the TimeTracker snapshot.

## Files changed

- frontend/app.js
- frontend/workspace-startup-read.js
- frontend/time-tracker-native.js
- frontend/tests/workspace-startup-read.test.mjs
- frontend/tests/board-preferences-idb.test.mjs
- frontend/tests/time-tracker-native.test.mjs
- frontend/tests/cp-native-app-access-01.test.mjs
- frontend/tests/time-tracker-clock-recovery.test.mjs
- frontend/tests/time-tracker-map.test.mjs

## Preserved behavior and scope

- No Supabase migration or database write was introduced.
- No RPC signature or response contract was changed.
- No role, permission, RLS, workspace-isolation or authorization policy was changed.
- No new cache, polling loop, background worker, dependency or telemetry was introduced.
- Board catalog fallback behavior remains unchanged.
- The existing signed TimeTracker directory and final identity checks remain active.
- No gradient descent, backpropagation, model training, retraining, fine-tuning or parameter-update loop was introduced.

## Verification results

| Verification | Result |
|---|---|
| Full frontend test suite | PASS — 3,701 tests, 0 failures |
| TimeTracker-focused suite | PASS — 498 tests, 0 failures |
| Repository syntax and migration-manifest check | PASS — 222 recovered baseline and 89 forward migration files |
| Repository ESLint | PASS |
| Changed-file ESLint | PASS |
| Repository Prettier check | PASS |
| Production Vite build | PASS |
| Git diff whitespace check | PASS |
| Local Vite browser smoke | PASS — HTTP 200, startup guard HTTP 200, zero page errors, zero failed requests, zero console errors |

The browser smoke was unauthenticated and therefore verified module loading and the sign-in shell, not a signed user's Applications List or TimeTracker data. No production P50/P95 measurement has been claimed.

The production build emits existing nonfatal warnings for the non-module startup-guard script, the CSS host-context selector and large chunks. The GitHub Pages workflow verifies the source-tree deployment with pages-smoke.mjs; the Vite preview directory is not the Pages deployment artifact.

## Measured baseline and limits

Production Edge timings from the preceding investigation showed a mean of approximately 249 ms (P95 approximately 320 ms) for apsyntra_role_is_admin. Parallelizing it removes its serial position after the catalog/bootstrap fan-out; the actual user-visible saving depends on the concurrent request durations.

The TimeTracker regression tests verify that the initial route can reuse the native context and avoid the duplicate resolver and has_module_access reads. The existing identity/workspace rechecks remain.

Unit tests prove concurrency and request-count behavior. They do not prove a production browser P95 improvement or sustained Supabase CPU reduction. Signed browser acceptance and post-deployment production measurements are still required before claiming those outcomes.
