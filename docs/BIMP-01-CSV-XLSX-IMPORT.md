# BIMP-01 — CSV/XLSX board import scope and acceptance

Date: 2026-11-05

## Implemented

The approved ordinary-board import flow follows upload → map columns → handle matches → import. Screenshot-based interface supports drop/browse, CSV and XLSX, multi-sheet selection, mapped existing columns, deliberate Allow/Decline for missing columns, group selection, Add new / Skip / Update matching and final Import Now confirmation.

- Parser: frontend/board-import-parse.js. UTF-8/UTF-16 CSV reader, basic dialect detection, quoted data, browser XLSX ZIP/XML reading, no formula evaluation, strict 8 MB/5,000-row/30-column limits.
- Core: frontend/board-import-core.js. Column type inference, schema preflight, signed identity and workspace validation, type conversion, unique mapping, duplicate analysis and one atomic backend call.
- UI: frontend/board-import-ui.js and frontend/board-import.css.
- Integration: frontend/app.js, index.html.
- Tests: frontend/tests/board-import.test.mjs.

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
