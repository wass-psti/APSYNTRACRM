# CP-TT-FM1-APP-03 — Controlled Clock-In/Clock-Out Operational Acceptance, Duplicate-Session Verification, and Attendance Lifecycle Closure

**Status:** IMPLEMENTED-UNVERIFIED — disposable lifecycle/concurrency acceptance passed; real production attendance write requires separate approval
**Base:** `main` at `c463beaa88dff35327dcbb332751f5a2aa71ed69`
**Branch:** `feat/cp-tt-fm1-app-03`

## Scope and boundaries

- Preserve the existing APSYNTRA CRM TimeTracker route, FM1 application shell, attendance board, signed session, RPC contract, database, and current employee eligibility rules.
- Improve the existing Clock-In/Clock-Out workflow and its response-loss recovery; do not introduce a second attendance store, database, locking mechanism, authentication system, role hierarchy, or authorization redesign.
- Validate duplicate and concurrent attendance actions against a disposable PostgreSQL 17 fixture, never against production employee records.
- Keep production GPS coordinates and attendance history private; test fixtures use synthetic coordinates only.

## Production baseline (read-only, 2026-11-16)

- Existing APSYNTRACRM Supabase project is healthy and remains the only project used.
- `timetracker_attendance_capabilities`, `timetracker_attendance_commit_v2`, `timetracker_commit_attendance_raw_gps03`, and the atomic attendance projection/audit objects are installed.
- The deployed raw attendance writer uses a transaction-scoped advisory lock keyed by workspace and actor. It rejects an additional Clock-In while an active session exists and rejects Clock-Out when no matching active record remains.
- Existing production audit aggregate: five Clock-In and five Clock-Out events across five completed sessions. Three sessions created after the November 3 projection deployment have board projections; two sessions dated November 2 predate that deployment and are expected not to have projection rows.
- The currently signed Chromium session was read-only verified. Its Clock capability was active, the attendance state was idle, and Clock In was enabled. No production attendance record, GPS coordinate, or employee history was changed or copied.

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
- The disposable PostgreSQL container was stopped and removed after the tests. No production database writes were used for this acceptance.

## Remaining production operational gate

- Perform one real signed Clock-In and Clock-Out against the current production session only after separate approval for the resulting production attendance record and confirmation of the work location and department to record.
- Verify the same record in Clock, Attendance Log, Reports, Calendar, My Hours, the authoritative attendance state, audit summary, and board projection.
- Verify independent live GPS fixes for both actions and the resulting credited duration.
- Do not manufacture a production employee record or substitute synthetic coordinates for a genuine device fix.

No production Clock-In/Clock-Out write is claimed by this implementation. Code-level and disposable operational acceptance are complete; the real production attendance write remains explicitly pending.
