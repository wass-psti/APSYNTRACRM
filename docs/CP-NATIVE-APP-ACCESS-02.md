# CP-NATIVE-APP-ACCESS-02 — Native Startup Independence from Generic Board Catalog

**Date:** 2026-11-19

**Status:** IMPLEMENTED, MERGED, AND DEPLOYED. Automated verification and live Pages asset integrity pass. Fresh signed-employee browser acceptance under a synthetic board-catalog outage remains pending.

**Base:** Current origin/main after CP-NATIVE-APP-ACCESS-01 and subsequent merged work.

**Scope:** Frontend startup resilience only. No database migration.

## Problem

The CP-NATIVE-APP-ACCESS-01 resolver allows the four native applications to resolve their canonical board contexts without generic board-view permission. However, the shared refreshWorkspace() bootstrap still treated wm_list_boards as a mandatory read through readWorkspaceStartup().

Consequently, a temporary generic board-catalog failure could abort workspace startup before the application-specific resolver was reached. This left native application links unavailable even when the signed user had a valid active workspace and application assignment.

## Implementation

### Route-scoped catalog fallback

Added workspaceRouteAllowsBoardCatalogFallback() to the native application route module.

Fallback is enabled only for:

- Empty/default route and #/overview, so the workspace shell can start and expose native application links.
- #/time-tracker
- #/fund-tracker
- #/fueltrack and its subroutes
- #/tradelink and its subroutes

Generic board routes, Settings, FM1, Security, Foundation, and other routes do not receive this fallback.

### Workspace startup read contract

readWorkspaceStartup() now accepts an explicit allowBoardListFailure boolean.

- Default remains false; generic board startup continues to reject board-catalog failures.
- When explicitly true, a board-list error produces an empty board list and returns the original error as boardCatalogError.
- Bootstrap-role verification remains independent and fail-closed.
- Signed user/workspace identity is still revalidated after both reads. A changed identity or workspace still rejects startup.
- This is a discovery-availability fallback only. It does not grant a board role, application assignment, workspace membership, or domain capability.

The four native application routes continue through their existing signed canonical resolver and application-specific data contracts.

### Degraded-state UX

When the generic catalog is unavailable:

- Overview displays an explicit catalog-unavailable notice while retaining native application navigation.
- The sidebar identifies the catalog as unavailable instead of reporting that no boards exist.
- My Boards shows a catalog-unavailable state and a retry action.
- Refresh feedback distinguishes successful native startup from a still-unavailable generic catalog.
- A successful later catalog read clears the warning and restores the normal board list.

## Adjacent CI test-harness correction

The current-main CP-CRM-NATIVE-04B read-only preflight script previously imported Playwright before validating its required loopback CDP argument. CI workflows that run only the no-argument contract without browser dependencies therefore exited with a module-load error instead of the expected argument-validation status.

The script now loads Playwright dynamically only after a valid loopback CDP endpoint is supplied. Its no-argument contract was verified from an isolated temporary directory without access to the repository's node_modules, and the source test guards against reintroducing the eager import.

## Explicitly unchanged

- No Supabase migration or production database mutation.
- No changes to authentication, workspace membership, module assignments, application roles, board roles, RLS, or grants.
- No board creation, replacement, deletion, or ID changes.
- No change to generic board permission semantics.
- Generic board routes still fail when their required catalog read fails.

## Verification

| Check                                                   | Result                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| Full frontend regression                                | **2,790 / 2,790 passed**                                             |
| npm run check                                           | PASS                                                                 |
| Targeted ESLint on all changed JavaScript modules/tests | PASS                                                                 |
| Repository npm run lint                                 | PASS                                                                 |
| Production npm run build                                | PASS                                                                 |
| Repository npm run format:check                         | PASS for its configured file set                                     |
| TimeTracker fixture browser acceptance                  | PASS; existing views, responsive layouts, and WCAG 2.2 AA axe checks |
| git diff --check                                        | PASS                                                                 |
| No database migration                                   | Confirmed; no migration files changed                                |

Build output retains existing warnings:

- frontend/startup-guard.js is a classic script and is not bundled as a module.
- The main application and PDF engine chunks exceed the configured 500 kB warning threshold.

### Merge, CI, and deployment evidence

- **PR #582 merged** into main as merge commit ec10d74d071d2185b956f007250d351e03387a98.
- The post-merge GitHub Pages deployment **run 44462709637 succeeded**.
- The subsequent main deployment for commit 4569fc67d7d1d88a4b4480c51c45cc6f7299a227 **run 44463148620 succeeded**.
- The latest frontend validation **run 44463149640 succeeded**. Its frontend job completed **2,800 / 2,800 tests**, with zero failures.
- The same validation's live-pages job passed **Verify live GitHub Pages assets match this main commit**.
- Live static-asset inspection returned HTTP 200 and confirmed the deployed native-application-access.js and app.js contain the route-scoped fallback implementation.
- Local verification on the implementation branch: npm test **2,774 / 2,774 passed**; npm run check, npm run lint, npm run format:check, npm run build, and git diff --check all passed. The build retains the existing large-chunk warning (PDF engine and main application bundles exceed 500 kB).

### Remaining production acceptance

- A fresh browser-level synthetic wm_list_boards HTTP 403/503 injection across Overview and all four native application routes has **not** been completed against a genuine signed employee session. It is not counted as a pass.
- The corresponding generic-board fail-closed behavior is covered by unit tests: a generic route still rejects a failed board catalog, while the explicitly enabled Overview/native fallback returns an empty catalog plus the original error.
- Production browser acceptance must verify the same signed employee session reaches each native resolver and application-domain reads while the generic catalog is unavailable, then verify catalog recovery clears the degraded-state notice. No production writes or permission changes are required for this read-only test.

### Acceptance status

- Implementation: **VERIFIED**
- Automated regression and build: **VERIFIED**
- Merge and production deployment: **VERIFIED**
- Live Pages asset integrity: **VERIFIED**
- Genuine signed-employee synthetic catalog-outage browser acceptance: **PENDING**

## Acceptance criteria

1. With a signed active employee session and generic wm_list_boards returning 403/503, opening Overview completes and displays a catalog warning plus native application links.
2. With the same catalog failure, each of the four native routes reaches its native resolver and loads existing application data when the corresponding assignment is valid.
3. A direct generic board startup still treats a failed board catalog as fatal, matching the existing generic startup contract.
4. A changed signed user/workspace is rejected regardless of catalog fallback.
5. After the catalog recovers, refresh restores board discovery and clears the warning.
