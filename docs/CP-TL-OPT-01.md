# CP-TL-OPT-01 — Unified Server-Side Document Repository

## Objective

Make TradeLink All Documents operate as one database-backed repository. Search, filtering, sorting, pagination and selected-record actions must use the same authoritative result set rather than a browser-limited 50-record slice.

## Delivered implementation

- Added `public.tl03_documents_query` and its private implementation. The function is additive; the existing `tl03_documents_page` and list RPCs remain available. A follow-up migration (`20261127024948`) corrects cursor-key validation to use PostgreSQL's supported `jsonb_object_keys()` function.
- Database-wide substring search covers document number, customer name, reference number and PO number.
- Document type, workflow state, archive state and visibility filters are applied before pagination.
- Inclusive last-updated date ranges are interpreted as UTC dates and applied in SQL before pagination.
- Global sorting supports created time, updated time, document number, document type and revision, in ascending or descending order.
- Keyset cursors carry the active sort value and immutable document ID as the deterministic tie-breaker. The response includes the full filtered count and the next cursor.
- TradeLink All Documents now requires the unified repository RPC. It does not silently present a legacy 50-record response as global search results.
- The client preserves database-returned ordering and validates the repository response and cursor before rendering it.
- Selected document snapshots survive Next/Previous page navigation. CSV export and bulk operations use those snapshots across pages, with the existing 50-document limit and existing manager-only mutation checks.

## Data and permission preservation

- The production migration adds indexes and functions; it does not update or delete document records.
- Existing document IDs, linked Board item IDs, revisions, immutable revision snapshots and audit events remain unchanged.
- Existing manager, creator, reviewer, signed-session, workspace and visibility checks are reused. No new roles, RLS policies, user assignments or permission grants to ordinary users were introduced.
- The new repository RPC is executable by authenticated sessions only; its server-side function still verifies the existing TradeLink document-read contract.
- Existing hide, unhide and delete bulk-action RPCs are unchanged.
- No gradient descent, backpropagation, model training, retraining or model-parameter update code was introduced.

## Verification coverage

The disposable PostgreSQL 17 acceptance job creates 60 synthetic documents and rolls them back. It checks:

1. Search by document number, client name, reference number and PO number.
2. Inclusive UTC last-updated filtering across the full 60-record fixture.
3. Ascending and descending global sort behavior.
4. Stable 50+10 pagination, including repeated sort values and document-ID tie-breaking.
5. No duplicate or skipped IDs across pages.
6. Continued availability of the legacy page RPC and authenticated-only execution of the new RPC.
7. Presence of the new B-tree and trigram indexes.
8. Multi-page cursor validation against PostgreSQL 17, including duplicate sort values and immutable document-ID tie-breaking.

Frontend tests cover filter normalization, client/reference matching in the bounded fallback helper, preservation of server order, full result counts, query arguments, response validation and cross-page selection limits.

## Production readback

The Supabase migration ledger contains versions `20261127013157` and `20261127024948`. The public and private repository functions are present, all seven query indexes are present, and the cursor-validation correction is applied and read back from the production function definition. The production document count was read without modifying document data.

GitHub Actions and GitHub Pages acceptance are evaluated against the resulting main-branch commit; they are not inferred from source creation or a successful build alone.
