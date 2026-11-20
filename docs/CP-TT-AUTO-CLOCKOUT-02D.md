# CP-TT-AUTO-CLOCKOUT-02D — Genuine Employee Natural Clock-Out and OT Acceptance

**Date:** 2026-11-20, Asia/Manila. **Scope:** Functionality and acceptance only. No changes to the existing role, permission, membership, OT approval or production attendance data.

## Verified milestones

- PR #630 restored the atomic signed Clock-In/Clock-Out attendance-to-Board operation in production under migration 20261120170000. All three verified post-activation missing projections were reconciled using the original identity, GPS and audit revisions. One older pre-activation record remains excluded and untouched.
- PR #632, the production restoration evidence and SHA-256 migration-source manifest repair, passed its required repository checks and merged to main as commit 0b25b5519e1bb9768b5353071ea6e2cc72a41bbe.
- The generic frontend validation and GitHub Pages deployment for that merged evidence commit passed.
- At 10:53:55 PHT, 18 monitored sessions were active, none lacked a Board projection, zero scheduler errors, zero automatic Clock-Out events and zero approved OT requests for today were present.
- The earliest nine-hour credited-work threshold was 16:33:20 PHT; without applicable approved OT, its grace deadline would be 17:03:20 PHT. Natural expiration must not be reported before it occurs.
- The currently open browser is signed in as System Admin with no Clock-In department, not as a genuine Employee test account.

## Repeatable live read-only acceptance

The SQL file sql/tests/cp-tt-auto-clockout-02d-live-readonly-acceptance.sql runs a single aggregate SELECT across canonical attendance records, the durable scheduler, automatic mutation audit, private Board projection, linked Board item and typed columns. It calculates credited duration using the existing production function and verifies server-generated no-GPS evidence rather than fabricated coordinates.

Its output includes registered/active/grace/overtime/completed sessions, missing Board projections, scheduler errors, missing or duplicate automatic audits, exact timestamp and credited-duration mismatches, typed Board status and hours, the next nine-hour threshold, and real natural grace versus approved overtime completions.

It reports separate statuses for natural Clock-Out and the approved OT endpoint (PENDING, VERIFIED or FAILED) and never marks natural completion passing merely because cron executed. The query is read-only, has no locks, impersonation, GPS invention or background scheduling. Its structural regression test enforces no data mutations.

## Pending final production gates

1. A real employee naturally reaches the nine-hour threshold and thirty-minute grace. Read back the server Clock-Out event, authoritative time, exactly one audit, credited duration and matching Board projection.
2. An actual approved OT request and approver decision under existing genuine signed identities. Verify the extension past grace and natural overtime ending.
3. A genuine signed Employee browser session establishes Clock/OT snapshot readback and refresh/reopen continuity. The current System Admin session cannot do this.
4. Confirm no duplicate source attendance, errors or cross-session Board mismatches. Keep the pre-activation exception outside automatic enforcement.

**Status:** Production restoration and post-activation Board consistency VERIFIED. Genuine employee, natural grace and approved overtime production lifecycle acceptance PENDING.
