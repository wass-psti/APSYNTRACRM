# CP-TL-REVISION-HISTORY-08 — Approved revision supersession

**Project:** APSYNTRA CRM / TradeLink, existing repository and Supabase only.

## Defect

An Approved record was not editable through the application, and the existing signed
`tl03_document_save` RPC rejected Approved documents. As a result, a naturally
superseded Approved historical revision could not be created via normal workflow.
This was an actual functional blocker, not a missing acceptance record.

## Implementation

- All Documents offers **Revise Approved** on existing current Approved records.
- The existing editor loads the authoritative document, preserves its document
  number and assigned company, and defaults the next revision to **For Approval**.
- New operation `revise-approved` uses the existing `tl03_document_save` RPC
  and its original signed session/Board manager/workspace checks.
- Server revalidates the two existing signed reviewers on the current Approved
  revision, verifies its immutable snapshot, and atomically creates a new
  revision with a fresh For Approval state and unchanged original approval
  history. Existing user accounts and reviewer assignments are preserved.
- A legacy unassigned company is explicitly carried forward as the existing
  historical Sales & Services default. Other company substitutions, document
  renumbering and reviewer reassignment are rejected.
- Stale expected revisions, unsupported status transitions and identical
  no-change updates fail. Exact same-actor retry is idempotent.

## Evidence

- Disposable PostgreSQL 17: existing manager signed operation, forced denials,
  legacy default, snapshot immutability, revision-bound retry and new primary
  and secondary reviewer approvals: **PASS**.
- Focused frontend tests and production build are run separately.
- No production records, migrations or permissions were changed during
  implementation.

## Production activation

**Pending explicit production database change approval.** Migration
`20261117044055_tradelink_approved_revision_flow.sql` changes the existing
`private.tl03_save` function in production; it must not be applied or
deployed as active UI without that approval. No new role, table, policy or
authentication system is required.

The final genuine historical Approved reprint requires an actual business
revision after activation and independent signed browser evidence. Disposable
test results must never be reported as production historical acceptance.
