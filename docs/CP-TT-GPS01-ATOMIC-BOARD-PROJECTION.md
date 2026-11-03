# CP-TT-GPS01 — Atomic Attendance-to-Board Projection (staged)

**Status:** PROPOSED / NOT PRODUCTION-DEPLOYED. First verified target: the existing APSYNTRA CRM **TimeTracker Attendance** board. No separate Supabase project, backend, authentication system or attendance source of truth.

## Inspected live baseline

- Authoritative TimeTracker writes already go through `public.timetracker_attendance_commit_v2` and `public.timetracker_commit_attendance_raw_gps03`. The latter serializes by workspace and employee, stores `clockIn.geo` and `clockOut.geo` independently in `module_state_entries`, and performs revisioned source writes. The wrapper creates `timetracker_attendance_mutation_audit` events.
- Actual pre-migration `timetracker_attendance_commit_v2` function source MD5: **`93540708e0a99494c5b038f0eeabbcca`**. The candidate refuses to replace a different definition.
- TimeTracker board ID: **`46bf4ee7-368a-4c35-842c-8593ea1f6ac3`**. Existing board: eight typed domain columns, one group, zero projected items at inspection. The audit table had four attendance mutations. Historical state needs separate authorized, idempotent reconciliation; it must not be rewritten by a schema migration.
- Existing dedicated `timetracker_gps_snapshot` authorizes GPS reads **only for bootstrap administrators or users with the effective TimeTracker Supervisor role**. This proposal preserves that exact boundary. Regular board `view` grants are not GPS permissions.
- The board's generic `wm_get_board` includes item column values, creator identifiers and board-level fields; therefore it **must never receive employee identity or raw GPS coordinates** via a normal board-column projection.

## Atomic transaction design

`sql/cp-tt-gps01-atomic-board-projection.sql` stages:

1. A private, row-linked `private.tt_attendance_board_projection` table with a unique `(board_id,record_id)` lineage key, an immutable linked board item ID, employee and workspace ownership, revision, clock-in timestamp/location/GPS, independent clock-out timestamp/location/GPS, and credited duration. The table is RLS-enabled and has **no anon/authenticated table privileges**.
2. Internal `private.tt_board_projection_upsert`, callable only within the trusted attendance commit, checks board name/workspace/identity, validates clock-in/out lifecycle, rejects source revocation or duplicate/conflicting events, and prevents completed clock-out GPS from being silently overwritten. A repeated identical revision returns the same linked item.
3. A **sanitized** board item and typed cell projection for Attendance Ref, Attendance Date, Hours Total, Attendance Status, Source Record ID, Source Revision and Sync State. The original Shift Ref remains unset until the authoritative TimeTracker source actually defines a shift reference. General board values contain **no GPS, employee name, employee ID or work note**. The board's existing technical owner is used for generic item attribution; the true employee is preserved in the private link and authoritative audit.
4. Full replacement of the existing `timetracker_attendance_commit_v2` wrapper **only at the existing receipt boundary**: after the authoritative raw commit and audit insert but before returning success. A SQL exception rolls back the source write, backup, audit, board item, private GPS and summary in the same transaction.
5. `public.timetracker_board_private_snapshot`, a separate signed PostgREST RPC with `timetracker_ot_require_scope` and the exact existing bootstrap/Supervisor authorization ceiling. This is a bounded (1–100 record) allowlisted GPS read; it does not return work notes, general source state or other employee records. No raw private-table grants are added.

The existing calculation deducts the noon-to-1 PM **Asia/Manila** unpaid break from completed attendance durations; the staged SQL helper implements that policy without using browser timestamps as authoritative clock times.

## Review and known limitations

- **No production DDL or function changes** are authorized solely by this milestone start. Separately approve the exact SQL source and privileged function replacement before production migration. The candidate and fail-closed rollback are separate files.
- The standalone `sql/cp-tt-gps01-fail-closed-rollback.sql` **disables the attendance commit and private GPS read RPCs without deleting historical data**; this intentionally blocks future clock operations until repaired. It does not silently restore a partially synchronized or weaker permission path.
- Historical attendance records (four audited mutations at inspection) need a separately reviewed, idempotent backfill/reconciliation. New successful commits will project only once the candidate is activated.
- The generic board table remains intentionally **GPS-redacted**. The authorized GPS clock-in/out columns are rendered through a separate role-protected table using the private snapshot, never via `wm_get_board`.
- Real browser GPS can be denied, mocked or tampered with; server checks already validate ranges and timestamps, but GPS does not prove physical presence.
- Every projection currently chooses the first existing group for new records; subsequent updates **preserve item group placement**. Multiple groups share one schema, and moving an item does not duplicate the linked attendance record.
- Actual signed-session clock-in/out, revoked/expired bearer, production persistence, concurrent sessions and backfill acceptance remain **PENDING**. Disposable tests are necessary but not sufficient.
- Do not automatically deploy new columns to the public board with populated GPS or invite broad read roles to restricted employee locations.

## Acceptance plan

1. Run disposable PostgreSQL 17 setup, exact original wrapper, staged atomic candidate, positive/denied/idempotence/data-integrity tests, and fail-closed rollback verification.
2. Stage and test a frontend restricted board GPS view using `timetracker_board_private_snapshot`, default disabled until server activation.
3. Independently review source/definer/RBAC and any required reconciliation procedure, validate module-group and board-schema dependencies.
4. Obtain separately scoped production permission/schema/function-change authorization; recheck exact source MD5 and current source data before applying.
5. Validate real authorized signed requests, including manager/Supervisor versus employee/viewer, cross-workspace, revoked sessions, clock-in/out GPS independence, retry and rollback invariants.
6. Run controlled historical reconciliation, compare authoritative record IDs and GPS statuses, activate authorized frontend view, and complete TimeTracker workflow regression.

Current milestone score is reported from verified checklist evidence, not from optimistic SQL staging.
