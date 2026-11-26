# CP-TT — Admin Manual Clock-In: active session and scheduler contract

Status: the signed active-session creation path is already present in `main` from PR #882. This follow-up hardens its automatic-completion prerequisite; it does not add a completed-attendance creation path.

## Required workflow

- Only a **System Admin** can create a missed regular-employee clock-in. IT Administrators remain limited to their existing time-correction permissions.
- IT/Admin selects the employee and enters the actual same-day clock-in time in Philippine time. Nobody signs into, shares credentials with, or impersonates the employee.
- The server creates a normal employee-owned attendance record: `ownerId = cloud:<employee UUID>`, `clockIn.timestamp = entered instant`, and `clockOut = null`.
- The record is active immediately. The employee's signed TimeTracker Clock reads the same canonical attendance state and displays the active session using the recorded clock-in time. The employee ends it through the ordinary End Session flow.
- Administrative clock-in evidence is explicit `not_captured` GPS with source `admin-manual-clockin` and the creating administrator recorded. No coordinates are fabricated. The reason and before/after record are retained in the immutable admin audit.
- This workflow is active-only and same-day. It does not create a completed log, invent a clock-out timestamp, or add a second OJT write path. Shared-account OJT remains on its separate OJT workflow.

## Automatic clock-out is a prerequisite

The regular employee auto-clock-out processor and reconciler must be in the verified `active` mode before an admin manual clock-in can be saved.

- The readiness RPC returns false while the regular scheduler is suspended or invalid; the Add Log form keeps Save disabled and explains why.
- The signed create RPC independently rechecks active mode while holding the scheduler's shared control lock. If an operator is activating/suspending the scheduler, the request fails closed and can be retried after the mode is stable.
- The attendance write does **not** synchronously write to the scheduler table or invoke the reconciler. The independent 30-second reconciler enrolls the committed open employee session using the current activation epoch. This separation is intentional: scheduler enrollment was removed from attendance writes to avoid the earlier foreign-key/deadlock incident.
- The existing worker calculates the cutoff with `private.tt_auto_clockout_threshold`, which uses the attendance credited-time policy. The standard shift therefore reaches nine credited work hours with the one-hour unpaid lunch excluded; the existing approved-overtime rules and exact server cutoff remain unchanged. The processor runs on its existing 30-second cadence.
- The OJT nine-hour job is independent and is not modified by this change.

If the regular scheduler is suspended, manual clock-in is deliberately unavailable until a trusted database operator reviews the eligible open sessions and activates the isolated scheduler through the existing private operator procedure. This PR does not activate cron jobs, change the activation cutoff, or modify production data.

## Concurrency and safety

- The employee advisory lock and canonical attendance revision/CAS checks remain authoritative.
- Duplicate and overlapping sessions are rejected; stale revisions fail closed.
- The scheduler shared control lock prevents an operator activation/suspension from racing the attendance transaction. The scheduler's own enrollment remains asynchronous and isolated.
- The server revalidates System Admin scope, active employee/workspace membership, verified department, same-day Philippine timestamp, and attendance invariants.
- The employee's normal GPS-backed clock-out, automatic server clock-out evidence, Board projection, audit history, and Logs readback remain the existing paths.

## Acceptance checks

1. Suspended or invalid regular scheduler: capability is false, Save is disabled, and direct RPC creation is rejected without changing attendance.
2. Active regular scheduler: System Admin can create one same-day active session for an eligible regular employee.
3. Employee Clock signed refresh sees the same active session and elapsed time starts at the administrator-entered clock-in instant.
4. Employee can use normal End Session; no stale or duplicate session is created.
5. Independent reconciliation enrolls the new open session; the worker closes it at the existing nine-credited-hour cutoff, excluding unpaid lunch and preserving approved OT.
6. Duplicate/overlapping entries, non-System-Admin creation, inactive/shared OJT identities, missing department, future timestamps, and stale revisions fail closed.
7. Audit, Board projection, Logs, GPS provenance, and OJT isolation remain intact.

## Deployment

Forward migration: `20261126100000_cp_tt_admin_manual_clockin_scheduler_gate.sql`.

Review the migration list and manifest, run the disposable database and full CI checks, then use the normal production backup and dry-run process. The PR itself does not push migrations or activate the production scheduler.
