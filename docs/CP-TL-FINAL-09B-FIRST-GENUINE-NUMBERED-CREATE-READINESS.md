# CP-TL-FINAL-09B — First Genuine Auto-Numbered Production Create

**Date:** November 17, 2026. **Project:** APSYNTRA CRM / TradeLink.

## Baseline and execution authority

Approved CP-TL-FINAL-09A numbering activation PR #483 is MERGED at `f0743cf3b57613595748a559d7aff07fd9df3d70`. The live frontend sets `TL03_AUTOMATIC_NUMBERING_ENABLED=true`; the signed Quotation Create form shows a blank, read-only number field and the source-server assignment guidance. The deployed `public.tl03_document_create(uuid,uuid,jsonb,text)` function exists, authenticated execution is installed, and unauthenticated execution is denied. The signed create workflow reuses the existing server role/workspace checks; no new restrictions were introduced.

The initial read-only database inspection for this milestone found **zero numbering sequence rows, three active TradeLink documents, fifteen total document records, and sixteen revision snapshots**. All active documents are Quotations. No new business document has been identified, no customer or supplier, item, commercial terms, or real business transaction details were supplied for this milestone. Previous approved QA submission `Q-QA-20261108-01` cannot be reused as a *new* auto-numbered create.

**Operational boundary:** Standing authorization permits engineering and acceptance work; it does not supply legitimate business document content. Do not invent, copy an archived QA document, or create a synthetic invoice, payment, shipment or purchase order in production. No production document was created and no sequence was allocated during this milestone.

## Implemented acceptance artifact

`sql/tests/cp-tl-final09b-first-create-readonly.sql` checks each of the six server-defined numbering prefixes, existing private sequence allocations, a matching signed `created` event bound to the creator, immutable revision-1 snapshot, stable document content/number and authoritative Board item identity. It also reports authenticated/anonymous execution grants and production counts. The audit is transaction-level `READ ONLY`, never generates a number or modifies a record, and deliberately reports no acceptance until an authentic create is present. Its static safety/coverage contract is checked by `frontend/tests/tradelink-final09b-first-create-audit.test.mjs`.

After a legitimate business document is furnished and its create is authorized, execute the signed Create form with the source-required data and default For Approval state (or explicit Draft). Verify one atomic server-assigned number, revision 1, authenticated creator, signed `created` event, immutable revision-1 snapshot, Board item, All Documents visibility, retry idempotency without a second record, and refresh persistence. Re-run the audit before certifying genuine production creation. No separate Supabase project, schema changes, excessive authority gates or manual-number fallback should be introduced.

## Evidence classification

- **VERIFIED:** production backend RPC/grants and published numbering flag; signed empty Create form; existing database and source architecture; current frontend regression/build.
- **VERIFIED:** reusable read-only first-create audit prepared, its test and exact SQL output (subject to post-merge CI).
- **BLOCKED:** genuine first production create until actual business document type/content and authorization are established; therefore no real number, signed creation event, or post-create Board readback can be claimed.
- **PENDING:** remaining genuine five-module Submit transitions, previously measured at 1/6 production business acceptance.

**Next conditional milestone:** CP-TL-FINAL-09C — First Business-Authorized Numbered Document Creation and Signed Revision-1 Readback. Do not proceed with a production create merely to satisfy a test count.
