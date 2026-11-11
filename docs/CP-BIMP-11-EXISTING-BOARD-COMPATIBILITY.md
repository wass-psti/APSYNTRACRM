# CP-BIMP-11 — Existing Board Configuration Compatibility

Date: 2026-11-11

## Problem statement

Users reported that CSV/XLSX imports succeeded against newly created test boards but did not map consistently against dedicated boards created earlier. The import mapping catalogue was narrower than the actual board-column contract: it excluded non-`custom:*` physical data columns and hidden columns, even though the atomic import RPC accepts board-owned physical columns by ID. The Status header heuristic also classified a completely empty source column as a Status choice field, which led to a choice-configuration panel that could not be completed because there were no source labels.

## Implemented

- `availableImportColumns()` now enumerates valid physical data columns whose `system_key` is `NULL` or `status`, whose data type is supported by the existing m143-v1 import contract, and which have a nonempty physical `column_key`. This includes both legacy/domain `col_*` columns and current `custom:*` / `custom_*` columns.
- Hidden columns remain eligible import targets. Visibility is presentation metadata and does not make a physical storage column unavailable. The mapping selector marks hidden targets explicitly so the user can distinguish them from visible columns.
- Protected system columns such as title, assignee and due-date remain outside the generic import catalogue. The importer does not infer permission to write domain-owned system fields.
- `initialImportMappings()` now evaluates same-name existing columns against the actual destination type and configuration. It prefers a unique exact-type match; if none exists, it reuses a unique same-name destination only when every nonblank source value can be converted by the existing target-type normalizer. This covers cases such as Status labels imported into an existing text column without creating a duplicate Status column.
- The source's detected type remains visible independently from the destination type (`targetType`), so a compatible mapping does not misreport what the file contained.
- An entirely blank source column has no reliable choice-type evidence and now defaults to text. If a same-name existing column is present, it is mapped to that physical column even when it is a Status column because no values will be written. If no target exists, it follows the ordinary column proposal path rather than opening an impossible Status/Dropdown label setup.
- Nonblank Status/Dropdown source values continue to use existing configured choices or the existing explicit audited choice-configuration flow. This checkpoint does not add a new RPC or change the status writer.
- Existing atomic m143-v1 import, preview revision checks, value conversion, source-column completeness, duplicate behavior, readback verification, and uncertain-outcome handling are unchanged.

## Read-only production schema evidence

A read-only aggregate query against the existing APSYNTRACRM Supabase project confirmed the legacy-key mismatch is present in the live board inventory:

- 12 active boards contain legacy `col_*` physical data columns.
- Those boards contain 96 such columns: 12 date, 20 number, 24 status, and 40 text columns.
- All 24 legacy Status columns inspected have configured labels; none are missing labels.
- No board records, cell values, memberships, or private field contents were selected. No production data was modified.
- The currently open browser tab is `CP-BOARD-COL-DELETE QA Signed Fixture`, with one custom text column; it is not representative of the dedicated legacy boards and is not a safe write-acceptance target.

This independently confirms the old `custom*`-only filter was excluding real destination columns. The blank Status screenshot is a separate source-inference defect, not evidence that live Status columns lack configured labels.

## Regression coverage

Added tests for:

- Legacy `col_*` physical data columns being discovered and mapped.
- Hidden physical columns being discoverable, explicitly marked in the UI, and mapped without creating duplicates.
- Protected title/assignee system columns remaining excluded.
- Status source values mapping to an existing same-name text destination when values are valid for that target.
- Completely empty Status sources mapping to an existing hidden Status column without creating a new column or requiring option configuration.
- Empty Status sources with no existing target being proposed as an ordinary text column rather than an unconfigurable choice column.
- Disposable PostgreSQL 17 import acceptance now includes a hidden legacy `col_*` destination, maps it by its physical column ID, and verifies both imported cell values persist without creating a duplicate column. The BIMP workflow runs on pull requests touching import code or fixtures.
- Existing atomic import tests for CSV, XLSX, ZIP64, dates, long text, formula behavior, duplicate matching, atomic receipts, readback and safe uncertain outcomes.

## Scope boundaries

- No SQL, RPC, database schema, RLS, Storage, role, permission, workspace, credential, or deployment-policy changes.
- No import write was executed against production or operational board records.
- No existing board column, record, or value was modified during implementation.
- No extra authorization gate was added. Existing signed import and server-side mutation checks remain as they were.
- Generic import remains limited to ordinary editable boards; protected application boards continue to use their existing domain-specific paths.

## Verification status

- Focused import test suite: 69 passed, 0 failed.
- Full frontend suite: 1,791 passed, 0 failed.
- Frontend JavaScript syntax: 169 modules passed.
- CSS bundle consistency: 45 files / 911,493 bytes current.
- Pages source validation: PASS.
- SEC14 source guard: PASS (263 first-party runtime files); external deployed clients and legacy permission retirement remain outside this checkpoint.
- GitHub Actions: frontend PASS; disposable PostgreSQL PASS; disposable collaboration PostgreSQL PASS; disposable OT PostgreSQL PASS. The additional BIMP-02 legacy-column disposable import job is now enabled for this PR and awaits its run. Live Pages and Supabase Preview are skipped by existing workflow conditions.
- Added the CP-BIMP-11 branch and its acceptance documents to the existing frontend validation workflow filters so the same full frontend and disposable PostgreSQL regression jobs run on this implementation branch and documentation changes.
- Genuine signed-browser import against an existing dedicated board: pending. The currently open browser tab is a recovery QA fixture, not an approved import target.
- User-provided Google Doc findings: pending Google Drive connection. The Google Drive connector was suggested but is not yet connected; no content from that document is represented as reviewed here.

## Acceptance target

Use a dedicated existing ordinary board with a representative legacy `col_*` column and, where present, hidden physical columns. Preview a real workbook, verify that existing columns appear in mapping, confirm empty Status behavior, then perform one signed import and verify the receipt, values and refresh persistence. Do not use the recovery fixture or an operational board for write acceptance.
