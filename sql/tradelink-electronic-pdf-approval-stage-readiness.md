# CP-TL-PDF02 — Signed PDF stage activation readiness

**Status:** SOURCE-ONLY / NOT APPLIED TO ANY DATABASE. This source does **not** issue approved PDFs or activate `Use Time Now` controls.

## Dependencies and blocking checks

1. Inspect production schema drift for `private.tl03_can_manage`, `private.tl03_deny_event_change`, `public.tradelink_documents`, and `public.work_board_items`. Candidate deployment is a separate protected database change.
2. **Least-privilege candidate implemented (not deployed):** `private.tl03_can_pdf_approve(uuid)` requires an active signed session, Board view access, active workspace and enabled TradeLink module role. The stage RPC independently matches the authenticated, email-confirmed actor to the saved assignment and module allowlist. The existing General Manager-only document management guard is unchanged. Confirm the exact module-role policy for real Finance, QC, Logistics and Management users before production activation.
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

CP-TL-PDF03 additionally runs the candidate in an isolated disposable PostgreSQL 17 GitHub Actions job with synthetic authenticated identities, stage ordering, duplicate/stale denial, module role separation, RLS and revoked-session checks. This is **not** a genuine Supabase signed HTTPS acceptance or production deployment. Additional concurrency, revision-change, and end-to-end approval issuance verification remain pending; no approval or PDF issuance feature flags are enabled.
