# APSYNTRA CRM — Board Table Rendering Optimization

## Scope

Optimize the existing Vanilla JavaScript board-table implementation without a framework migration, database/schema change, new permission rule, or change to existing signed write contracts.

## Implemented

- Build a render-local `createBoardRenderIndex` once for each ordinary board render. It indexes item/column values and column definitions so cell rendering and group summaries avoid repeated linear scans of the complete value array.
- Reuse the board's prepared column list and render index across all ordinary groups.
- Keep large-table virtualization bounded and scoped to complete authoritative item sets. Partial server pages are not treated as complete datasets.
- Give rendered cells stable item/column patch identifiers and summary cells stable column identifiers.
- Update the retained virtual-row model after a confirmed edit, including its search index, so rows rendered later do not revert to stale cell markup.
- Mount and dismiss inline editors inside the affected cell instead of rebuilding the board shell and every group. Opening the editor is immediate; the existing signed actor/context/board/edit preflight still runs before Save is enabled.
- Keep a fresh signed preflight and the existing compare-and-swap or bulk RPC for the actual write. After a successful signed write, reconcile only the affected local item, cell, virtual row and group summary. The full board is not reloaded for a single-cell save.
- Keep inline forms within their column width to avoid forcing a wider table during editing.

## Preserved behavior

- Existing board edit eligibility, signed identity/context checks, `db.allowed(boardId, 'edit')`, virtual-status bulk readiness, typed form validation, stale-value comparison, CAS, audit, and server-side authorization remain in place.
- Existing selection, row detail, column configuration, horizontal per-group scrolling, page-level vertical scrolling, summaries, filtering, and accessible controls remain in the same table structure.
- No database migrations, RLS changes, permissions, roles, operational data, or background monitoring were added or changed.

## Verification

- Focused Node tests cover render-local indexes, summary equivalence, stable cell patch targets, virtual row reconciliation, complete-data virtualization, immediate editor mounting, signed preflight retention, CAS retention, and no full-board reload on a successful cell save.
- Full frontend test suite: run with `node --test frontend/tests/*.test.mjs`.
- Shipped JavaScript syntax: run with `for source in frontend/*.js; do node --check "$source"; done`.
- Generated CSS consistency: run with `node scripts/build-priority5-styles.mjs --check`.
- This change is source/test verified only until exercised in the signed browser runtime and deployed through the repository's normal release process.

## Synthetic lookup benchmark

On Node.js 22.23.4, a local synthetic board with 1,200 rows, 12 typed columns, and 14,400 stored values performed 14,400 cell lookups in 431.94 ms using the former repeated linear `Array.find` path, versus 5.16 ms including index construction with the render-local nested-Map path (83.8× in this run). This isolates value-lookup cost; it is not a browser paint, interaction-latency, or production workload benchmark.
