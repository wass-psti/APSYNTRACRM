# CP-TT — Admin Manual Attendance: hybrid current-day and historical corrections

Status: PR #914 is a replacement follow-up to closed PR #904. It preserves the signed active manual clock-in introduced in PR #882 and adds a separate, audited historical-completion path.

## Purpose and authorization

The feature is an HR documentation safeguard for employees who missed a clock-in for an appropriate reason. It is not a way to impersonate employees or alter their credentials.

- Only a workspace-scoped **System Admin** can create a manual attendance entry.
- The target must be an active regular employee with an active TimeTracker workspace membership and verified department.
- OJT shared-account identities and OJT intern identities are excluded. The OJT attendance and auto-clock-out paths remain independent.
- The admin records the employee, Philippine attendance date, actual clock-in time, work location, reason, and optional work note.
- GPS is never fabricated. Manual clock-in and clock-out evidence is explicitly `not_captured`, with the source and recording administrator retained.
- The immutable audit records the actor, employee-owned record ID, before/after payload, reason, base/committed revision, and request UUID.

## Two separate write paths

### A. Missed clock-in today — ACTIVE session

- The selected attendance date must be the current Philippine calendar date.
- The signed existing `timetracker_attendance_admin_create` RPC creates a normal employee-owned record: `ownerId = cloud:<employee UUID>`, actual admin-entered `clockIn.timestamp`, and `clockOut = null`.
- The employee's ordinary TimeTracker Clock reads the same canonical attendance state. The session appears active under the employee's identity; the employee can use the normal End Session action.
- The regular scheduler must be verifiably `active`. The readiness capability is versioned and the server rechecks mode while holding the scheduler's shared control lock. If activation/suspension is in progress, or the scheduler is suspended/invalid, this live write fails closed.
- The existing independent reconciler enrolls the committed open session on its normal 30-second sweep. The manual attendance transaction does not insert into `private.tt_auto_clockout_sessions` or call the worker synchronously.
- The existing worker continues to use `private.tt_auto_clockout_threshold` and the established credited-time policy: nine credited work hours, with the one-hour unpaid lunch excluded. Existing approved-OT handling remains unchanged.
- The active path rejects a second record for the same employee and Philippine date, as well as overlaps and duplicate/open sessions.

### B. Missed clock-in on a past date — COMPLETED historical record

- Only a date strictly before today's Philippine date is accepted. Same-day entries must use the ACTIVE path; future dates are rejected.
- The admin enters the actual clock-in time.
- Default clock-out method is **Standard — nine credited hours**. The server calculates the completed clock-out with the same authoritative `private.tt_auto_clockout_threshold` function used by the regular worker. The unpaid lunch is excluded.
- For a shorter or non-standard shift, the admin selects **Enter actual clock-out time** and supplies the actual Philippine date/time. The server requires it to be after clock-in, already elapsed, and within the supported 48-hour shift window.
- The completed record stores an explicit basis:
  - `standard_nine_credited_hours` — system-calculated standard clock-out.
  - `admin_entered_actual` — actual clock-out supplied by the System Admin.
- The basis is visible in the HR Attendance Log details and CSV export.
- The record is appended to the employee-owned canonical attendance history and projected to the HR board in the same transaction.
- The historical RPC never creates an open session, never inserts a row into `private.tt_auto_clockout_sessions`, never invokes reconciliation, and never changes the employee's current active Clock.
- A historical correction is allowed even while the regular live scheduler is suspended, because it is completed documentation and is not a scheduler candidate.

## Isolation, concurrency, and data integrity

- Current-day ACTIVE and past-day COMPLETED records use distinct signed database RPCs.
- Both paths serialize on the employee attendance advisory lock and the canonical attendance revision/CAS boundary.
- The historical RPC uses a request UUID as an idempotency key. A retry with the same actor, employee, date, time, method, reason, location, and work note returns the original receipt. Reusing that key for a different payload fails closed.
- One attendance record per employee per Philippine date is enforced. Duplicate dates, overlapping intervals, malformed existing timestamps, missing departments, inactive employees, OJT identities, non-System-Admin actors, stale revisions, future timestamps, and clock-out-before-clock-in are rejected.
- A historical correction whose interval precedes an employee's current open session is permitted. An overlapping correction is rejected.
- The employee's current open record and scheduler enrollment are not modified by a historical append.
- Board projection and immutable audit are committed atomically with canonical attendance state.
- No migration activates/deactivates cron jobs or rewrites production attendance.

## Scheduler contract

- `private.tt_admin_manual_clockin_ready()` is true only when `private.tt_auto_clockout_mode()` is `active`.
- The capability contract is `tt-admin-attendance-capability-3`:
  - `activeReady` controls today's ACTIVE path.
  - `historicalReady` controls the past-date COMPLETED path.
  - `schedulerMode` is explicit (`active`, `suspended`, or `invalid`).
- The live RPC independently rechecks scheduler mode under the shared scheduler-control lock. The historical RPC does not take or mutate the scheduler queue.
- The regular processor and reconciler remain the only regular-employee automatic completion path. The separate OJT scheduler is not modified.

## PostgreSQL 17 acceptance

The dedicated workflow `.github/workflows/cp-tt-admin-manual-attendance-hybrid.yml` builds a disposable PostgreSQL 17 database, applies the current prerequisite migration chain, and runs `supabase/tests/tt_admin_manual_attendance_hybrid.integration.sql`.

The acceptance covers:
1. Active scheduler capability and current-day employee-owned open session creation.
2. Asynchronous enrollment by the existing reconciler with the exact standard threshold.
3. Same-day duplicate rejection.
4. Standard historical calculation at nine credited hours, with lunch excluded.
5. Admin-entered actual historical clock-out override.
6. Historical HR board projection and immutable actor/reason audit.
7. No GPS fabrication and no historical queue enrollment.
8. A historical correction while the employee has a current active session leaves that session and its queue row unchanged.
9. Idempotent request replay; duplicate employee/date, unauthorized actor, future date, same-day historical path, and clock-out-before-clock-in rejection.
10. Scheduler suspension blocks only the current-day ACTIVE path; historical COMPLETED corrections remain available.
11. The independent OJT cron job remains unchanged.

The existing auto-clockout PostgreSQL 17 worker acceptance is also run before the new migration chain.

## Deployment

Forward migrations:
- `20261126100000_cp_tt_admin_manual_clockin_scheduler_gate.sql`
- `20261126110000_cp_tt_admin_manual_attendance_hybrid.sql`

Both must be registered in `supabase/migration-source-manifest.json` with exact byte counts and SHA-256 checksums.

The PR itself does not push migrations or alter production cron jobs. After merge, deploy the migrations through the approved Supabase backup/dry-run procedure, verify the regular processor and reconciler are active and succeeding, and test a controlled current-day manual clock-in before enabling the HR workflow broadly. The OJT job must remain unchanged.
