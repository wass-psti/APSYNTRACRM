# CP-CRM-GLOBAL-SEARCH-01 — Centralized Application-Wide Search

## Scope

Introduce a single command palette across APSYNTRA CRM while preserving the existing search fields and route contracts.

## User interaction

- macOS: `⌘ K`
- Windows/Linux: `Ctrl K`
- The topbar Search control opens the same palette on desktop, tablet and mobile.
- Live filtering covers the 12 application modules, current workspace navigation, active/archived board names and descriptions, and board records.
- Record search covers title, notes, status, due date and existing board cell values.
- Arrow Up/Down changes the active result; Enter opens it; Escape closes the palette; Tab stays within the palette.
- Selecting a record opens its existing board-items route, loads additional pages only when needed, and opens the existing read-only record detail drawer.

## Data and backend contract

`public.wm_search_workspace_content(text, integer)` is a bounded, read-only invoker wrapper over a private scoped implementation. `pg_trgm` GIN indexes accelerate substring matching on item text and cell values; B-tree pattern indexes support two-character prefix matching. Date-only matches are checked as a separate bounded item-field candidate path. It searches active and archived boards in the caller's current workspace and reuses the existing `work_board_access(board_id, 'view')` contract. Results are limited to 50 rows and search text is limited to 2–160 characters. No board data, role, membership, RLS policy or existing permission is modified.

The RPC is registered as a read-only `DomainApi` call so it does not invalidate board caches. The public PostgREST wrapper is invoker-security; the scoped implementation remains in the existing non-exposed `private` schema with a fixed empty search path. The frontend discards stale responses when a newer query or workspace change occurs.

## UX and compatibility

The palette uses DOM text nodes/textContent for result content, retains the current hash router, does not intercept shortcuts while a text editor/select control is focused, and closes when the signed user/workspace scope changes. Existing board, issue and module search fields remain untouched.

The stylesheet is added to the ordered CSS bundle. The new JavaScript and CSS assets are included in Pages smoke verification and the source guard.

## Verification

- Focused Node tests: `node --test frontend/tests/global-search.test.mjs`
- Full frontend tests: `node --test frontend/tests/*.test.mjs`
- Syntax: `node --check` on frontend JavaScript files
- CSS bundle: `node scripts/build-priority5-styles.mjs --check`
- Source guard: `node scripts/verify-pages-source.mjs`
- Disposable PostgreSQL 17 production-scale benchmark (32,001 items / 224,002 cells): `psql -f sql/tests/cp-crm-global-search-setup.sql -f sql/tests/cp-crm-global-search-acceptance.sql -f sql/tests/cp-crm-global-search-benchmark.sql`
- Disposable PostgreSQL 17 integration: `psql -f sql/tests/cp-crm-global-search-setup.sql -f sql/tests/cp-crm-global-search-acceptance.sql`
- Migration source manifest: `node scripts/verify-migration-source-manifest.mjs`
- Production runtime acceptance: confirm shortcut and visible Search button, module/board results, remote record result, arrow navigation, Enter navigation, Escape close, and mobile layout in the deployed signed workspace.

## Boundaries

No new workspace, board, module, role or permission model. The RPC uses the existing signed workspace identity and per-board view contract. No writes, analytics, telemetry, persistent search history or new dependencies.
