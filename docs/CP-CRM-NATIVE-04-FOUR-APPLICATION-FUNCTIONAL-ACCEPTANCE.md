# CP-CRM-NATIVE-04 — Four-Application Functional and Operational Reliability

**Date:** 2026-11-19 (Asia/Manila)
**Project:** APSYNTRA CRM · existing Supabase project `jtlusodorfnyzgyuewkz`
**Scope:** TimeTracker, Fund Tracker, FuelTrack+ v3, TradeLink

## Authoritative baseline

- PR #571 (`8ab68c38bed074593091a18684b4fb390b901fa5`) was already merged and deployed when this investigation began.
- Its `native_application_board_context` contract resolves native application boards without using generic board-list and board-view permissions.
- CP-CRM-CONN-03B previously accepted genuine employee startup for all four applications; this milestone evaluates more functional paths, read-only operational screens, and disposable write-path tests.

## Test isolation and safety

Signed production browser tests reuse an existing authenticated Chromium employee tab on the authorized MacBook. No login is automated; no tokens, local storage, session storage, cookies, credentials, or document bodies are retrieved. Production business mutations are **not** executed. The test restores the original route on exit.

An attempted separate Chromium tab did not inherit the tab-scoped employee session; it was not used as a substitute for an authenticated user. If other software concurrently changes the employee tab's route, the signed browser acceptance must report inconclusive rather than assume route/UI correspondence.

Disposable PostgreSQL and synthetic browser tests provide separate coverage for write contracts. Passing them does not certify successful production clock-in, payment processing, fuel submission, or TradeLink approval.

## Verification matrix

| Application   | Verified automated/disposable contracts                                                                                                                      | Genuine signed employee runtime                                                                    | Production mutations |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------- |
| TimeTracker   | Full frontend tests; isolated Chromium navigation, responsiveness and WCAG; clock/pending-recovery and duplicate-session tests                               | Clock, attendance log, hours, reports, calendar and overtime are targeted for read-only acceptance | Not executed         |
| Fund Tracker  | Disposable PostgreSQL archive and restoration; monthly DV/duplicate guard; exact-cent accounting; workflow provenance; concurrent CAS revision serialization | Signed financial dashboard and scoped company reads                                                | Not executed         |
| FuelTrack+ v3 | Disposable PostgreSQL signed domain workflows, board links, private receipt policies, denied actions, idempotency and migration rollback                     | Dashboard, analytics, requests, new-request form, approvals and Activity route                     | Not executed         |
| TradeLink     | Full frontend functional regression; assigned-document read, dual review and approval transition contracts                                                   | Signed assigned documents, application activity and analytics routes                               | Not executed         |

## Confirmed functionality issue — FuelTrack Activity for standard User

Production live navigation of `#/fueltrack/activity` using a signed employee in the existing `User` role received **HTTP 403** from `list_module_activity`. The backend function explicitly allows only `Admin` to read that module-wide activity stream, and the UI already renders an explanatory Admin-only state for non-admins. The frontend nevertheless issued the predictably denied RPC, producing an unnecessary error state and network request.

### Minimal corrective change

`frontend/app.js` now uses the already verified role from `nativeApplicationBoardContext('fueltrack-plus')` to avoid issuing an Admin-only audit read when the signed role is not `Admin`. The page continues showing the existing read-only Admin-required explanation. For an Admin, the existing `FuelTrackV3DomainClient.audit({limit:200})` path remains unchanged. No permission is added, removed or elevated and no backend policy changes.

The existing `frontend/tests/fueltrack-v3-application.test.mjs` contract now asserts that the non-admin branch does not invoke `list_module_activity` and the existing Admin audit path is still present.

## Acceptance criteria

- All four native applications initialize from genuine signed employee context.
- Read-only application screens and existing domain projections render without invented data.
- Intentional Admin-only activity states do not dispatch predictably forbidden requests.
- No production business records or roles are altered during verification.
- Disposable write-path contracts and full frontend regression pass.
- GitHub CI and production Pages deployment pass.
- Actual production write workflows are reported as unverified until independently authorized and exercised with disposable/approved nonproduction records.

## Final boundary

This milestone can close **read-only functional access and deterministic nonproduction workflow contract acceptance** once the current deployed frontend is accepted. Full production business-write acceptance remains a separate operational decision and must not be inferred from successful unit tests or readable dashboards.
