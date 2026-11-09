# CP-TL-PDF02 — Signed PDF stage activation readiness

**Status:** SOURCE-ONLY / NOT APPLIED TO ANY DATABASE. This source does **not** issue approved PDFs or activate `Use Time Now` controls.

## Dependencies and blocking checks

1. Inspect production schema drift for `private.tl03_can_manage`, `private.tl03_deny_event_change`, `public.tradelink_documents`, and `public.work_board_items`. Candidate deployment is a separate protected database change.
2. **Role mismatch:** `private.tl03_can_manage(uuid)` currently requires effective module `General Manager` and board `manage`. This may deny nominated Finance, QC, and Logistics staff even when their verified emails match. Define and separately authorize a least-privilege, signed-session, workspace-scoped PDF approver capability before runtime activation; do not grant General Manager merely to pass approval tests. Approval must not confer draft edits, Board management, or other permissions.
3. Confirm submitted workflow transitions and their signed, revision-locked backend are actually deployed and pass genuine HTTPS signed-user tests. The repository's workflow feature gates remain disabled.
4. Test on an isolated nonproduction PostgreSQL environment using real schema and disposable signed accounts: correct primary/secondary event; primary alone; secondary without primary; wrong/foreign/revoked/unconfirmed accounts; denied roles; stale/archived/edited revision; concurrent double submission; multi-workspace isolation; immutable audit; and loss of session mid-request.
5. Confirm module-specific dropdown assignments persist as canonical emails in signed `DocumentRecord.content`; do not silently reinterpret legacy display names or unverified account nominations.
6. Extend the electronic PDF issuer to read the stage events **from the database** under lock, verify revision, assignment and permissions, bind an approved PDF template digest, use immutable storage and an idempotent issuance key, and return evidence verified by `validateTradeLinkPdfIssuanceReceipt`. Never consider the browser's returned JSON proof of cryptographic signing.
7. Supply, review, and approve the actual PDF layout/template before enabling issuance. A browser print-to-PDF copy is not an electronically issued/approved record.

## Safeguards implemented in the source candidate

- Server-side `auth.uid()` and email-confirmed identity verification; existing signed-session/Board/workspace boundary; role gate preserved
- Row-level document and Board locking; current revision; rejection of archival and wrong workflow states
- Explicit module/stage email allowlists, including fixed Quotation supervisor and management choices
- Each stage captures actor UUID, assigned email, server timestamp and unique event ID independently
- Strict primary-then-secondary order; unique `(document_id, document_revision, stage)` prevents duplicate approvals
- Private RLS-enabled, trigger-protected append-only event table; no direct client DML permissions
- Signed read endpoint returns only stages on the **current** revision
- Frontend client methods remain completely disabled with `TL03_PDF_STAGE_ENABLED=false` until production verification

## Acceptance status

The tests here are source-contract tests, not PostgreSQL integration tests or a signed-user acceptance rehearsal. Do not interpret passing Node tests, repository merge, or static PDF preview as backend deployment, successful electronic approval, or issuance readiness.
