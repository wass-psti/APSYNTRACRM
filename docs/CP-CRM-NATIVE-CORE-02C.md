# CP-CRM-NATIVE-CORE-02C — Genuine Employee Four-Application Acceptance

**Date:** 2026-11-20 (Asia/Manila)
**Disposition:** PARTIAL — genuine signed initial/refresh reads passed for all four native applications; second-tab reopen and cross-window live acceptance remain blocked by a separately unauthenticated tab. The acceptance harness was corrected without changing application business logic or permission policy.

## Signed production evidence

A genuinely signed-in **Workspace member** session became available through the authorized Mac's existing Chromium CDP profile. The signed `wm_auth_access_context` RPC returned HTTP 200 with an active profile, a user ID and a workspace ID. The account and workspace were correlated via SHA-256 pseudonyms; credentials, tokens and raw user identifiers were not logged.

`node scripts/cp-crm-native-access-final02-signed-matrix.mjs` was run on the existing signed session against **exactly the four currently implemented native applications**. The run produced verified initial and hard-refresh phases for every module:

| Module | Initial signed UI, Board context, domain RPC | Hard refresh signed UI, Board context, domain RPC |
| --- | --- | --- |
| TimeTracker | PASS; `timetracker_attendance_capabilities` and `timetracker_ot_snapshot` HTTP 200 | PASS; both HTTP 200 |
| Fund Tracker | PASS; `frt_bootstrap` HTTP 200 | PASS; `frt_bootstrap` HTTP 200 |
| FuelTrack+ | PASS; `fueltrack_v3_read` HTTP 200 | PASS; `fueltrack_v3_read` HTTP 200 |
| TradeLink | PASS; `tl03_assigned_documents` HTTP 200 | PASS; `tl03_assigned_documents` HTTP 200 |

Every phase had the correct canonical Board ID, native UI visible, signed identity/workspace, **zero unexpected HTTP errors**, and **zero page errors**. No business writes or permission writes were executed.

## Cross-window blocker and corrected harness

The first execution of the previous FINAL-02B cross-window runner confirmed TimeTracker's **initial and refresh** phases but timed out waiting for a native UI in a separate `browserContext.newPage()` tab. A direct inspection during Fund Tracker verification showed the separately created tab displaying **Sign in**, while the original browser tab remained signed in. A fresh same-context tab does **not** necessarily inherit a session persisted in tab-scoped browser state. This failure is an **acceptance-harness session setup issue**, not proof of denied employee access or broken native UI.

A detached test process was stopped and its signed-out test-only tab closed; the QA Chromium profile ended up with no open tabs. The most recently closed QA tab was reopened using Chromium's normal GUI restore shortcut. The restored tab showed **Sign in**, so no genuine signed-session test can continue until the employee signs in again. No credentials or storage were read, copied or reset by the test.

A repeat signed test also verified the original tab's initial and hard-refresh phases again, while an opener-created second tab continued to show **Sign in**. The cross-window harness now **first reuses a second independently signed CRM tab**, when one exists in the authorized QA Chromium profile. Otherwise it opens a tab through the original browser tab using `window.open`, allowing the browser to apply ordinary opener/session semantics. It checks that the second tab is genuinely signed in before inspecting native UI. If the second tab cannot recover a signed session, it reports a **BLOCKED prerequisite**, not a false application failure. An existing signed QA tab is restored to its original URL after testing; only a newly created test tab is closed. It then reloads the second tab under observed signed server response collection, so a popup's early network responses cannot be missed. The local runner remains read-only: its synchronization event is a same-scope `BroadcastChannel` cache invalidation hint with identifiers only; it never writes Board data, permissions, cookies or credentials.

## Verified vs pending

- **VERIFIED:** Genuine employee initial/refresh native UI, canonical Board context, domain RPCs for 4/4 applications on one signed account.
- **IMPLEMENTED / tested:** Opener-based second-tab session preflight and strict UUID validation in the cross-window acceptance harness.
- **PENDING:** Genuine signed second-tab reopen and cross-window reconciliation on all four applications, plus permitted workflow readback under other assigned employees.
- **NOT APPLICABLE:** Eight future native application conversions, Charter Navigator role migrations, and production access policy changes.

**Next gate:** Keep the original assigned employee signed in to the authorized Chromium QA profile and open a **second independently signed CRM tab in the same QA profile** (preferably on Overview with no unsaved edits). Then rerun the corrected read-only two-tab runner for each assigned native module. Fix application runtime code only if the new genuine signed evidence identifies a reproducible defect; do not bypass session scope or grant broad permissions.
