# BIMP-01 — CSV/XLSX board import scope and acceptance

Date: 2026-11-05

## Implemented

The approved ordinary-board import flow follows upload → map columns → handle matches → import. Screenshot-based interface supports drop/browse, CSV and XLSX, multi-sheet selection, mapped existing columns, deliberate Allow/Decline for missing columns, group selection, Add new / Skip / Update matching and final Import Now confirmation.

- Parser: frontend/board-import-parse.js. UTF-8/UTF-16 CSV reader, basic dialect detection, quoted data, browser XLSX ZIP/XML reading, no formula evaluation, 8 MB upload, 5,000-row/30-column, and 24 MB aggregate uncompressed OOXML limits. Supports ZIP64 extended-information extra field `0x0001` for per-entry 64-bit sizes and offsets when resolved values remain within those limits; validates local headers against central-directory metadata. Rejects ZIP64 end-of-central-directory records and multi-disk archives, which are outside the bounded 8 MB import format. Individual entries are not rejected solely for compression ratio or an arbitrary 4 MB per-entry threshold.
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


## CP-BIMP-04 — Mapping completeness and integrated column setup

- Every source column that defaults to an unmapped/skip state is marked unresolved. The mapping screen lists these columns and requires the user either to map them to a destination or explicitly confirm exclusion. The import planner rejects any unresolved skip marker, so the UI cannot silently drop source data.
- Changing which source column is the Item title marks the previously selected title column unresolved until mapped or explicitly excluded.
- A manager's existing board-management capability enables proposing ordinary new columns. The redundant separate Allow creation click was removed: the final Import Now review/confirmation submits the proposed columns and rows together through the existing atomic import contract. The backend's existing manage check remains authoritative. Non-managers can still map existing columns or explicitly exclude source columns.
- Status/Dropdown setup remains in the same import wizard. A single explicit Create configured column action performs the existing audited, revision-checked schema operation; the redundant consent checkbox was removed. The configured column remains if the later record import is cancelled, and this is disclosed before the action.
- No database schema, RPC, role, permission, workspace, RLS, or Storage changes.

### CP-BIMP-04 implementation details

- Unmapped source columns are marked unresolved by the initial mapping. The user must map them to an existing destination or explicitly confirm exclusion. The client import planner also rejects unresolved skip mappings, so bypassing the UI does not silently discard those columns.
- Changing the primary Item mapping marks the former title source as unresolved until it is mapped or explicitly excluded.
- Ordinary columns supported by the existing m143-v1 contract are proposed for managers. The redundant intermediate Allow creation click was removed; the final Import Now review/confirmation is the explicit import action. The existing backend still enforces board manage access when newColumns is nonempty. Editors without manage access can map existing columns or explicitly exclude unmapped data.
- Status/Dropdown configuration remains within the same wizard and uses one direct Create configured column action. It calls the existing CAS-protected schema RPC, then resumes the import preview. The column creation is a separate committed schema operation and remains if the user cancels the later row import; the UI discloses this before the action. The extra consent checkbox was removed.
- Worksheet footer/summary rows that have no Item title are surfaced with their Excel row numbers and require explicit exclusion acknowledgement. Formula cells without cached results are surfaced and require acknowledgement that those cells will be imported blank. The planner enforces both acknowledgements.
- Numeric conversion now accepts common currency symbols/codes and grouped decimal values, including 1,234.50, 1.234,50, $1,234.50, and ₱2,500.00. Date conversion accepts ISO and YYYY/MM/DD, plus unambiguous day/month or month/day formats; ambiguous dates are rejected rather than guessed.
- The existing backend's m143-v1 supported create types remain the source of truth: text, long_text, number, date, people, checkbox, timeline, email, and url. No RPC, SQL, database schema, RLS, Storage, role, or permission changes were made.

### CP-BIMP-05 — Item title reassignment correction

- Corrected a remaining transition defect in the Map columns step: when a user assigns a different source column as the Item title, the previous Item source is now marked as an unresolved exclusion (requiresDecision: true).
- The previous title source therefore appears in the unresolved-column decision list, and buildImportPlan rejects the plan until the user maps that source elsewhere or explicitly confirms exclusion.
- The selected new Item source is marked as the active title mapping and does not remain unresolved.
- Added regression coverage for the mapping transition, readiness result, planner denial before acknowledgement, and successful plan construction after explicit exclusion.
- No changes to authentication, RBAC, workspace policy, RLS, database schema, import RPC, or other application areas.


### CP-BIMP-06 — Monday.com UTC timestamp compatibility

- Reproduced the import blocker with the actual `I.T Daily Activities - Done.xlsx` workbook.
- The parser correctly reads the workbook, but its `Date encoded` values use the explicit `YYYY-MM-DD HH:mm:ss UTC` format, which the date-column normalizer did not previously recognize.
- Date-only board fields now accept valid ISO timestamps with an explicit `UTC` or `Z` marker and preserve the source calendar date. The timestamp is not shifted through the browser's local timezone.
- Invalid calendar dates and invalid time components continue to be rejected.
- Regression coverage verifies type inference, UTC normalization, and import-plan construction for the exported values.
- No changes to the import RPC, database schema, authentication, roles, permissions, or workspace policy.


### CP-BIMP-07 — Date-normalizer module cache correction

- Live Chromium acceptance showed that an already-cached unversioned `excel-date-normalization.js` module remained active after the corrected asset was deployed.
- The board-import parser and import planner now import the shared normalizer through a versioned module URL so an updated date contract cannot be masked by an older browser module-cache entry.
- Added regression coverage that keeps both import paths on the same versioned dependency.
- This is a frontend module-cache correction only; no service worker, global cache policy, database, API, or permission changes.


### CP-BIMP-08 — Full-column long-description inference

- Live workbook acceptance found a `Work description` value longer than the standard 1,000-character text-column limit.
- Import type inference now scans the full source column and selects the existing `long_text` type whenever any nonblank source value exceeds 1,000 characters.
- The existing 5,000-character long-text limit remains enforced; values are preserved without truncation.
- Added regression coverage for long values appearing after row 100, full-value preservation, and the 5,000-character boundary.
- No import RPC, database schema, authentication, roles, permissions, or workspace policy changes.

### CP-BIMP-06 — Invalid-token failure classification and safe recovery

- Added an import-scoped error normalizer that distinguishes workbook decoding, choice-column schema writes, and atomic record writes.
- A token/JSON decoding error while reading a workbook is reported as a retryable file-read failure and explicitly states that no board changes were made.
- A token/JSON decoding error after a Status/Dropdown schema write is treated as an indeterminate write outcome. The UI instructs the user to refresh and inspect the board columns before retrying.
- A token/JSON decoding error after the atomic record-import request is treated as an indeterminate commit outcome. The UI instructs the user to refresh and inspect the destination group before retrying, preventing blind duplicate submission.
- Ordinary validation and known backend errors retain their original actionable messages. Existing `importOutcomeUncertain` and `schemaOutcomeUncertain` classifications are preserved.
- Deployed import modules and their direct dependencies passed `node --check`; the live workbook preview was able to load and render. This confirms the current deployed import modules are syntactically valid, but does not identify the original user's exact failing stage.
- No schema, RPC, RLS, role, permission, or unrelated application changes.


### CP-BIMP-09 — Atomic response decoding and import outcome classification

- Reproduced a response-transport defect in `frontend/session.js`: successful HTTP response JSON parse failures were swallowed and converted to `null`. The atomic import layer therefore lost the original response-decoding error and could only report a malformed receipt.
- The shared response reader now reads the response body once as text and parses JSON explicitly. Valid JSON and empty/204 responses preserve their previous return contract. Malformed non-success responses retain their HTTP failure classification without exposing response bodies.
- A malformed successful response now raises `ApiError` with `code: INVALID_JSON_RESPONSE`, the original parse exception as `cause`, and the successful HTTP status. Response contents are not copied into the error message or logs.
- The atomic import client carries this response-decoding classification into its existing uncertain-write outcome. The UI therefore instructs the user to inspect the destination board before retrying; the client never repeats the atomic write.
- Added transport tests for valid JSON, malformed successful JSON, empty/204 responses, malformed error responses, and JSON-only test doubles. Added an end-to-end client contract test proving that a malformed successful atomic response triggers exactly one atomic request and is classified as uncertain.
- No SQL, RPC, database, storage, authentication policy, role, permission, workspace, or unrelated application changes. No production records were modified.
- Browser write/refresh acceptance remains pending until a dedicated ordinary nonproduction board can be used without touching operational records.
