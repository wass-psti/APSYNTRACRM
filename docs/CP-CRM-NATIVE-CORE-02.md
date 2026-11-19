# CP-CRM-NATIVE-CORE-02 — Genuine Signed Four-Application Runtime Acceptance

**Date:** 2026-11-20 (Asia/Manila)
**Scope:** Existing dedicated native applications only: TimeTracker, Fund Tracker, FuelTrack+, TradeLink. The remaining eight native conversions and Charter Navigator role decisions are explicitly separate initiatives.

## Verified findings

- `main` baseline: CP-CRM-NATIVE-CORE-01 merged as `25a9debeb796aac9eb913e5007cdaa81a503a029`. Existing native context, transient workspace recovery and Board synchronization controls remain intact.
- Connected local Mac Chromium CDP at `127.0.0.1:9222` contains one APSYNTRA CRM tab. The actual page displays the **sign-in form** and no genuine signed session. Running the existing read-only employee preflight returns `BLOCKED: no genuinely signed CRM tab` with `accountKey:null`, no application checks and zero permission/business writes. A separate ChatGPT browser connector's signed administrative tab does not substitute for an employee-signed CDP tab or authorize identity impersonation.
- No credential, token, cookie, storage, account, role, RLS, production application data or permissions were changed.

## Functional issue in prior acceptance automation

The previous FINAL-02 browser runner required role-dependent UI copy for successful initialization. Its TimeTracker marker `Signed Clock writes active` is not available to every permitted role, Fund Tracker's `New Fund Request` is conditional on company/result state, and TradeLink's `My Assigned Documents` can legitimately be `All Documents` for creator roles. These can falsely report a working signed native application as blocked. The TradeLink sidebar points at `#/tradelink`, while the existing acceptance runner checked for `#/tradelink/documents`, another guaranteed false `ASSIGNED_NAVIGATION_MISSING` even when the signed user's navigation is correct. The runner now distinguishes the actual sidebar route from the documents destination.

The runner now observes application-specific native DOM roots rendered by the actual four application components:

| Application | Stable native root | Server proof |
| --- | --- | --- |
| TimeTracker | `section.tt-native` | Native context + TimeTracker signed domain read |
| Fund Tracker | `section.frt-native[data-fund-tracker-root]` | Native context + FRT signed domain read |
| FuelTrack+ | `section.ft3-app` | Native context + FuelTrack signed domain read |
| TradeLink | `.aps-tradelink-app.tl-reference-portal` | Native context + TradeLink signed domain read |

Every expected application now requires **two separately checked phases**—initial navigation and hard reload. Each phase must have the correct signed native-context RPC, matching canonical Board ID, visible native root, at least one successful signed domain read and no unexpected browser or HTTP failures. A successful first phase cannot compensate for a missing or failing reload. Identity and workspace must match across both phases and the authoritative expected account-key input. No business action is executed.

The runner retains the existing report envelope and adds `verificationMilestone:CP-CRM-NATIVE-CORE-02`, with a `phases` array for each checked application. Its results must never be described as production certification unless they were collected from the independently signed browser and the reported phases actually pass.

## Acceptance evidence and limitations

- Focused unit tests cover role-independent UI selectors, initial/reload independence, signed account changes, 403/503 responses, missing domain read, wrong canonical Board ID and session loss.
- Complete frontend regression, production build and GitHub checks should be attached after merge.
- **BLOCKED:** genuine signed employee initial/reload, second-window Board synchronization and permitted native readback for all four applications; current QA browser remains signed out. UI selectors and regression tests alone cannot verify a live backend session or cross-window sync.
- No new runtime production code was warranted based on the evidence in this session. The implementation improves the executable acceptance contract, not the application itself.

## Next narrowly scoped action

**CP-CRM-NATIVE-CORE-02B — Genuine Employee Login, Four-Application Initial/Refresh/Reopen Runtime Matrix, and Cross-Window Board Synchronization Acceptance.** An assigned employee must sign in directly in the existing authorized Chromium QA profile without sharing their credentials. Generate the expected pseudonymous user key and assigned module list from the existing authoritative inventory; execute the read-only preflight; test a second signed window and permitted Board refresh/reopen without mutations. Investigate and fix only reproducible runtime failures. Do not start the eight deferred native conversions or change authorization rules.
