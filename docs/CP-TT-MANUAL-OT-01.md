# CP-TT-MANUAL-OT-01 — Manual Overtime Submission

## Objective

Add retrospective manual overtime entry to the existing TimeTracker OT module. System Admins create records for active TimeTracker employees; the employee remains the OT owner and the administrator is retained as the submitting actor.

## Implementation

- Reuses `public.timetracker_ot_requests` and `public.timetracker_ot_audit`.
- Adds `submission_source` (`employee` or `manual_admin`) and `submitted_by` provenance columns. Existing requests are backfilled as employee-submitted with the owner as submitter.
- Adds `timetracker_ot_submit_manual`, which accepts an employee owner, historical date, same-day start/end times, and reason.
- Keeps the existing `timetracker_ot_submit` date window and employee-owned behavior unchanged.
- Preserves the existing OT snapshot scope values for compatibility. The signed snapshot adds `manualOtManager`.
- System Admins see their own regular OT plus all workspace manual entries, and can create, approve, or reject manual entries only. Bootstrap administrators retain their existing review capability for all requests.
- Ordinary employees see their own regular OT plus all workspace manual entries in a read-only Manual OT section. They cannot create, approve, or reject manual entries.
- The decision RPC serializes on the same per-employee advisory lock used by OT submission and rejects self-approval.
- Manual entry audit rows use the existing immutable audit table and record the owner, actor, interval, and source.
- The OT tab adds a dedicated Manual OT Submission section and historical week date navigation.

## Business rules

- Manual OT dates must be in the past, or the current Philippine date with an end time that has already elapsed.
- Start and end are same-day values; duration remains 30–360 minutes.
- Reason remains 10–500 characters.
- Exact intervals already submitted or approved for the same employee are rejected as duplicates. Rejected intervals may be resubmitted.
- Manual records enter `Submitted`; they are not auto-approved.
- Existing employee submission date validation remains 30 days in the past through 7 days in the future.
- Manual OT visibility is limited to the active workspace and does not expose the submitting or deciding actor to ordinary employees.

## Validation

- `node --test frontend/tests/time-tracker-overtime.test.mjs frontend/tests/time-tracker-overtime-command.test.mjs`
- `bash scripts/cp-tt-flow01f-disposable-acceptance.sh` — runs isolated PostgreSQL 17 OT and attendance concurrency acceptance.
- `npm run test:time-tracker:e2e` — browser acceptance, including System Admin manual entry, employee read-only visibility, and mobile layout.
- `npm test` — complete frontend regression suite.
- `npm run check`, `npm run lint`, and `npm run build` — repository syntax, lint, and production build checks.

## Inference-only constraint

This change adds no model training, gradient descent, backpropagation, fine-tuning, model parameter updates, training loops, or ML dependencies. The existing inference-only architecture is untouched.
