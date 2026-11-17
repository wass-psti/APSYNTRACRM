# CP-TL-NATIVE-02A — Domain Acceptance, Export Integrity, Board Preview Reconciliation

**Date:** 2026-11-17 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Base `main`:** `a111c8790e3d4d098af7e76d289f364331a16851`
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`
**Canonical TradeLink Board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`

## 1. Board preview discrepancy — root cause and correction

A fresh signed Overview reload continued to show a zero-item TradeLink card. A signed My Boards inspection exposed two active Board rows with the same name in the same workspace:

| Board | Status | Created (UTC) | Active items | Member rows | Purpose |
|---|---|---:|---:|---:|---|
| `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` | Active | 2026-10-30 05:40 | 3 | 3 | Canonical TradeLink application Board |
| `d8aeffbf-afea-42ba-bb88-a84cbedf86bf` | Active | 2026-11-17 03:47 | 0 | 1 | Additional same-name Board |

The Overview's six-card preview uses the newest Board rows. The newer empty Board therefore occupied the TradeLink preview position; the canonical application Board remained present in the full My Boards list with its three real records. This was **not** a stale count from the canonical Board or a defect in its document-to-Board projections.

`frontend/app.js` now selects the canonical TradeLink Board for the Overview preview when a newer same-name Board would otherwise occupy that slot. The additional Board remains visible and unchanged in My Boards. The signed Board catalog and aggregate metrics remain authoritative. No production Board was renamed, archived, trashed, deleted, or otherwise mutated.

## 2. Domain module and repository taxonomy

The recovered TradeLink source defines six persisted document types: ESI (`esi`), Quotation (`quotation`), Delivery Receipt (`delivery`), Packing List (`packing`), Payment AR (`payment`), and PO to Suppliers (`po`). All Documents is the centralized signed repository for those records; it is not a seventh `document_type` and does not replace a source form. The implementation retains all six source document types and the separate All Documents repository. PO functionality is not removed or silently remapped.

## 3. Export contract

- **CSV:** All Documents supports exporting selected, currently visible signed rows (maximum 50). The current CSV contract is metadata-only: document number, document type, workflow status, revision, last-updated timestamp and archive flag. It does not claim to export customer payloads, line items, pricing, attachments or full document content.
- **PDF / print:** the existing browser Print / Save as PDF path renders the exact signed saved revision after verifying the record, revision bundle, Board item and Approved state. Only Approved revisions are printable. This is a browser print copy, not electronic PDF issuance; electronic PDF approval/issuance remains separately disabled.
- **Templates/calculations:** the existing official output renderer covers all six source document types and uses saved company/template snapshots, saved line items, applicable VAT/discount/currency calculations, and source-specific fields. Existing tests cover these projections and the Approved-only print boundary.

No new export backend, PDF issuance endpoint, attachment activation or document lifecycle restriction is introduced by this checkpoint.

## 4. Production read-only baseline

The existing project was inspected using read-only SQL only. Latest readback:

- 3 active TradeLink documents, all Quotation.
- Quotation has 1 matching genuine Submit event; the other five document types have no active production documents or matching Submit/Completed event.
- 16 immutable revision snapshots.
- 0 current snapshot mismatches.
- 0 current document-to-Board mismatches.
- Production business transition acceptance remains **1/6**. The approved Quotation submission in CP-TL-FINAL-06A is retained; no repeat submission or synthetic production transaction was created.

## 5. Implementation changes

- `frontend/app.js` — added a pure, bounded Overview preview selector that prefers the canonical TradeLink application Board over a newer same-name duplicate without changing the full Board catalog or aggregate metrics.
- `frontend/tests/overview-experience.test.mjs` — verifies canonical preview selection, unchanged catalog identity, fallback behavior, and unchanged preview length.
- `frontend/tests/tradelink-legacy-integration.test.mjs` — verifies metadata CSV serialization for all six source document types.
- This acceptance record.

No Supabase migration, production database mutation, Board mutation, role change, grant change, RLS change, new backend, new Board, or dependency was added.

## 6. Acceptance status

### Verified local checks

- Full frontend suite: **2,566 passed, 0 failed** (`npm test`).
- Production Vite build: **passed** (`npm run build`). Existing nonblocking Vite warnings remain: the legacy `startup-guard.js` script is not a module bundle entry and the main/FRT PDF chunks exceed the default 500 kB advisory threshold.
- JavaScript check: **passed** (`npm run check`).
- Focused TradeLink + Overview suite: **391 passed, 0 failed**.
- Disposable PostgreSQL 17.11: **CP-TL-08E-02 PASS** (retry-safe create, no-op, substitution, replay, stale denial, Board and audit).
- Disposable PostgreSQL 17.11: **CP-TL-10A PASS** (six source document types; signed save RPC; create/read/retry/update/CAS; Board and All Documents readback; audit; no approval events).

The separate legacy CP-TL-03 upgrade/round-trip fixture was not used as the acceptance proof for this patch: its migration preflight requires reconstructing an exact prior function definition before upgrade, and the attempted local fixture setup stopped at that preflight. The newer CP-TL-10A signed-save fixture completed successfully and directly covers all six source types.

**Not yet established at this point:** GitHub PR/CI, exact deployed asset verification, and post-deployment signed Overview acceptance. Genuine production lifecycle acceptance remains **1/6** until legitimate business records for the remaining source document types undergo their normal workflow.
