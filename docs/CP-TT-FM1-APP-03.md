# CP-TT-FM1-APP-03 — Controlled Clock-In/Clock-Out Operational Acceptance, Duplicate-Session Verification, and Attendance Lifecycle Closure

**Status:** DEPLOYED-VERIFIED — disposable lifecycle/concurrency, genuine signed runtime, and one controlled production test attendance lifecycle passed
**Base:** `main` at `27c21f1c2ebe24ec87ba346c68ed6c3069d70836`
**Merged PR:** [#428](https://github.com/wass-psti/APSYNTRACRM/pull/428)
**Production commit:** `87b994759c50f37c8deb3206ded079674d7987ab`

## Scope and boundaries

- Preserve the existing APSYNTRA CRM TimeTracker route, FM1 application shell, attendance board, signed session, RPC contract, database, and current employee eligibility rules.
- Improve the existing Clock-In/Clock-Out workflow and its response-loss recovery; do not introduce a second attendance store, database, locking mechanism, authentication system, role hierarchy, or authorization redesign.
- Validate duplicate and concurrent attendance actions against a disposable PostgreSQL 17 fixture, never against production employee records.
- Keep production GPS coordinates and attendance history private; test fixtures use synthetic coordinates only.

## Production baseline (read-only, 2026-11-16)

- Existing APSYNTRACRM Supabase project is healthy and remains the only project used.
- `timetracker_attendance_capabilities`, `timetracker_attendance_commit_v2`, `timetracker_commit_attendance_raw_gps03`, and the atomic attendance projection/audit objects are installed.
- The deployed raw attendance writer uses a transaction-scoped advisory lock keyed by workspace and actor. It rejects an additional Clock-In while an active session exists and rejects Clock-Out when no matching active record remains.
- Pre-write production audit baseline: five Clock-In and five Clock-Out events across five completed sessions. Three sessions created after the November 3 projection deployment have board projections; two sessions dated November 2 predate that deployment and are expected not to have projection rows. The controlled test lifecycle documented below is additional to this baseline.
- Before the controlled write, the currently signed Chromium session was read-only verified after deployment. The dedicated `#/time-tracker` route and FM1 shell remained mounted across all ten sections; Clock was restored at the end. The Clock capability was active, the attendance state was idle, and Clock In was enabled. The browser was a secure context with the geolocation permission granted.

## Implementation changes

### Clock-In response-loss recovery

- Added `clockInSnapshotOutcome` and a shared `attendanceSnapshotOutcome` dispatcher alongside the existing Clock-Out reconciler.
- A lost Clock-In response is now reconciled using a fresh signed snapshot, matching the exact actor/workspace/board, authoritative revision advance, a new record identity, and the submitted location/department.
- Both successful receipt refreshes and ambiguous Clock-In/Clock-Out responses retain a verify-only state until the signed snapshot confirms the committed record.
- An unresolved write cannot be submitted a second time. A user-triggered signed read may unlock a retry only when it proves the Clock-In did not commit or the Clock-Out session remains active and no receipt was confirmed.
- GPS and permission error messages now identify the correct Clock-In or Clock-Out action.
- The Clock UI uses action-specific pending status text while retaining the existing verify control and layout.

### Duplicate and lifecycle acceptance

- Updated the disposable raw-writer fixture to mirror the production workspace/actor advisory transaction lock. An optional delay is enabled only in the dedicated concurrency test.
- Added `scripts/cp-tt-attendance-concurrency.sh` and wired it into the PostgreSQL 17 CP-TT-GPS01 workflow, including pull-request execution.
- The disposable acceptance launches two simultaneous Clock-In requests and two simultaneous Clock-Out requests for the same test actor. Each race must produce exactly one committed receipt and one expected active-session rejection.
- The final fixture assertions verify one authoritative session, one audit event per action, one linked board item, revision 2, completed credited duration, and distinct Clock-In and Clock-Out GPS fixes.
- The existing schema-drift rollback test restores its disposable column fixture before the independent concurrency actor runs. The final fail-closed data-preservation check now expects both completed fixture sessions and all four audit events.

## Verification evidence

- Full frontend unit suite: **2,386 passed, 0 failed**.
- Clock-specific interaction, recovery, UI, and transport tests: **34 passed, 0 failed**.
- `npm run check`: PASS.
- `npm run lint`: PASS.
- `npm run format:check`: PASS.
- Changed-file ESLint: PASS.
- GitHub workflow YAML Prettier check: PASS.
- Production frontend build: PASS. Existing non-blocking large main-chunk and FuelTrans mixed-import warnings remain.
- FM1 Playwright/axe acceptance: `FM1_BROWSER_ACCEPTANCE_PASS`.
- TimeTracker Playwright/axe acceptance: `TIMETRACKER_BROWSER_ACCEPTANCE_PASS` across desktop, tablet, mobile, and existing views.
- Disposable PostgreSQL 17 acceptance: PASS. Existing atomic GPS projection tests, simultaneous duplicate Clock-In/Clock-Out races, lifecycle readback, audit cardinality, one-item projection, independent GPS fixes, and fail-closed rollback all passed.
- GitHub Pages deployment: PASS for production commit `87b994759c50f37c8deb3206ded079674d7987ab`.
- Live Pages smoke: PASS for the exact production source SHA, including TimeTracker JavaScript and CSS assets.
- Genuine signed Chromium read-only acceptance: `READ_ONLY_SIGNED_RUNTIME_ACCEPTANCE_PASS`; all ten sections selected successfully, the FM1 shell remained mounted, generic board controls were absent, and Clock was restored.
- Pre-write live Clock readback: signed workspace verified, signed Clock writes active, attendance idle, and Start Session enabled. Browser geolocation permission was granted.
- **Controlled production test lifecycle (2026-11-16, Asia/Manila):** after explicit user approval and confirmation that the active session was a test, one Clock-Out was submitted from the existing signed TimeTracker Clock form. No second Clock-In was created during this closeout.
- The application confirmed: `Clock Out confirmed in your signed PostgreSQL attendance record.` The Clock view transitioned from Active to Idle, displayed one session and 0.1 credited hours, and presented the Clock-In form again.
- Attendance Log readback returned exactly one session for the current date, with Clock-In at 4:15 PM, Clock-Out at 4:21 PM, Office-Base Duty, Information Technology, Completed status, and 0.11 hours. Expanded session evidence showed both Clock-In and Clock-Out GPS fixes recorded by browser GPS, with reported accuracy of ±35 m and ±36 m respectively. Coordinates are intentionally not copied into this report.
- Reports readback showed the same completed session and 0.1 h. Calendar readback showed one attendance entry for November 16. My Hours readback showed the same 4:15 PM–4:21 PM completed session, 0.1 h for the week, and one weekly session.
- Post-write Clock readback confirmed `Idle`, no active Clock-Out form, and the Clock-In form enabled. The dedicated route remained `#/time-tracker` and Clock was restored after read-only verification.
- The record's audit projection explicitly marks GPS and timing as Recorded. Edit verification is Not verified, device evidence is Unavailable, and the audit score is N/A; these are not represented as independently verified audit/device evidence.
- Duplicate/concurrent Clock-In and Clock-Out prevention remains verified by the disposable PostgreSQL concurrency tests, not by intentionally issuing duplicate writes against production.
- The disposable PostgreSQL container was stopped and removed after the tests. Production write acceptance used only the single approved test session and genuine browser GPS fixes.

## Final acceptance

- One approved production test Clock-In/Clock-Out lifecycle: PASS.
- Server confirmation and signed PostgreSQL record readback: PASS.
- No remaining active session and no duplicate session for the test: PASS.
- Independent Clock-In and Clock-Out browser GPS fixes recorded: PASS.
- Attendance Log, Reports, Calendar, and My Hours consistency: PASS.
- Existing role, authorization, workspace, and eligibility behavior: unchanged.

The dedicated TimeTracker application, code-level lifecycle, disposable concurrency acceptance, production deployment, and one controlled genuine signed production test attendance lifecycle are verified. No further implementation milestone is required for CP-TT-FM1-APP-03.
