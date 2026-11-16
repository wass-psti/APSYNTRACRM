# CP-TT-FM1-APP-04 — System Admin Attendance Record Management

**Status:** IMPLEMENTED — local frontend, PostgreSQL migration, and disposable acceptance verified; production migration/deployment pending PR integration.
**Application:** APSYNTRA CRM · TimeTracker Attendance
**Surface:** Dedicated TimeTracker application · Log tab
**Migration:** `20261116084228_cp_tt_attendance_admin_record_management_01.sql`

## Scope

Add individual and bulk attendance record management to the existing TimeTracker Log for the existing `System Admin` module role. Preserve the FM1-aligned application shell, native TimeTracker data model, signed CRM session, existing Supabase project, attendance board, DomainApi, and current role assignments.

No second database, authentication system, role hierarchy, or parallel attendance store is introduced. Existing non-System Admin Log views remain read-only and retain their existing self/team visibility rules.

## Delivered functionality

### Individual record editing

- Edit employee, work location, department, Clock-In timestamp/GPS, Clock-Out timestamp/GPS, Active/Completed attendance status, and credited working duration.
- Resolve employee choices from the signed active TimeTracker workspace directory; do not accept arbitrary or inactive employee identities.
- Store GPS changes as `administrative-correction` evidence, distinct from browser-captured GPS.
- Support automatic credited duration using the existing Philippine Time unpaid-break policy or an explicit manual credited-duration override.
- Preserve existing timestamp seconds/milliseconds when unrelated fields are edited; reject Clock-Out values earlier than Clock-In.

### Individual and bulk deletion

- Delete one selected attendance record or up to 100 selected records in one bulk action.
- Remove source records and their linked attendance board projections/items in the same database transaction.
- Keep immutable before/after administrative audit evidence in the private schema; do not leave stale board projections.

### Bulk editing and interface

- Multi-select individual rows or all currently visible filtered rows.
- Bulk edits apply only populated fields; blank fields mean no change.
- Show management controls only when the signed TimeTracker module role is exactly `System Admin`.
- Preserve the ordinary Log experience for other roles.
- The dedicated `#/time-tracker` route passes the same System Admin management state as the legacy attendance-board entry route.
- Editor keyboard handling includes Escape cancellation and a contained Tab focus cycle.

## Persistence and consistency

- Existing authoritative `module_state_entries` attendance state remains the source of truth.
- New signed RPCs: `timetracker_attendance_admin_snapshot` and `timetracker_attendance_admin_mutate`.
- Mutations use the existing workspace/board scope and exact System Admin module-role check.
- Optimistic revision compare-and-swap prevents stale editors from overwriting newer attendance changes.
- Each successful mutation updates the authoritative state, rolling recovery copy, linked private attendance projection, and board item values atomically.
- A private append-only audit table records actor, action, selected record IDs, base/committed revision, before/after records, optional reason, and commit time.
- Lost or ambiguous mutation responses are not blindly retried. The UI asks the administrator to refresh and reconcile the current record state.

## Verification

- Frontend regression on rebased latest `main`: **2,454 passed, 0 failed**.
- Focused System Admin/client/Log tests: **38 passed, 0 failed**.
- TimeTracker Playwright/axe acceptance: **PASS**, including non-admin control absence, System Admin toolbar, row actions, individual/bulk editor fields, desktop/tablet/mobile existing views, and WCAG 2.2 AA checks scoped to the new management controls.
- Disposable PostgreSQL 17 migration and acceptance: **PASS**.
  - Individual correction of employee, timestamps, GPS, location, department, status, and manual duration.
  - Bulk field updates and projection reconciliation.
  - Stale-revision conflict rejection.
  - Non-System Admin snapshot and mutation denial.
  - Individual and bulk deletion, linked board item/projection cleanup, rolling recovery copy, private audit cardinality and immutability.
- Existing CP-TT-GPS01 disposable projection acceptance: **PASS**.
- Existing concurrent duplicate Clock-In/Clock-Out acceptance: **PASS**.
- Existing fail-closed rollback/data-preservation acceptance: **PASS**.
- Production frontend build: **PASS**; existing large-chunk and FuelTrans mixed-import warnings remain non-blocking.
- Changed-file ESLint, Node syntax checks, Prettier workflow check, `git diff --check`: **PASS**.

## Deployment boundary

The migration and frontend changes are prepared for PR integration. The production Supabase migration and GitHub Pages deployment are not claimed complete until the migration is applied to the existing project and the deployed signed System Admin Log is verified end to end.
