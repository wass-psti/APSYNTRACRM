# Manual attendance entry — implementation and release contract

Status: frontend preview integrated into the System Admin Logs route. The signed creation backend is not implemented; saving is fail-closed. No production database write is enabled.

## Approved behavior

System Admin can open Add Log from TimeTracker Logs, choose an active regular employee or individual OJT identity, enter Philippine attendance date, clock-in time, work location, work note (required for home work) and a manual-entry reason. Today defaults to Active and can be changed to Completed. Past days require Completed. Future dates and future timestamps are rejected. Completed sessions require a strictly later clock-out; overnight shifts may use a different clock-out date. Active sessions have no clock-out and can be ended through the employee's ordinary flow.

## Repository integration findings

- `frontend/time-tracker-log.js` renders the admin toolbar; `frontend/app.js` owns signed routes, mutation state, and refresh. `frontend/time-tracker-native.js` owns the regular attendance signed client; OJT uses `frontend/apps/TimeTracker/time-tracker-ojt.js`.
- Regular attendance uses the shared `timetracker.attendance.v1` module state, row locking, revisions, recovery copy, invariant checks, and atomic private board projection. See migrations 20261120170000 and 20261120183000.
- Regular projection `private.tt_board_projection_upsert` in 20261103040953 explicitly requires captured clock-in GPS with coordinates. Manual creation must deliberately extend its evidence contract and all GPS readers; fake coordinates or a bypass of atomic projection are unacceptable.
- OJT attendance uses `private.tt_ojt_attendance` and append-only `private.tt_ojt_audit`, with a separate shared-account and intern-scoped advisory lock (20261123140000, 20261123150000). A shared login must never be selected as a regular employee or substitute for an individual intern.
- Existing IT Administrator attendance permission is correction-only; creation should require System Admin unless the owner explicitly grants broader access. Never silently expand IT privileges.

## Required remaining implementation

1. Implement signed roster and creation RPC(s) with independent server time/date validation, current module role and workspace/board authorization, active roster verification and verified department. Use the same row/identity locks as existing clock operations; handle empty shared state safely. Reject overlaps across the target identity including an active unbounded interval. Require reason and immutable creator/time audit evidence.
2. Preserve ordinary GPS evidence requirements for employee actions; introduce explicit manual evidence, no synthetic coordinate. Update projection, restricted GPS reads, invariant checks, admin patch and clock-out/auto-clock-out integration so manual clock-in can be closed by the employee or server. Respect current nine-hour policy and overtime rules; test at the exact cutoff. Keep regular and OJT data in their respective canonical stores.
3. The System Admin Add Log modal is integrated using existing toolbar/editor styling, signed roster preview, Manila date policy and draft retention. Saving is hard-disabled until signed creation capability, authoritative roster, receipt verification and fresh signed read-back are implemented. Preserve the draft on errors, prevent repeat submits and scope changes, and avoid optimistic insertion.
4. Add visible source labels and integrate all existing reports/history without duplicate records. Ensure audit before/after and manual actor attribution cannot be changed by the employee.
5. Add database integration coverage: unauthorized roles and cross-workspace, concurrent creation/clock-in, duplicates and overlapping intervals, historical/active/completed, future and Manila midnight, employee normal clock-out, auto-clock-out, OJT separate identities, audit, projection/read redaction, and failure rollback. Add migration to forward-migration SHA-256 manifest; do not edit recovered baseline migrations.
6. Run npm tests, build, signed disposable database acceptance and browser/mobile acceptance. Do not merge/deploy before these pass.

The new client validation and modal are groundwork only. The client is not an authorization or time authority. Eleven validation and UI-render/route test cases passed in an isolated JavaScript harness using committed source. Full Node, browser and database acceptance remain outstanding. No migration or production changes are included.
