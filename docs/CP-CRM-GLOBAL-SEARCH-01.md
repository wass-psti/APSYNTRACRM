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

`public.wm_search_workspace_content(text, integer)` is a bounded, read-only invoker wrapper over a private scoped implementation. `pg_trgm` GIN indexes accelerate substring matching on item text and cell values; Two-character tokens use a dedicated parameterized prefix path backed by B-tree expression indexes; longer tokens use trigram substring matching. Date-only matches are checked as a separate bounded item-field candidate path. It searches active and archived boards in the caller's current workspace and reuses the existing `work_board_access(board_id, 'view')` contract. Results are limited to 50 rows and search text is limited to 2–160 characters. No board data, role, membership, RLS policy or existing permission is modified.

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
- Disposable PostgreSQL 17 production-scale benchmark (32,002 items / 224,002 cells): `psql -f sql/tests/cp-crm-global-search-setup.sql -f sql/tests/cp-crm-global-search-acceptance.sql -f sql/tests/cp-crm-global-search-benchmark.sql`
- Disposable PostgreSQL 17 integration: `psql -f sql/tests/cp-crm-global-search-setup.sql -f sql/tests/cp-crm-global-search-acceptance.sql`
- Migration source manifest: `node scripts/verify-migration-source-manifest.mjs`
- Production runtime acceptance: VERIFIED in the deployed signed workspace. `⌘K` opened the palette; module/board and remote record results were returned; arrow navigation and Enter opened the selected record; Escape closed the palette and restored focus. The post-navigation hidden-input focus defect was corrected in PR #420.
- Production API timings observed in the signed browser: first `tool` query 713 ms; warmed `tool` and two-character `wi` queries approximately 468 ms. These are browser-observed request durations, not isolated database execution times.

## Boundaries

No new workspace, board, module, role or permission model. The RPC uses the existing signed workspace identity and per-board view contract. No writes, analytics, telemetry, persistent search history or new dependencies.


## CP-CRM-GLOBAL-SEARCH-02 — Production acceptance CLOSED

- Production migrations applied to the existing Supabase project:
  - `20261116055059_cp_crm_global_search_02_indexed_workspace_search`
  - `20261116062331_cp_crm_global_search_02b_prefix_index_lookup`
- Production indexes are active and used by live signed searches. Latest observed scan counters: item prefix 3, cell prefix 3, item trigram 4, cell trigram 4.
- Production index sizes at verification: item prefix 248 kB, cell prefix 1,632 kB, item trigram 2,232 kB, cell trigram 10,088 kB.
- Public RPC remains invoker-security; the scoped implementation is in the non-exposed `private` schema with an empty fixed search path. Anonymous execute is false; authenticated execute is true. No role, membership, RLS, board permission or business-record changes were made.
- PR #416 (search feature), PR #420 (post-navigation focus restoration) and PR #421 (two-character prefix-index path) are merged to `main`.
- Main commit `9e4345ec`; GitHub Actions run `43817168669` passed, including the live Pages verification job.
- Signed browser acceptance verified `⌘K`, record search, keyboard selection, record navigation, detail opening, Escape dismissal and focus handling. Two-character and trigram index counters both incremented in production.

## Remaining search coverage — CP-CRM-GLOBAL-SEARCH-03

The current palette searches all 12 module descriptors, workspace navigation, active/archived board names and generic `work_board_items` / `work_board_item_values`. It does **not yet search native records held only in dedicated module tables**. The production schema contains native stores for TradeLink documents, FuelTrans tickets, FuelTrack+ requests/receipts, FRT requests/liquidations, TimeTracker overtime and attendance audit data, Tool Traceability inventory/requests, Toolbox Issues, Order Intake, Material Request Hub, Employee Evaluation, Charter Navigator and APS AIMS. Those records require module-specific read adapters using the existing application APIs and data contracts.

Next priority: **CP-CRM-GLOBAL-SEARCH-03 — Native Module Search Adapters, Unified Result Ranking, and Complete Cross-Application Content Coverage.** Inventory each module's authoritative read API and display fields, implement bounded adapters without duplicate identity or permission systems, preserve current navigation, and add focused module-level acceptance tests. Do not expose raw sensitive columns or create broad table scans.
