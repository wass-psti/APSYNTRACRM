# CP-TL-08B — Legacy Contract Regression Closure and Dual-Reviewer Acceptance

**Date:** 2026-11-12
**Status:** IMPLEMENTED-UNVERIFIED — automated acceptance passed; live two-account production acceptance and frontend release remain pending.
**Scope:** TradeLink document Save/For Approval/Draft behavior, assigned reviewer runtime, automatic approval, legacy edit compatibility, Board synchronization, and controlled frontend release.

## Implemented

- New document Save defaults to `for-approval`; `draft` is sent only when explicitly selected.
- Existing workflow labels and post-approval status transitions are retained.
- Assigned-reviewer read and review RPC adapters use the existing signed identity, workspace, and Board VIEW context.
- The first assigned reviewer records a server timestamp while the document remains `for-approval`; the second distinct assigned reviewer atomically sets `approved`.
- Review timestamps are stored in append-only, revision-scoped server records. Duplicate submissions are idempotent; stale revisions and non-assigned accounts are rejected by the backend.
- Assigned reviewers can inspect their saved document and record their own validation without receiving document-management capability.
- Printing re-reads the authoritative record and requires the current saved revision to be `approved`.
- A legacy `revision-required` editor path is preserved. Saving it creates a new revision and routes it back through the existing For Approval/Draft choice.
- The original PDF template has not been replaced or invented.

## Database migrations

- `20261112091535_tradelink_for_approval_dual_review` — applied to the existing WatchdogWorkspace Supabase project.
- `20261112093727_tradelink_revision_required_edit_compat` — applied to the same project. It changes only the revision-required edit predicate; function ownership, `SECURITY DEFINER`, empty `search_path`, and authenticated-only execution remain verified.

No new Supabase project was created. No user roles, module roles, workspace memberships, or permission grants were changed by CP-TL-08B.

## Automated verification

| Check | Result |
|---|---:|
| TradeLink test suite | 290/290 PASS |
| Full frontend test suite | 1,930/1,930 PASS |
| Shipped JavaScript syntax | PASS |
| GitHub Pages source contract | PASS |
| Diff whitespace check | PASS |
| Chromium visual fixtures | 5/5 PASS (desktop, tablet, mobile) |

Visual fixtures covered Quotation desktop/mobile, Payment desktop, Delivery desktop, and Packing List tablet. They verify geometry and zero horizontal overflow; they do not represent authenticated runtime acceptance.

## Live database observations

- The existing TradeLink document table contains 14 documents; all 14 remain Draft.
- Two documents are currently non-archived. One has two distinct active, confirmed reviewer accounts in the existing workspace. One legacy quotation has no reviewer-email fields and remains unchanged; its manager can open and save it through the current assignment form before it becomes reviewable.
- No production document was created, edited, approved, or deleted during this milestone.
- The two reviewer accounts' real signed sessions and Board VIEW behavior have not yet been exercised end-to-end.

## Acceptance still pending

1. Use separate, genuine signed sessions for the manager and both assigned reviewers.
2. Exercise Save → For Approval and explicit Save as Draft against an approved QA document fixture.
3. Verify the first reviewer timestamp, second reviewer timestamp, atomic Approved transition, duplicate handling, and refresh persistence.
4. Verify the approved-only print action and subsequent status update against the refreshed saved record and Board projection.
5. Complete PR checks, merge, deploy the frontend, and repeat the signed-user smoke test on the deployed Pages application.

A production document mutation is deliberately not used as a test fixture without separate approval. This preserves existing business records while the automated and visual acceptance evidence is completed.
