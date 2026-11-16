# CP-TL-LEGACY-WORKFLOW-03 — Acceptance Record

**Baseline:** `1806e168151bcfd73954359efb50d64c4e0c3a1d`  
**Supabase project:** Existing APSYNTRA CRM project  
**Migration:** `20261116070000` (already installed; do not reapply)  
**Scope:** Read-only production verification and disposable PostgreSQL 17 acceptance. No production business writes.

## Result summary

| Requirement | Status | Evidence |
|---|---|---|
| Installed migration and RPC inventory | VERIFIED | Production ledger row present; expected sequence table, trigger and RPCs exist |
| RPC ownership, search path and grants | VERIFIED | Production catalog inspection; public create and analytics wrappers are SECURITY INVOKER, empty search_path, authenticated EXECUTE only |
| Existing production documents preserved | VERIFIED | Three active documents remain; their document numbers and revisions are unchanged |
| Existing Board projection | VERIFIED | All three active documents have one matching, non-archived Board item with current title and timestamp |
| Signed All Documents read | VERIFIED | Five authenticated POST requests to `tl03_documents_list` returned HTTP 200 during the observed signed session; the list RPC returned 15 rows (3 active, 12 archived) under the same authenticated session context |
| Six-type automatic numbering | VERIFIED — disposable PostgreSQL 17 | ESI, PL, DR, AR, Q and PO each began at the legacy-compatible `011130` |
| Concurrent numbering | VERIFIED — disposable PostgreSQL 17 | Eight simultaneous quotation creates produced eight unique sequential numbers and eight distinct Board item IDs |
| Idempotent retry | VERIFIED — disposable PostgreSQL 17 | Same document ID and unchanged payload reused the original assigned number |
| Failed transaction rollback | VERIFIED — disposable PostgreSQL 17 | Invalid date rejected; the subsequent valid ESI create still received `ESI-011130` |
| Assigned-number immutability | VERIFIED — disposable PostgreSQL 17 | Update trigger rejected a changed document number |
| Document date and due date | VERIFIED — disposable PostgreSQL 17 | Valid ISO dates persisted in saved document content; invalid calendar dates rejected |
| Quotation commercial vs workflow state | VERIFIED — disposable PostgreSQL 17 | Commercial status and workflow state returned in separate aggregates |
| Tax by currency and VAT treatment | VERIFIED — disposable PostgreSQL 17 | PHP 12%, USD zero-rated and EUR exempt groups matched fixture totals |
| Receivables aging and payment allocation | VERIFIED — disposable PostgreSQL 17 | Exact ESI reference and currency matching, excess cash, mismatched-currency unallocated cash, pending cheques, missing-due-date exclusion and full-history aging passed |
| Analytics RPC under authenticated session context | VERIFIED — SQL session-context replay | The actual session identity and session ID observed in signed API traffic were used in an authenticated database-role context; production aggregate returned the three active quotation records |
| Analytics UI / genuine browser analytics request | PENDING | `TL03_ANALYTICS_ENABLED=false`; no browser analytics RPC was issued |
| Production automatic-number creation | NOT ACTIVATED | `TL03_AUTOMATIC_NUMBERING_ENABLED=false`; no production document was created and no number was issued |
| Genuine production create/retry and new-record synchronization | PENDING | Must remain untested in production until separate explicit write-activation authorization |
| Real browser refresh/reopen/module-switch acceptance | IMPLEMENTED-UNVERIFIED | Existing regression coverage passes; current browser session shows an unsaved local quotation editor, not a newly persisted record |

## Production baseline

The production migration ledger contains version `20261116070000`. The sequence table has zero rows. The three active production documents are quotations; no active ESI or Payment AR records exist, so production tax-invoice and receivables-aging figures are correctly empty.

All three active document rows join to their existing Board item by `board_item_id`; each Board title equals its authoritative document number, the Board item is not archived, and its timestamp is not older than the document. No existing production document or Board item was changed by this acceptance work.

The signed API log window recorded five authenticated `tl03_documents_list` POST requests with HTTP 200. The same session-context read returned the existing All Documents collection, including active and archived history. This proves the signed read endpoint is reachable; it does not prove a new production document can be created.

The production analytics RPC was invoked read-only in an authenticated SQL role context using the user/session identity observed in the signed API logs. This is database-role/session-context evidence, not a browser-originated analytics request. The UI feature flag remains OFF.

## Disposable PostgreSQL 17 acceptance

The installed migration source was applied only to temporary PostgreSQL 17 containers with test-only stub dependencies. No production migration was reapplied.

Acceptance covered:
- All six document prefixes and independent counters.
- Eight concurrent creates with unique sequential numbering.
- Same-ID retry and assigned-number immutability.
- Invalid-date rejection and transaction rollback without consuming a number.
- Document date and optional due-date persistence.
- One Board projection per saved fixture and no duplicate Board item.
- Commercial quotation statuses independent of workflow state.
- Tax aggregates separated by currency and VAT classification.
- Exact invoice-number and currency matching for cash.
- Unallocated mismatched-currency cash, excess cash, pending cheques and invoices excluded for missing due dates.
- Aging computed from full history even when the selected reporting period excludes the fixture rows.

## Frontend and repository verification

- Full frontend suite: **2,392 passed, 0 failed**.
- Production Vite build: **PASS**.
- `npm run check`: **PASS**.
- Changed TradeLink module syntax checks: **PASS**.
- Migration-source SHA-256 manifest verification: **PASS**.
- `git diff --check`: **PASS**.

The build emits existing non-blocking warnings for the startup-guard script's non-module script tag, one ineffective dynamic import, and the large main JavaScript chunk. The build completes successfully.

Live Pages source files `frontend/app.js`, `frontend/tradelink-draft-workspace.js`, `frontend/tradelink-domain-client.js`, and `frontend/tradelink-analytics.js` match the current `main` source hashes. The service worker is network-first, so it does not intentionally pin stale JavaScript behind a deployment.

## Activation boundary and next step

Both flags remain OFF:

- `TL03_AUTOMATIC_NUMBERING_ENABLED=false`
- `TL03_ANALYTICS_ENABLED=false`

No production document was created, edited, archived, or assigned a number. No production write feature was enabled. Existing signed manager checks and the existing API/RPC contracts were preserved.

**Next milestone:** CP-TL-LEGACY-WORKFLOW-04 — Read-Only Analytics UI Activation and Genuine Signed Browser Analytics Acceptance. It should enable only the read-only analytics path after its production function contract is confirmed, verify the actual signed browser request and rendered aggregates, and leave automatic-number production writes disabled pending separate explicit operational authorization.
