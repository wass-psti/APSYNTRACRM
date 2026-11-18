# CP-BIMP-21 — Mapping Contract and Oversized Source Cell Remediation

**Date:** 2026-11-18 (Asia/Manila)  
**Status:** Frontend implementation and automated regression VERIFIED; genuine source-workbook and signed production acceptance PENDING.  
**Scope:** Board Import mapping contract, CSV/XLSX source-cell parsing, explicit source exclusion, and regression coverage.

## Findings

### A. 30 mapped source columns

The contract is enforced by `frontend/board-import-core.js` in `buildImportPlan()` and by `public.wm_import_board_wizard_extended_atomic()` in migration `20261112033743_cp_bimp18_extended_reference_storage_activation.sql`. The SQL contract accepts at most 30 mapped sources. The normalized payload excludes mappings whose action is `skip`; the primary Item mapping counts as one mapped source.

The frontend previously surfaced the limit only when building the final import plan. A wide source could therefore appear mappable and fail later with the atomic-contract error.

**Correction:** export a shared frontend constant for the 30 mapped-source ceiling; show the current active mapping count in the mapping step; disable Next while the count exceeds 30; repeat the check in the Next handler; retain the backend contract as the authoritative final validation. Users can reuse compatible existing board destinations or explicitly exclude excess source columns. No SQL limit was changed.

### B. TradeLink `Subitems` cell over 65,536 characters

The parser previously rejected any source cell above 65,536 characters in `validateImportSheet()`, CSV parsing, and XLSX `sheetRows()`. The same 65,536-character ceiling is independently enforced by the m143-v2 extended-reference writer and `work_board_import_extended_refs` storage constraint. `contextualError()` intentionally includes only the first 96 characters of the value, so the short-looking excerpt in the user-visible error is not the full source cell.

**Correction:** source parsing now retains cells up to the already-enforced 24 MiB aggregate uncompressed-workbook budget (CSV remains bounded by the 8 MiB file limit). The mapping UI identifies source columns with cells above the 65,536-character persistence ceiling. If such a source remains mapped, row preflight rejects the affected row without truncation; if the user explicitly excludes the source column, the other values and the record remain eligible. The m143-v2 65,536-character persistence ceiling remains unchanged.

## Data integrity and performance

- No oversized source value is truncated or reported as persisted.
- Explicit column exclusion is represented by the existing `skip` mapping action; row-level rejection remains visible and requires the existing acknowledgement flow.
- Existing 30-column atomic contract, 30 physical board-column ceiling, transaction boundaries, duplicate handling, recovery checkpoints, and authoritative readback remain unchanged.
- Parsing remains bounded by the 8 MiB upload and 24 MiB uncompressed workbook budgets.
- No database migration, production data mutation, role change, or authorization-policy change is included.

## Regression evidence

- Focused Board Import suite: **144/144 PASS**.
- Added XLSX fixture: 70,000-character inline-string cell in worksheet `tradelink` is parsed and preserved for review.
- Added row-review test: the oversized `Subitems` mapping is rejected without truncation; explicit exclusion retains the source item row.
- Existing test verifies 31 active mappings are rejected before mutation.
- Added mapping UI assertions for the live 30-column counter, over-limit Next disablement, and oversized-source warning.
- Complete `npm test`: exited **0**.
- `npm run build`: exited **0**. Existing Vite warnings remain: `startup-guard.js` is not bundled because it lacks `type="module"`, and several generated chunks exceed 500 kB.
- `git diff --check`: PASS.

## Acceptance still pending

1. Upload the original TradeLink workbook and verify the actual `tradelink` worksheet, row 28, cell B28 length and source XML representation. The original workbook was not present in the active working directory or supplied as a conversation attachment during this implementation.
2. In the genuine signed browser session, verify that a workbook with more than 30 source headers can proceed after compatible mapping/exclusion and that the UI never submits more than 30 active mappings.
3. In the genuine signed browser session, verify the oversized `Subitems` column warning, explicit exclusion, import of the remaining fields, and post-refresh authoritative readback.
4. Confirm the resulting receipt reconciles source, rejected, excluded, created, updated, and skipped row counts.

No production import was executed as part of this remediation.
