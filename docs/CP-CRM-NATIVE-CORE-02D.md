# CP-CRM-NATIVE-CORE-02D — Independent Signed Two-Tab Acceptance

**Date:** 2026-11-20, Asia/Manila
**Disposition:** PARTIAL — cross-window production acceptance BLOCKED by independent account mismatch. Read-only preflight and its tests are implemented.

## Genuine production evidence

The authorized MacBook Pro is online with a local Chromium CDP QA profile at `127.0.0.1:9222`. Two APSYNTRA CRM tabs were genuinely authenticated as **active workspace members**, each yielding an HTTP 200 signed `wm_auth_access_context` response. Both resolved to the same current workspace, but their authoritative signed **user IDs differed**. No raw user IDs or tokens are retained in the acceptance report; only SHA-256 pseudonymous account keys are used for comparison.

The previous CORE-02C run had already verified initial native startup and refresh, canonical Board context, and signed domain RPCs for TimeTracker, Fund Tracker, FuelTrack+ and TradeLink under one assigned employee account, with zero browser/RPC errors and zero production writes. That evidence remains valid for that observed account/build and scope; it **does not** certify all employees or cross-window synchronization on the latest unrelated app changes.

The old cross-window runner selected any second tab that displayed signed UI, then navigated it to the tested native route **before** checking that its signed user matched the target employee. With two different employees in the same workspace, this could disrupt the other user's tab and generate a misleading failed acceptance.

## Implemented correction

`scripts/cp-crm-native-core-02b-crosswindow.mjs` now collects each eligible tab's authoritative signed identity **before any native-route navigation**. For each candidate it waits for signed `wm_auth_access_context` on a normal reload, validates active user/workspace UUIDs and signed UI recovery, then compares pseudonymous account and workspace keys. Acceptance proceeds only when **two different tabs match the same expected employee AND the same workspace**. Other employees' sessions are not used as a substitute, navigated to other routes, or impersonated. If two matching tabs are not present, the runner reports a distinct `BLOCKED` result with count-only pseudonymous preflight evidence.

No implicit second tab is created, no storage or credentials are accessed, and no roles, grants, RLS, business records, or workspace configuration are changed. When valid matching sessions exist, the existing runner's initial/refresh/reopen and read-only `BroadcastChannel` reconciliation checks remain in force. The independent second-tab signed native-context read is required; a synthetic channel signal is **not** evidence of committed business data synchronization.

## Actual corrected live preflight

- Valid signed CRM QA tabs: **2**
- Signed tabs for expected employee: **1**
- Matching expected employee + workspace tabs: **1**
- Acceptance: **BLOCKED — second independently authenticated tab for the same employee required**
- Production business writes: **0**; permission writes: **0**
- No second employee's native application route was changed by this corrected preflight.

## Remaining prerequisite

Directly sign into a second APSYNTRA CRM tab **with the same assigned employee account as the intended test account, in the same workspace**, without logging out or overwriting the other user's session. Use a separate profile/browser tab if the browser session architecture cannot maintain two independent same-user sessions in one profile. Keep the two authorized tabs open before rerunning the harness. If the same-user two-tab arrangement is unsupported, accept that as a genuine session-capability constraint; do not weaken authentication or fabricate synchronized results.

**Next scoped milestone if needed:** `CP-CRM-NATIVE-CORE-02E — Same-Employee Independent Signed Two-Tab Runtime Acceptance and Cross-Window Readback`, limited to genuine same-account second-tab verification and any evidence-backed fixes. The future eight native application conversions remain out of scope.
