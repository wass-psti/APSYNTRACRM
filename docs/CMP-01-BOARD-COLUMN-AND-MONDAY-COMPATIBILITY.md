# CMP-01 — Standard Column Center and monday.com Import Compatibility

Date: 2026-11-05
Repository: `wass-psti/APSYNTRACRM`
Checkpoint classification: IMPLEMENTED — AUTOMATED TESTS PASS — GENUINE LIVE SIGNED ACCEPTANCE PENDING

## Source of truth and boundary

The existing live WatchdogWorkspace Supabase project was inspected **read-only**. Its `work_board_normalize_column_config` and `work_board_validate_column_value` functions admit exactly these 11 types:

| Type | Backend behavior | Current frontend editor | Notes |
| --- | --- | --- | --- |
| Text | text, max 1,000 | single-line | operational contract |
| Long Text | text, max 5,000 | textarea | operational contract |
| Numbers | JSON finite number | number | precision/format metadata not supported |
| Status | stable option IDs, configured labels/colors | select | status config authorized, 50 labels max |
| Dropdown | single text option | select | **single select only** |
| Date | validated YYYY-MM-DD | date | no built-in timestamp type |
| People | member UUID with board membership validation | select | **one board member only** |
| Checkbox | JSON boolean | checkbox | supports monday text `v` when detected |
| Link / URL | validated HTTP(S) | URL | labels not separately stored |
| Email | validated address | email | no email action automation |
| Timeline | start/end ISO date object | date-range | no separately persisted duration type |

No separate backend type currently exists for Priority, Phone, Tags, Files, Location, Rating, Progress, Formula, Time Tracking, Created At, Created By, Last Updated, Auto Number, Currency, Percentage, Address, GPS Coordinates, Teams, or board relationships. The presence of metadata fields (`created_at`, `updated_by`, etc.) is not evidence that an independently configurable type is available.

These missing backend types are not silently aliased to Text or shown as operational placeholders.
Exception: **Priority** is offered explicitly as a **Status preset**, not a new database type.
Choosing it creates a genuine `status` column with configured Critical / High / Medium / Low
labels through the existing signed, audited schema mutation. The UI labels it as a preset,
rather than falsely claiming native independent Priority storage.

## Implementation

- `frontend/board-column-catalog.js` — single metadata registry for 11 real types plus one explicitly identified Status-backed Priority preset, categorized search, readable descriptions and accessibility labels. No unsupported backend types are advertised.
- `frontend/board-structure-admin.js` — registered categories in the authorized Add Column form and a searchable Column Center. Existing Item-only new-board baseline remains untouched.
- `frontend/app.js` — keyboard-accessible card selection and search filtering. Selecting Status/Dropdown reveals the existing option configuration textarea. All schema changes still use the signed `wm_board_schema_mutate` contract.
- `frontend/styles.css` — contained, responsive catalog styles, focus outlines and reduced-motion support. Full CSP-safe Status color classes now match all eight colors emitted by the live PostgreSQL status normalizer.
- `frontend/board-inline-items.js` — maps the server-managed Status palette to exact safe CSS classes; unknown or invalid colors fall back to neutral without inline styles.
- `frontend/board-import-choice-setup.js` — manager-initiated, explicitly consented **separate** configured Status/Dropdown creation. The wizard inspects unique real export labels, rejects unsafe labels, validates signed actor/workspace/manage permissions, rechecks board revision and active session, uses exactly one `wm_board_schema_mutate` call, and verifies created config through an authoritative board read.
- `frontend/board-import-ui.js` — supports Configure Status / Configure Dropdown decisions, displays exact labels and an irreversible-schema-stage warning, returns to the mapping preview after a verified schema mutation. This step is **not** falsely presented as atomic with the subsequent record import. Original import `m143-v1` transaction remains unchanged.
- `frontend/board-import-core.js` — choice columns are mapped into existing typed columns after creation; native monday.com Checkbox text `v`/blank is recognized only for marker-only checkbox sources.
- `frontend/monday-import-compat.js` — verified checkbox `v` = checked and empty = unchecked. Generic spreadsheet blank stays null; this transformation never applies to Text fields.

## monday.com reference boundaries

- Official export guide: https://support.monday.com/hc/en-us/articles/26989749858578-Export-from-monday-to-Excel
- Import to existing board and supported mapping: https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel
- Checkbox text semantics: https://developer.monday.com/api-reference/reference/checkbox

Official documentation confirms board table XLSX exports and optional updates/subitems worksheets, but exports vary by board columns and selected options. No genuine source-export file representing every monday.com schema has yet been captured, so **universal monday export compatibility is not verified**. Existing CSV dialect/date/worksheet tests and prior sanitized XLSX tests remain in place.

## Automated acceptance

- `frontend/tests/board-import-choice-setup.test.mjs` tests choice discovery, deduplication, labels, authorization, stale CAS, workspace denial, and zero mutation on denied operations.
- `frontend/tests/column-system-phase01.test.mjs` tests exact backed catalog, search semantics, UI exposure, the genuine configured Priority preset, monday checkbox normalization and generic blank preservation.
- `frontend/tests/board-status-display-and-column-menu.test.mjs` tests the full authoritative Status color palette and rejects arbitrary CSS injection.
- `frontend/tests/board-surface-refinement.test.mjs` keeps the board-only unified-scroll check isolated from the Column Center's contained scrollbar.

See the current passing APSYNTRA CRM Frontend Validation GitHub Actions run for the exact SHA and pass count. Source acceptance must not be conflated with a signed production browser test.

## Live deployment and security boundaries

Production schema, records, roles, grants, credentials, and RLS were not modified by development in this checkpoint. The live functions `wm_board_schema_mutate`, `wm_board_ui_read` and `wm_import_board_wizard_atomic` are callable by `authenticated`, not by `anon`, based on read-only metadata inspection.

**Material limitation:** `wm_import_board_wizard_atomic` contract `m143-v1` explicitly rejects creation of Status or Dropdown columns in the same atomic call. The new UI uses a transparent, consented, CAS-protected **schema-first** step through the existing authoritative schema RPC. If the later import fails or is canceled, the newly created column remains. Existing populated columns are never renamed, retyped, deleted, or overwritten by this feature.

The previously identified unconditional active-session issue inside the import RPC remains unresolved in production. Client-side preflight does not establish direct-API revocation security.

## Next development gates

1. **CMP-02: Additional independently implementable typed column contracts.** Stage and test reversible SQL/schema validator expansions (Phone, Rating, Percentage, etc.) only after each type's storage, rendering, input validation and denial semantics are defined. Production SQL changes require separate security/permission approval.
2. **CMP-03: System-derived columns.** Use authoritative created/updated metadata for optional read-only views without creating fictitious writable columns; verify signed view preferences and audit.
3. **CMP-04: Infrastructure-dependent capabilities.** Files/Storage, board relations/dependencies, server-safe formulas, Time Tracking, GPS, team references and rich rollups require separate verified central contracts.
4. **BIMP-02/BIMP-03 live browser acceptance.** Test genuine source monday.com XLSX and CSV export fixtures with an authorized disposable ordinary board, audit, reload, role ceilings and foreign-workspace denials. Do not generic-import into protected application-owned boards.

Explicit exclusions: AI-powered columns, Marketplace apps, monday-branded columns and proprietary document/application integrations.

**Coverage metric:** 11 of 11 **currently backed** types plus one clearly labeled Priority preset listed in the Column Center (100% backend-type catalog accuracy). This is NOT 100% of the requested target inventory, and does not claim all existing types have passed genuine signed-browser acceptance. Overall request completion is indeterminate pending confirmed target inventory and specialized backend implementations.
