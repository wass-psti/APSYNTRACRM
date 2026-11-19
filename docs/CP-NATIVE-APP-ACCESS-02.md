# CP-NATIVE-APP-ACCESS-02 — Native Startup Independence from Generic Board Catalog

**Date:** 2026-11-19

**Status:** Implemented locally; automated, syntax, lint, build, formatting, and TimeTracker fixture-browser checks pass. Pull request, CI, and deployment acceptance pending.

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

### Not yet verified

- A fresh browser-level synthetic wm_list_boards 403/503 injection against the new local build was not completed. It is not counted as a pass.
- The four native routes have not yet been re-accepted against this exact unmerged build under a synthetic catalog outage.
- Pull request CI, GitHub Pages deployment, and post-deployment acceptance remain pending.

## Acceptance criteria

1. With a signed active employee session and generic wm_list_boards returning 403/503, opening Overview completes and displays a catalog warning plus native application links.
2. With the same catalog failure, each of the four native routes reaches its native resolver and loads existing application data when the corresponding assignment is valid.
3. A direct generic board startup still treats a failed board catalog as fatal, matching the existing generic startup contract.
4. A changed signed user/workspace is rejected regardless of catalog fallback.
5. After the catalog recovers, refresh restores board discovery and clears the warning.
