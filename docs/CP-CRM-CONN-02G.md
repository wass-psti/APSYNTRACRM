# CP-CRM-CONN-02G — Four-Application Genuine Employee Acceptance

**Date:** 2026-11-19
**Status:** IMPLEMENTED-UNVERIFIED — final follow-up correction and production deployment pending
**Repository:** `wass-psti/APSYNTRACRM`
**Production:** GitHub Pages; existing Supabase project `jtlusodorfnyzgyuewkz`
**Main baseline:** CP-CRM-CONN-02G PR #578 merged; follow-up sync/context correction is under review

## Objective

Verify that a genuine signed employee can initialize the existing TimeTracker, Fund Tracker, FuelTrack+ and TradeLink native applications, resolve each exact canonical board context, and retrieve each application's existing domain data without relying on generic board-view access.

## Genuine employee identity

The browser acceptance used an already authenticated employee session. The visible session context confirmed:

- `Secure session`
- `Workspace member`
- The TimeTracker native resolver returned module role `Employee`; the other application roles were `REQUESTOR`, `User` and `User`.

No login was automated. No cookies, access tokens, local storage, session storage or credentials were read.

## Four-application results

| Application | Module role returned | Native resolver | Domain reads | Native UI |
|---|---|---:|---:|---|
| TimeTracker | `Employee` | HTTP 200 | Attendance capabilities and overtime snapshot: HTTP 200 | Attendance view and Start Session control visible |
| Fund Tracker | `REQUESTOR` | HTTP 200 | Bootstrap, dashboard and request list: HTTP 200 | Fund Tracker and New Fund Request visible |
| FuelTrack+ | `User` | HTTP 200 | Native request read: HTTP 200 | Dashboard and New Fuel Request visible |
| TradeLink | `User` | HTTP 200 | Assigned-document list: HTTP 200 | My Assigned Documents and Create New visible |

The native resolver returned the expected exact module ID, canonical board ID and current workspace context for every application:

| Module ID | Canonical board ID |
|---|---|
| `time-tracker` | `46bf4ee7-368a-4c35-842c-8593ea1f6ac3` |
| `fund-released-tracker` | `f36da8fe-8d9d-4629-9938-12533cb3ca39` |
| `fueltrack-plus` | `7af78b3f-67bf-4600-9aa1-9006d19d486e` |
| `tradelink` | `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` |

## Generic board dependency simulation

The initial read-only production pass confirmed native resolver and domain reads for all four applications. A stronger browser-only denial simulation exposed two background synchronization defects that did not appear during ordinary startup.

### Root cause 1 — native board classification during reconciliation

`reconcilePlatformSync()` originally identified a native application route using both the canonical board ID and the current route-tab key. During a background route/tab transition, the tab key could be transient, causing the canonical native board to fall through to generic board-view reconciliation.

**Correction:** `nativeApplicationModuleForBoardId()` now identifies the exact four canonical native boards independently of transient tab state. Native background reconciliation obtains and validates a fresh `native_application_board_context`, skips generic board-view checks, generic board-catalog refresh, generic board snapshots and generic board-layout reads, and retains best-effort edit/manage probes. Generic board routes retain their existing behavior.

### Root cause 2 — routine cache refresh cancelled signed context reads

`PlatformSync.onInvalidate` used `db.invalidateBoardCache()` for routine focus, visibility, reconnect and polling refreshes. A full board-cache invalidation also advanced `contextReadGeneration`, which could reject an overlapping `wm_auth_access_context` read with `Signed workspace context changed during loading.` during TimeTracker initialization. The RPC itself could return HTTP 200 while the in-flight client context was rejected.

**Correction:** `DomainApi.invalidateBoardCache()` now accepts an explicit `invalidateContext` option. Routine platform reconciliation invalidates board snapshots without cancelling a signed workspace-context read. Cross-tab context invalidation and explicit session/workspace reset behavior remain intact.

### Corrected generic-denial acceptance

A real signed employee browser session was used with the locally corrected frontend modules served on the production application origin. Playwright temporarily denied these generic board RPCs:

- `work_board_access`
- `wm_get_board_shell`
- `wm_get_board_items_page`
- `wm_board_ui_read`

The shared `wm_list_boards` workspace catalog was intentionally preserved: it supplies the CRM workspace shell/navigation and is not the per-board view permission under test.

All four applications passed under the temporary denial. Each native resolver returned HTTP 200, each expected application-domain read returned HTTP 200, all expected native interface controls remained visible, and no generic `work_board_access` view request was issued. Best-effort edit/manage probes returned simulated HTTP 403 and did not block native startup. JavaScript page errors and failed network requests were both zero.

This was a browser-only simulation against production-origin signed session state. The local frontend source was injected for the test and the generic RPC responses were overridden in Playwright. No Supabase policies, roles, memberships, application assignments, or production data were modified. Final acceptance must be repeated against the merged and deployed follow-up commit.

The earlier simulation also observed an HTTP 403 from the optional FuelTrack Activity `list_module_activity` RPC for the `User` module role. That separate issue was subsequently addressed by CP-CRM-NATIVE-04 (PR #575): non-Admin FuelTrack sessions no longer issue that predictably denied activity read. No permission policy was broadened.

## Runtime and data observations

- JavaScript page errors: **0**.
- Failed network requests: **0** in the unmodified production read-only pass.
- Unexpected HTTP errors: **0** in the unmodified production read-only pass.
- Generic board-view requests during native app routes: **0** under the temporary denial simulation.
- Simulated generic edit/manage denials: non-blocking; native startup and domain reads remained available.
- Missing canonical board errors: **0**.
- Native domain reads: **all expected RPCs returned HTTP 200**.
- Several employee-scoped lists returned zero records (attendance sessions, fund requests, fuel requests and assigned TradeLink documents). These are the observed results for this account's current scope, not evidence of missing board initialization.

The test inspected workflow entry controls but did not click them or submit forms. No attendance session, fund request, fuel request, TradeLink document, approval, or other business record was created or changed.

## Reproducible acceptance

The reusable read-only script is:

```bash
node scripts/cp-crm-conn-02g-employee-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:9225
```

To repeat the ephemeral generic board-access denial simulation:

```bash
node scripts/cp-crm-conn-02g-employee-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:9225 \
  --simulate-generic-denials
```

The script accepts an already signed employee application tab, confirms the TimeTracker module role is `Employee`, and does not automate authentication or submit business writes. The generic-denial mode deliberately preserves the shared `wm_list_boards` workspace catalog while denying per-board view/shell reads.

## Scope and closeout

- No application assignments or role values changed.
- No workspace or board memberships were created or changed.
- No replacement boards were created.
- No generic board permission policies were changed.
- No production business data was written.
- Existing native domain workflow entry points are visible and their read paths work for the tested employee session.

**Current result:** Standard production read-only startup passed for all four applications. The follow-up correction also passed a four-application production-origin browser simulation with generic per-board view/shell RPCs denied. Final acceptance against the merged and deployed follow-up commit remains pending. Production write/transaction acceptance remains outside this read-only runtime milestone because it would create or alter real business records.
