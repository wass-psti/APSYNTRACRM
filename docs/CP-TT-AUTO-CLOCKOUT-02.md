# CP-TT-AUTO-CLOCKOUT-02 — Lifecycle Acceptance and Synchronization Closeout

**Date:** 2026-11-20 (Asia/Manila)
**Scope:** Genuine signed-employee automatic Clock-Out acceptance, nine-hour credited-work threshold, 30-minute grace, approved overtime integration, durable worker behavior, attendance persistence, audit and existing Attendance Board synchronization.
**Implementation disposition:** Production scheduler and trigger are deployed and operational. Disposable PostgreSQL 17 lifecycle acceptance passed in PR #623 and again after merge to main. Genuine signed-employee browser acceptance remains pending.

## 1. Existing production evidence

Read-only production inspection confirmed:

- The dedicated `tt-auto-clockout-processor` pg_cron job is active at a 30-second cadence.
- 607 scheduler executions had succeeded at final inspection; zero failed executions were recorded.
- 15 active attendance records have corresponding automatic-clock-out scheduler rows.
- All 15 scheduler rows reference existing attendance records; none references a missing or already-closed source record.
- 15 registered sessions have no scheduler errors and have recent evaluation timestamps.
- 17 attendance records were active at the time of inspection. The two unregistered records predate activation; one is a legacy record with no board projection. Neither was modified or backfilled.
- The existing board projections are consistent with the 15 registered sessions plus the one pre-activation active record that already had a projection.
- No automatic clock-out has yet occurred in production: the eligible active sessions were still below their thresholds at inspection time. The automatic audit count and automatic attendance-record count were both zero.
- No approved OT requests were present in the inspected current-day window. The next registered nine-hour threshold was 16:33 PHT on 2026-11-20, with a 17:03 PHT grace deadline if no approved OT extension applies.

Production inspection was read-only. No attendance, OT, role, permission, workspace or board data was changed.

## 2. Local regression evidence

- 46 focused tests passed across automatic clock-out policy, native TimeTracker, and attendance-board projection behavior.
- The TimeTracker browser acceptance passed, including the responsive desktop/tablet/mobile layout and WCAG 2.2 AA checks.
- Nine-hour credited-work threshold and PHT unpaid-lunch deduction passed.
- Grace entry, deadline calculation, OT approval timing, OT chaining, late approval rejection and refresh-resumed countdown passed.
- Signed snapshot actor/session binding and automatic attendance-board projection contracts passed.

These are frontend/unit and fixture-browser results, not proof of a genuine employee production session.

## 3. Disposable PostgreSQL acceptance

Merged isolated PostgreSQL 17 acceptance assets:

- `sql/tests/cp-tt-auto-clockout-02-disposable-setup.sql`
- `sql/tests/cp-tt-auto-clockout-02-disposable-acceptance.sql`
- `.github/workflows/cp-tt-auto-clockout-02.yml`

The workflow reconstructs the existing TimeTracker schema prerequisites in a disposable PostgreSQL 17 service, installs the already-reviewed automatic-clock-out migrations, and exercises:

1. Activation-boundary registration without historical backfill.
2. Seven synthetic employee sessions covering monitoring, grace, grace expiry and overtime cases.
3. Employee OT submission and bootstrap approver OT decision through the actual RPC functions.
4. Approved OT readback through the signed snapshot contract.
5. Automatic Clock-Out at the grace deadline and at the approved OT endpoint.
6. Rejection of an approved interval that begins after grace.
7. Automatic attendance state, explicit no-GPS evidence, audit, private projection, Board item and typed Board value synchronization.
8. Worker replay idempotency and the dedicated 30-second scheduler registration.

All fixture writes are transaction-scoped and rolled back. The workflow uses an isolated disposable database and has no production database credentials or connection. The dedicated workflow passed on PR #623 (run 44654363769) and after merge to main (run 44654515368). The GitHub Pages build/deployment run 44654514755 also succeeded; no frontend or production migration changes were part of this acceptance-harness merge.

## 4. Remaining production acceptance

The browser currently holds a genuine signed System Admin session, not an Employee session. The current TimeTracker view reports no department assigned to that System Admin account, so no Clock-In was attempted. The current browser session therefore cannot establish genuine signed-employee behavior.

Production closeout still requires:

- A genuine employee account signed in through the normal application.
- Its own active Clock-In session and signed automatic-clock-out snapshot.
- Refresh/reopen continuity while the server scheduler continues independently of the browser.
- An approved OT request created and approved through the existing workflow, then verified against the employee's persisted cutoff.
- Natural threshold/grace/overtime completion evidence, followed by canonical attendance, audit and Attendance Board readback.

No test Clock-In, forced production timestamp, synthetic GPS fix or production attendance mutation will be used to manufacture that evidence.

## 5. Scope and change boundaries

No new role, permission, authority, approval or workspace restrictions are introduced by this milestone. Existing TimeTracker authorization contracts and signed-session behavior are preserved. The production scheduler, trigger and migrations are not being changed as part of the acceptance harness unless a reproducible disposable or live defect establishes a necessary correction.
