# CP-TT-FLOW-01 — Attendance Lifecycle, Policy Reconciliation and Reload Recovery

**Repository:** wass-psti/APSYNTRACRM
**Application:** TimeTracker Attendance
**Target:** Existing signed PostgreSQL attendance RPC and TimeTracker native application
**Implementation boundary:** Functionality and session resilience only; no production attendance data, schema, credentials, roles or permissions were changed.

## Existing architecture retained

- Identity: existing APSYNTRA CRM signed session and module role.
- Authoritative records: timetracker.attendance.v1 in the existing Supabase project.
- Writes: timetracker_attendance_commit_v2 with serialized server transactions and append-only audit/board projection reconciliation.
- GPS: fresh browser capture with independent Clock In/Out evidence.
- Duplicate prevention: current active-session check, backend per-actor locking and signed readback.
- No monday.com board IDs, secondary database, synthetic attendance records, or standalone authentication added.

## Existing versus supplied reference policy

| Concern | Existing APSYNTRA implementation | Supplied monday.com reference | CP-TT-FLOW-01 action |
| --- | --- | --- | --- |
| Clock In after 08:00 PHT | Classified Late | Classified Late | Preserve |
| Lunch | Deduct actual overlap with 12:00–13:00 PHT | Deduct 60 minutes when crossing 13:00 | Preserve current authoritative policy; replacement requires explicit business-rule activation |
| Standard work | 9 credited hours reference | Not separately specified | Preserve |
| Maximum credited duration | No universal 570-minute cap in existing commit/projection | 570 minutes unless approved OT | Not activated: could change payroll and historical reports |
| Overtime | Staged OT request UI; live OT writes are not accepted in current source | Approved OT after 18:00 | Do not infer approval from timestamps; OT integration remains separate |
| Duplicate sessions | Disallow concurrent active sessions, signed reconciliation | Merge same-day punches within 3 minutes | Preserve existing records; do not silently consolidate audit history |
| Timezone | PHT for policy math, but native Clock today totals previously used device-local day | Daily operations on Philippine date | Correct native Clock today's-session filtering to PHT |
| Offline/reload | In-memory uncertain-write lock and signed readback | Write-ahead pending actions and cross-tab coordination | Add minimal recovery metadata only, never queue or replay writes |

## Recovery contract implemented

The browser may save a strictly allowlisted pending-operation marker just before the signed commit attempt. It contains:

- The signed actor, workspace, and existing board IDs.
- Operation type (clock-in or clock-out), targeted record ID where applicable, baseline revision, prior record IDs, location and department.
- A receipt-verified flag and a locally stored timestamp.

The marker does not contain GPS, notes, access tokens, whole attendance records, or an alternative attendance state. Keys are scoped to signed actor/workspace/board. Invalid or older-than-24-hour markers are discarded on access.

On reload or another tab's storage notification, the application displays the existing Verify session status workflow. Only a fresh signed read of the existing backend can confirm a commit and clear the marker, or explicitly show a retryable uncommitted state. A read failure, ambiguous state, or stale receipt does not replay a non-idempotent RPC.

Browser storage may be unavailable (private mode, quota, browser policy); in that case the prior in-memory signed workflow remains available without adding restrictions to ordinary attendance use. Explicit sign-out and session expiry clear the current-scoped marker.

## Milestone acceptance and deferred work

| Acceptance | Classification |
| --- | --- |
| Repository policy and server contract inspection | VERIFIED |
| Existing Clock In/Out, GPS and atomic backend preserved | VERIFIED by source/contract regression; genuine signed production execution not part of this change |
| PHT day summary on native Clock | VERIFIED by unit tests |
| Crash/reload-scoped pending-action recovery | VERIFIED by unit tests |
| No duplicate automatic clock RPC | VERIFIED by existing and focused unit tests |
| Cross-tab pending marker notification | VERIFIED by unit/source tests; two-window signed runtime acceptance pending |
| Full frontend tests, production build and disposable browser acceptance | To be recorded from CI |
| Live signed real-user Clock In/Out and post-reload recovery | PENDING, requires an actual designated production session or disposable test record |
| Lunch replacement, 570-minute cap and 18:00 approved OT | BLOCKED on authoritative business policy / persisted OT contract; no silent activation |
| Stale auto-closure, offline replay, three-minute merge | NOT IMPLEMENTED: would modify historical records and session semantics |

No new approval hierarchy or external role system is introduced. Follow-on implementation should target the existing approved OT ledger and authoritative shift-duration policy before changing time-credit calculations.
