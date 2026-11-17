# CP-TT-FLOW-01B — Signed Attendance Recovery & Overtime Accounting Reconciliation

## Verified production contracts (read-only inspection)

Existing Supabase project: jtlusodorfnyzgyuewkz. Live PostgreSQL catalog returned public.timetracker_attendance_capabilities, public.timetracker_attendance_commit_v2, public.timetracker_ot_snapshot, public.timetracker_ot_submit, and public.timetracker_ot_decide. The three OT functions already grant authenticated EXECUTE; none needed new grants or migrations. Inspected OT definitions require the established scoped TimeTracker board/workspace, authenticated actor, date/time and reason validation, and append OT audit records. The existing decision RPC additionally enforces bootstrap approval, no self-approval, and submitted-state conflict checks; these safeguards were preserved unchanged.

## Implemented

- Enabled previously staged OT submission and approval/rejection controls ONLY when the existing signed snapshot reports otContractActive, and in the existing bootstrap review scope for decisions.
- Preserved existing TimeTrackerNativeClient receipt identity checks and existing server RPCs.
- Added read-only approved OT/attendance overlap reconciliation to the existing Reports view. It accepts only signed authorized OT records, matches exact employee ownership and clock time, counts only approved same-day OT intervals beginning from 18:00, and unions overlaps to avoid double-counting.
- Report output explicitly identifies these OT minutes as informational and DOES NOT add them to persisted attendance creditedMs.
- No recalculation of past attendance, no new payroll ledger, roles, RLS policies, RPCs or credential changes.

## Policy differences deliberately not activated

The reference lunch policy ('60 minutes when crossing 13:00') differs from authoritative SQL's 12:00–13:00 PHT overlap deduction. A universal 570-minute cap and addition of approved OT to the persisted duration are also absent from the existing signed commit. Enabling those would materially change credited attendance and payroll rules, and requires separate authoritative policy confirmation and transactional backend implementation.

## Acceptance boundaries

- Unit/regression and disposable browser acceptance cover comparison math, OT UI gating, signed result projections, duplicate-prevention preservation, accessibility, and build.
- Read-only inspection of actual Supabase function definitions and grants confirms deployment prerequisites.
- No genuine live production attendance or OT record was created, changed, approved or deleted in this implementation.
- Genuine signed browser reload recovery and safe two-tab actual-session acceptance remain PENDING; an actual signed context capable of those checks was not available through the connected read-only browser. Never simulate signed production success.

## Follow-up milestone

CP-TT-FLOW-01C — Genuine Signed Attendance/OT Workflow Readback, Runtime Reconciliation, and Final Operational Acceptance. Validate authenticated OT creation/decision using designated nonhistorical fixtures only, signed two-tab recovery behavior, full board projection reconciliation, and confirm whether the organization authorizes a change to the authoritative attendance duration formula. No production finance/payroll rule change without the explicit policy decision.
