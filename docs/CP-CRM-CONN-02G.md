# CP-CRM-CONN-02G — Four-Application Genuine Employee Acceptance

**Date:** 2026-11-19
**Status:** IMPLEMENTED-UNVERIFIED — platform-sync correction implemented; final post-deployment acceptance pending
**Repository:** `wass-psti/APSYNTRACRM`
**Production:** GitHub Pages; existing Supabase project `jtlusodorfnyzgyuewkz`
**Main commit under test:** `8ab68c38bed074593091a18684b4fb390b901fa5`

## Objective

Verify that a genuine signed employee can initialize the existing TimeTracker, Fund Tracker, FuelTrack+ and TradeLink native applications, resolve each exact canonical board context, and retrieve each application's existing domain data without relying on generic board-view access.

## Genuine employee identity

The browser acceptance used an already authenticated employee session. The visible session context confirmed:

- `Secure session`
- `Identity: employee`
- `Workspace member`

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

The first browser-only simulation denied `work_board_access` and the four application routes remained available. A stronger simulation then denied generic board catalog, board shell, board item and board UI RPCs. That exposed a remaining Fund Tracker route failure: its background platform-sync path still used generic board reads and could redirect the native route back to My Boards.

### Root cause

`reconcilePlatformSync()` still applied generic board-view checks, active-board catalog refresh, `readVisibleBoardSnapshot()` and `BoardStructureClient.read()` to native application routes. The initial native route loader was already module-scoped, but a subsequent background/focus sync could reintroduce the generic board dependency.

### Corrective implementation

`frontend/app.js` now resolves the route's native module with `nativeApplicationModuleForBoardRoute()`. Native background refresh obtains a fresh `native_application_board_context` and verifies its module, signed user, workspace and canonical board. It skips generic board-view checks, generic board-catalog refresh, generic board snapshots and generic board-layout reads. Existing edit/manage probes remain best-effort and cannot block native startup. Generic board routes retain their existing behavior.

This was a browser-only simulation. It did not change Supabase policies, roles, memberships, application assignments or production data. The final full generic-denial pass must be repeated after this correction is merged and deployed.

The earlier simulation also observed an HTTP 403 from the optional FuelTrack Activity `list_module_activity` RPC for the `User` module role. That separate issue was subsequently addressed by CP-CRM-NATIVE-04 (PR #575): non-Admin FuelTrack sessions no longer issue that predictably denied activity read. No permission policy was broadened.

## Runtime and data observations

- JavaScript page errors: **0**.
- Failed network requests: **0** in the unmodified production read-only pass.
- Unexpected HTTP errors: **0** in the unmodified production read-only pass, excluding a separately classified optional FuelTrack Activity RPC described below.
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

The script requires an already signed employee browser tab and does not automate authentication or submit business writes.

## Scope and closeout

- No application assignments or role values changed.
- No workspace or board memberships were created or changed.
- No replacement boards were created.
- No generic board permission policies were changed.
- No production business data was written.
- Existing native domain workflow entry points are visible and their read paths work for the tested employee session.

**Current result:** Standard production read-only startup passed for all four applications. The remaining generic-background-sync defect has a focused frontend correction and regression coverage, but final generic-denial acceptance is pending deployment. Production write/transaction acceptance remains outside this read-only runtime milestone because it would create or alter real business records.
