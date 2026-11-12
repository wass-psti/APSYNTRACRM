# CP-TL-FUNC-01 — TradeLink Operational Functionality and Client-Blocker Audit

**Date:** 2026-11-12, Asia/Manila. **Scope:** Existing APSYNTRA CRM TradeLink module, document creation/edit/list/preview behavior and UI-side restrictions. No new project, permissions, roles, authentication layers, RLS, schema migration, frontend login or operational record edits.

## Repository and live read-only contract evidence

The current repository's `frontend/tradelink-domain-client.js` has `TL03_DOMAIN_READS_ENABLED=true` and `TL03_DOMAIN_WRITES_ENABLED=true`. The existing PostgreSQL project contains the signed `tl03_document_commit(uuid,uuid,bigint,text,jsonb)`, `tl03_document_read(uuid,uuid)` and `tl03_documents_list(uuid,integer)` functions with EXECUTE granted to `authenticated`, not `anon`. An `authenticated` grant alone is not a bypass: those functions retain signed board/session and role checks.

Production **does not** contain the optional `tl03_documents_page` RPC or the separate `tl03_document_submit`, review, decision, operational and electronic-PDF RPCs. `TL03_WORKFLOW_SUBMIT_ENABLED`, `TL03_WORKFLOW_REVIEW_ENABLED`, `TL03_WORKFLOW_DECISION_ENABLED`, `TL03_WORKFLOW_OPERATIONAL_ENABLED`, `TL03_PDF_STAGE_ENABLED`, and `TL03_ATTACHMENTS_ENABLED` are currently `false`. Those guards represent missing backend capabilities, not gratuitous frontend permissions. Do not simply flip flags or remove essential server contracts.

The current TradeLink board is the existing domain-bound board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`; the user was viewing its quotation Draft route. Browser connector access was unavailable outside the originating browser context, so **no genuine signed-browser round-trip is claimed for this new commit**.

## Confirmed implementation-level issues corrected

1. **Post-save false negatives with more than 50 documents.** The original frontend required a freshly committed document to be present in the server's bounded 50-row list. The signed authoritative `document_read` and Board item could already verify the committed record, so list-window omission was an unnecessary failure condition. `reconcileTradeLinkSavedListing` retains the exact signed record identity, revision, workflow and update timestamp in the current All Documents window, replacing a stale matching row if needed. It still rejects conflicting list identities, failed signed reads and stale/fraudulent receipts. It does not create duplicate Board items or write records again.
2. **Repeated missing-RPC requests on each All Documents visit.** The previous frontend repeatedly attempted `tl03_documents_page` and received an absent-RPC response. A scoped, in-memory capability marker now avoids repeating that request within the current loaded application after the first confirmed `PGRST202`/`42883` result. Other errors, including authenticated denials, continue to propagate. Reloading after the future backend activation permits rediscovery. The fallback remains truthful: the signed list includes **at most 50** rows and **is not server-wide search**.

## Access and restriction review

| Control | Finding | Disposition |
|---|---|---|
| Signed user and active workspace | Required for live domain writes/reads | PRESERVED |
| TradeLink board manager and effective module role | Existing server's domain boundary; cannot claim redundant solely from frontend | PRESERVED |
| Document number, revision and idempotency | Prevents duplicate or stale writes | PRESERVED |
| Exact saved document / board identity / content parity | Required data integrity | PRESERVED |
| Newly committed document must be in first 50 list entries | False blocker after exact authoritative read | CORRECTED |
| Missing optional search RPC attempted on each visit | Confirmed unnecessary network failure | CORRECTED |
| Submit, review, approve, operational, PDF, attachments | Corresponding production service not activated | PENDING backend contract, NOT bypassed |
| Hard-coded reviewer assignment email choices | Static UI nomination options, not authoritative account roles; may limit legitimate choices | REVIEW REQUIRED with verified business requirements, no role changes assumed |
| Client-side 5,000-character field limits, 100 line-item limit | Could be legitimate backend constraints; not established excessive | PRESERVED pending contract evidence |

## Acceptance and limits

- 5 new focused regression tests: signed 50-row omission, stale list revision, conflicting identity, exact read-before-UI success, and missing-RPC caching behavior.
- Existing TradeLink-focused tests: **270 PASS**; full frontend tests: **1,849 PASS**; no failures. Syntax and diff checks PASS.
- No production mutation or live signed browser acceptance was performed. Synthetic tests use bounded fake records only.
- The client-side fallback cannot claim comprehensive search of records outside the first 50, nor durable signed pagination. That requires existing `sql/tradelink-documents-page-candidate.sql` to be reviewed and separately activated against the authoritative database within its actual SQL role/denial contract.

## Next milestone if unverified/blocked

**CP-TL-FUNC-02 — Server-Wide Signed All Documents Pagination, Reproducible Quotation Draft Round-Trip, and Module-Specific Form Blocker Closure.** Inspect existing staged page RPC and representative business form requirements; run disposable signed authorization and runtime tests; activate new backend SQL only under applicable production-change approval. No new roles, approvals, RLS expansion or unrelated security architecture.
