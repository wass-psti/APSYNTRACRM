# CP-BIMP-17 — Existing Board Import Compatibility and Extended Reference Activation Readiness

Date: 2026-11-12 (Asia/Manila)

## Verified production state (read-only)

The existing Supabase project was inspected with **read-only** database metadata queries, not mutations. The original `wm_import_board_wizard_atomic` RPC exists and powers signed CSV/XLSX imports. The optional `work_board_import_extended_refs` table, `wm_import_extended_refs_read(uuid)` and `wm_import_board_wizard_extended_atomic(uuid,timestamptz,jsonb)` are **all absent in production** as of this check. This is the expected unactivated m143-v2 state. No new Supabase project was created.

Production metadata provides real examples of **ordinary** imported boards with existing typed destinations, without retrieving any actual user-record cells:

| Board type | Existing column configurations represented by synthetic tests |
|---|---|
| Inventory Items | SKU/text; Current Stock, Reorder Point and Unit Cost/number; Last Restocked/date; Stock Status/text |
| Online Store | Material Description/text; Available Qty and Selling Price/number; Datasheets/url |
| Time Entries | Log Period/text; Entry Date/date; Hours/number; Project/text |
| Computation | `Qty.`/checkbox, `Item Landed Cost`/number — numeric Qty. source cannot be blindly coerced to checkbox |
| Legacy/dedicated | `col_*` physical data columns and hidden data columns; generic module-board protections unchanged |

The 12 core APSYNTRA application-module boards use their domain-specific contracts. No import writes or permission relaxations were performed against operational boards. The earlier CP-BIMP-16 signed browser tests already verified a separate dedicated ordinary import QA board with actual CSV and XLSX writes, refresh and database reconciliation.

## Implemented in this increment

- The automatic mapping pass now captures the first incompatible **worksheet row number and existing destination data types** when a same-name board column exists but cannot accept the source. It does not embed the rejected raw value in errors or telemetry; workbook cells can contain passwords, private URLs and other sensitive material.
- The mapping interface displays a concise conflict notice and keeps existing explicit mapping or exclusion controls. No new approval step, RBAC check, permission or error blocking was added.
- Added six synthetic ordinary-board cross-configuration regression tests based solely on live **schema metadata**. Tests verify existing typing, zero duplicate columns for compatible sources, explicit handling of malformed checkbox quantities, legacy/hidden destinations, protected module boards and the difference between unactivated v1 versus staged m143-v2 long URL support. No operational row contents are captured.
- Extended the **disposable PostgreSQL-only** signed m143-v2 fixture to reject references exceeding 65,536 characters, prove atomic rollback, and preserve existing signed access/denial checks. The staged candidate remains unapplied to production.

## Activation constraints and acceptance

- m143-v2 storage activation requires a separate explicit production schema change approval. This increment is not that approval and does not apply, bypass or auto-deploy the candidate SQL.
- Existing v1 board imports must remain functional regardless of m143-v2 activation status. If an extended value cannot persist under v1, it is rejected during full-file preflight rather than silently truncated or reported as imported.
- Before a production activation, use the existing disposable PostgreSQL test suite plus a dedicated signed ordinary nonproduction board to verify long references, normal edit cleanup, readback, signed denials, revoked sessions and exact refresh persistence. All runtime acceptance evidence must identify whether the test ran against the deployed v1 frontend, the staged candidate or a genuinely activated backend.
- Any cross-configuration discrepancy on operational boards should be reproduced with synthetic data on an authorized ordinary QA board, not by mutating the operational source records.

## Verification ledger

- Unit compatibility matrix: **6 new synthetic tests PASS**; focused import suite **108 PASS**; full frontend suite **1,835 PASS**; syntax **172** frontend modules PASS; CSS bundle, Pages source validation and SEC14 guard PASS.
- Disposable extended-reference PostgreSQL tests: pending CI rerun for the new >65,536-character rollback scenario.
- CI disposable signed PostgreSQL extension and browser fixtures: pending branch review. No production storage migration executed.
- Genuine production m143-v2 activation: NOT APPLICABLE to this authorized scope.
