# CP-TT-FLOW-01D — Signed TimeTracker Runtime Readback and Recovery

## Genuine runtime evidence (November 17, 2026)

- Connected Chromium APSYNTRA CRM Overview tab had an authenticated workspace session.
- Via the existing TimeTracker sidebar navigation, the signed session resolved to System Admin and reported "Signed Clock writes active."
- Clock reported one existing active attendance session and its original clock-in time. A full browser reload recovered the same active attendance session, same time and accepted signed Clock capabilities, without issuing any Clock write.
- The real OT tab loaded the signed weekly snapshot and verified existing bootstrap reviewer scope, with zero authorized requests in the week and visible submission controls.
- Read-only Supabase PostgreSQL inspection reported one active attendance-board projection, zero completed projections, zero OT requests and zero OT audit events at the checkpoint.
- No existing attendance session was ended or altered. Production OT was not created or approved. The active record is a real live session, NOT a designated disposable test record.

## Found and corrected

A transient "Signed workspace context changed during loading" error remained visible after the later signed TimeTracker snapshot succeeded. The TimeTracker loader now clears stale bootstrap/read errors when a fresh VERIFIED_READ snapshot completes, **only if no pending Clock write exists**. Uncertain Clock In/Out reconciliation warnings remain untouched, and existing signed server validation still applies.

## Automated verification

- Full Node suite: 2,649 PASS, 0 FAIL.
- Vite production build: PASS.
- TimeTracker Chromium browser test including isolated two-tab pending marker, reload reconciliation, OT contract controls and WCAG 2.2 AA: PASS.
- Targeted stale-error regression and source lint: PASS.
- Live production Clock reload: signed active record persisted with no mutation.

## Outstanding genuine acceptance, not invented

- The signed reload validated an **existing active attendance session**, not a previously interrupted Clock RPC.
- Live OT request/decision workflow and audit cannot be verified end-to-end while the OT ledger is empty and no disposable employee/approved reviewer test sequence is designated.
- Do not use or clock out the real employee's active attendance record for destructive test acceptance.
- Existing lunch-deduction policy, credited working hours, session permissions, RLS, grants and historical data remain unchanged.

## Operational next gate

CP-TT-FLOW-01E — Designated Disposable Attendance/OT Signed Mutation Acceptance and Final Closeout. Requires a genuinely disposable attendance test identity/record and a separate existing reviewer to perform one-time Clock In/Out and OT submit/decision, audit, revision and projection readback. No new permissions or authorization restrictions. If these prerequisites cannot be supplied, close only the read-only and automated gates; do not claim full production acceptance.
