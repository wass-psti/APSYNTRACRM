# CP-TT-AUTO-CLOCKOUT-02B — Signed-employee lifecycle and production Board synchronization

**Date:** 2026-11-20 (Asia/Manila)
**Scope:** Functionality and production acceptance; no new role, grant, workspace or permission restrictions.

## Verified read-only production findings

- The automatic-clock-out job is active on a 30-second schedule; 721 executions succeeded and no failed executions were observed at the 10:33 PHT inspection.
- 18 live sessions were in MONITORING with zero stored scheduler errors.
- The earliest registered nine-hour credited-work threshold is 16:33:20 PHT; absent approved OT, its grace deadline is 17:03:20 PHT.
- The CRM browser is signed in as a System Admin, not an Employee. Genuine signed-employee browser acceptance is therefore not yet satisfied.
- There are 20 open authoritative attendance records: 18 registered by the post-activation scheduler, two from before activation.
- Three recently created signed Clock-In records have no private attendance-board projection. Their raw attendance commits and manual mutation audits exist and have the expected revisions; all three were registered by the durable scheduler. One older pre-activation attendance record also lacks a projection.
- Direct inspection of the live attendance commit SQL established that the atomic projection upsert call is absent.
- The employee-department migration replaced the attendance RPC without its projection call; the later catalog migration repeated the omission. The current live function includes the catalog validation but omits Board projection synchronization.
- Zero automatic attendance mutation audits existed at inspection; natural overtime and grace completion have not yet been observed.

## Prepared corrective implementation

The new 20261120150000 atomic projection restore migration is STAGED — NOT AUTHORIZED FOR PRODUCTION ACTIVATION. It restores precisely the existing projection write inside the signed attendance RPC while preserving the latest dynamic department catalog check, GPS validation, session behavior, audit and existing EXECUTE privileges. If projection fails, canonical attendance and audit must roll back in the same transaction.

The disposable SQL acceptance and workflow run synthetic employee signed Clock-In/Out, department catalog validation, Board projection, audit, typed columns and one-to-one lineage in disposable PostgreSQL 17. No live employee accounts or GPS fixes are simulated in production.

## Remaining gates

1. Disposable PostgreSQL integration must pass on the exact corrected SQL and committed source; fix only reproducible defects.
2. Separate explicit approval is required before replacing the production attendance RPC and before reconciling preexisting missing production Board projection records. No backfill is included in the staged migration.
3. After authorized activation, read-only reconciliation must show all newly signed Clock-In records have one matching private projection and Board item; verify actual rejected/failed transactions roll back atomically.
4. A genuine signed Employee browser session must confirm its own Clock-In, refresh/reopen continuity, approved OT readback and natural nine-hour/grace/OT closeout.
5. An actual natural server Clock-Out must reconcile authoritative attendance, audit, projection, Board item and credited working duration. Do not fabricate timestamps, GPS or payroll records.

**Milestone status:** IMPLEMENTED-UNVERIFIED for candidate repair, BLOCKED for production write activation, PENDING for natural automatic Clock-Out and genuine signed-employee browser acceptance.
