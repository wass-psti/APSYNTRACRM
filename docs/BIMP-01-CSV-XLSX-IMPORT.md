# BIMP-01 — CSV/XLSX board import scope and acceptance

Date: 2026-11-11

## Implemented

The approved ordinary-board import flow follows upload → map columns → handle matches → import. The interface supports drop/browse, CSV and XLSX, multi-sheet selection, mapped existing columns, a final confirmation that explicitly lists any new columns and group to create, group selection, Add new / Skip / Update matching and final Import Now confirmation.

- Parser: frontend/board-import-parse.js. UTF-8, Windows-1252, UTF-16LE and UTF-16BE CSV decoding (including BOM-less UTF-16 detection), delimiter detection, quoted/multiline data, browser XLSX ZIP/XML reading, no formula evaluation, 8 MB upload, 5,000 rows and 30 mapped source columns. Required OOXML parts are bounded to 24 MB per entry and 64 MB aggregate; unreferenced package media does not consume the XML expansion budget. ZIP64 extended-information extra field `0x0001` and ZIP64 end-of-central-directory records/locators are supported with bounds, consistency, CRC and local-header validation. Multi-disk archives remain unsupported.
- Core: frontend/board-import-core.js. Column type inference, schema preflight, signed identity and workspace validation, type conversion, unique mapping, duplicate analysis and one atomic backend call.
- UI: frontend/board-import-ui.js and frontend/board-import.css.
- Integration: frontend/app.js, index.html.
- Tests: frontend/tests/board-import.test.mjs.

### Monday.com ZIP64 compatibility

The reported Monday.com export uses a standard ZIP end-of-central-directory record, but stores each ZIP entry's compressed and uncompressed sizes as `0xFFFFFFFF` sentinels with the actual 64-bit values in ZIP64 extra field `0x0001`. These per-entry ZIP64 values are valid even though the workbook is only 169,105 bytes and contains no ZIP64 end-of-central-directory locator. The parser now resolves those values for both local headers and central-directory entries, checks that they agree, then applies the existing compressed-file and aggregate uncompressed-size limits. The private uploaded workbook is not committed; regression coverage uses a sanitized 10-entry Monday-style OOXML fixture with the same per-entry ZIP64 layout and worksheet structure.

## Existing backend, verified by read-only production inspection

The existing WatchdogWorkspace Supabase project has public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb) installed. Only authenticated users, not anon/PUBLIC, have EXECUTE. Its existing m143-v1 contract checks board edit access, board revision, group scope, column changes requiring manage access, atomic writes, item revision checks for updates and audit recording. No production SQL or data was modified by BIMP-01.

The previous WatchdogWorkspace GitHub source repository returned NOT_FOUND; code reuse could not be verified there. Existing APSYNTRA contracts and live authorized backend were reused.

## Limitations and acceptance

1. Generic imports are intentionally restricted to ordinary editable boards. Application-owned boards, including TimeTracker Attendance, need a separate domain-specific, server-authorized import policy and tests. No generic writes into protected domain records.
2. Status/dropdown column creation is not supported by the current atomic m143-v1 server contract because option labels require explicit configuration. Existing compatible status/dropdown columns can be mapped.
3. Excel requires DOMParser and DecompressionStream(deflate-raw); cross-browser tests and real-file acceptance are pending.
4. One atomic request supports indeterminate execution progress, not streaming row-by-row progress.
5. SECURITY DEFINER RPC protections and restricted-field denial require security acceptance before production certification.
6. Signed HTTPS acceptance is pending: real login, authorized editor and denied role, expired/revoked session, foreign workspace, duplicate behavior, refresh persistence, audit, and CAS conflicts on a disposable ordinary board.
7. Existing production records must never be used as an acceptance fixture; SQL/role/policy changes require separate approval.

## Evidence labels

- Existing Supabase RPC and permissions: VERIFIED (read-only).
- Import source files: IMPLEMENTED.
- Browser signed end-to-end: PENDING.
- Application-owned board imports: BLOCKED pending domain-specific contract.
- Production-ready: NOT VERIFIED.

See GitHub Actions on final HEAD for automated test results. A successful Pages build is not production acceptance.


### Formula-cell import behavior

The browser importer never evaluates Excel formulas. When a formula has a cached value, the cached value is imported. When the workbook omits the cached value entirely, the row is retained and the affected cell is imported as blank; the worksheet preview displays a warning with the affected cell addresses and column labels. Formula cells with spreadsheet error values and external-workbook formulas remain rejected. This avoids blocking otherwise valid Monday.com exports while making unavailable formula results explicit rather than inventing values.


### Import compatibility and workflow refinements

- CSV values beginning with `=`, `+`, `@`, or `-` are preserved as literal text. The importer stores text values; it does not evaluate CSV formulas. XLSX formula cells likewise use cached results only, and missing cached results remain blank with a visible warning.
- Numeric inference and conversion accept plain numbers, scientific notation, common currency symbols/codes, grouped thousands, comma-decimal values, and parenthesized negatives when the grouping/decimal pattern is unambiguous.
- The separate “Allow creation” click for ordinary columns was removed. A manager's selected column additions are listed in the final import review and are created only by the same atomic import commit after the final confirmation. Users can skip all proposed columns before continuing. The existing board-manage requirement for schema creation is unchanged.
- New-group creation is also listed in the final confirmation and remains part of the atomic import transaction.
