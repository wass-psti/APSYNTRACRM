# CP-CRM-STARTUP-01 — Intermittent startup failure and bounded recovery

**Date:** November 17, 2026. **Project:** APSYNTRA CRM. **Scope:** pre-boot startup guard only, no authentication, Board, Supabase, role, permission, workflow or production-data changes.

## Incident and verified defect

An authorized Chromium tab intermittently displayed `Startup could not finish / Application could not load` on the first refresh after CP-TL-FINAL-09A/09C deployment. A subsequent full reload loaded the same signed TradeLink document without loss, and a direct ESM import of the served `frontend/app.js` succeeded. The precise external/browser event that triggered each production failure was not recorded and cannot be conclusively attributed to a particular network response.

The guard's previous logic was demonstrably defective: any `error` event or unhandled rejection before `app.js` executed `boot()` immediately set an irreversible fatal state. Noncritical image/style/optional-script errors could therefore falsely block the whole CRM. The original entry deadline was 12 seconds even when the module graph was merely slow. Reproduction tests were written against that old source and **failed as expected** before the change.

## Focused implementation

- Extend the entry graph's bounded initialization window from **12 seconds to 30 seconds** to accommodate cold/slow loads, retaining the existing 75-second post-`boot()` limit.
- Treat only a **conclusive resource load error from the actual `frontend/app.js` entry script** as immediately fatal. Check the event target and entry-script source; ordinary `window.error`, optional image/style/widget failures and unrelated unhandled rejections no longer trigger early fatal state.
- Other unresolved import/dependency failures still hit the 30-second deadline and display the existing bounded accessible recovery button (`Retry loading application`). The button performs an explicit reload, not a persistent retry loop.
- Preserve the existing `begin`/`resolve` guard, centralized `AuthClient`, session restoration, authorization, workspace checks and application startup catch/finally. No tokens or provider error messages are displayed or logged by the guard.

## Acceptance / limitations

- **Red → green:** unit tests reproduce unrelated-error false fatal and validate that the real app-entry failure still triggers the recovery UI; independent auth/route recovery tests remain intact.
- **Isolated Chromium:** real browser confirms unrelated error plus rejected optional task does not force fatal; an explicitly dispatched app-entry resource failure does, while normal `begin`/`resolve` clears pending deadlines.
- **Full frontend:** 2,585/2,585 PASS on repeat, Vite build PASS. One separate Board Import timeout test was flaky under the first parallel full-suite run but passed standalone and in the complete rerun; no Board Import source change.
- **Signed runtime:** after deployment, verify repeated reloads of the existing TradeLink and another CRM route without changes to records or session; check exact production Pages commit.
- The original production event is not reproducibly attributed to a specific missing module or provider fault. This release fixes a **proven false-fatal logic defect** and widens the bounded entry-load tolerance, not every possible CDN/transport interruption.

**Implementation classification:** VERIFIED in tests and isolated Chromium; deployment and refreshed signed production smoke are separate acceptance gates.
