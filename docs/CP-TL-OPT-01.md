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

The dedicated PostgreSQL 17 workflow provisions an isolated database, installs the source-aligned TradeLink save/review baseline, applies both CP-TL-OPT-01 migrations, and runs the acceptance script. It creates 60 synthetic documents and rolls all inserted documents and Board events back.

The acceptance suite checks:

1. Global substring search by document number, client name, reference number and PO number.
2. Inclusive UTC last-updated date filtering: single-day, lower-bound-only and upper-bound-only ranges.
3. All five sort fields—created time, updated time, document number, document type and revision—in ascending and descending order.
4. Stable keyset pagination across 50+10 records, including full filtered counts and no duplicate or skipped IDs.
5. Repeated sort values with immutable document-ID tie-breaking.
6. Cursor rejection for extra or missing keys, mismatched sort fields, invalid value types, malformed UUIDs, timestamps and revisions, and overlong sort values.
7. Valid cursor continuation for timestamp, document-type and revision sort paths.
8. Retention of the legacy page/list RPCs, authenticated-only RPC execution and all seven repository B-tree/trigram indexes.

Frontend tests cover filter normalization, client/reference matching in the bounded fallback helper, preservation of server order, full result counts, query arguments, response validation, cross-page selection snapshots and the existing 50-document bulk-selection limit.

The same SQL acceptance script is also included in the broader `APSYNTRA CRM Frontend Validation` disposable PostgreSQL job.

## CI evidence

- Dedicated `CP-TL-OPT-01 Unified Server Repository Acceptance`: **passed**, GitHub Actions run `45959419178`, commit `d00463538383d3a45e73e824f2d4468c6bcaff02`.
- Integrated frontend and disposable PostgreSQL regression: TradeLink repository frontend tests and the CP-TL-OPT-01 database acceptance step **passed** in run `45959201512`.
- GitHub Pages build and deployment: **passed**, run `45959417660`.

## Production readback

The Supabase migration ledger contains versions `20261127013157` and `20261127024948`. The public and private repository functions are present, all seven query indexes are present, and the cursor-validation correction is applied and read back from the production function definition. The production document count was read without modifying document data.

GitHub Actions and GitHub Pages acceptance are evaluated against the resulting main-branch commit; they are not inferred from source creation or a successful build alone.
