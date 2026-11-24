# CP-OI-NATIVE-02 — Native application routing and read UI foundation

## Scope and implementation

Continues CP-OI-NATIVE-01 (f767541b), based on origin/main 4e6b3374.
The existing Order Intake board, database tables, RPC contracts and authorization are unchanged.

- Native CRM entry: #/order-intake; Dashboard, Workflow, Search and All Orders share a bounded, workspace-scoped order snapshot.
- Sidebar entry retains the existing board-catalog visibility condition. Existing board links remain available until signed acceptance and source reconciliation.
- Global native search results open the canonical order record route. Record details use the existing signed detail reader.
- Filters and tab selection persist in the hash; refresh reloads the first page; load-more appends a bounded page without duplicate IDs.
- Dashboard financial amounts stay separated by currency; workflow stages use stored status values. Partial-page totals and search results explicitly identify their loaded-record scope.
- Scope changes, route exits, logout and session expiration invalidate old read state. No new permission or role check is added.
- The responsive Order Intake stylesheet remains within the established deterministic bundle, before the approved final CRM visual layers.
- This is a read foundation: no fake mutation, document generation, or drag-and-drop actions. Comprehensive server-side search and aggregation are later milestones.

## Evidence

- Order Intake focused tests: 15/15 passed (7 previous foundation + 8 new).
- Full frontend regression: 3,602/3,602 passed.
- npm run check: passed; 222 recovered baseline and 84 forward migration files match manifests.
- npm run lint: passed (existing configured scope).
- npm run build: passed; large-chunk warning remains.
- CSS bundle check: passed, 79 sources.
- Chromium fixture acceptance: eight checks passed, including tabs, filters, shared pagination, record links, refresh, desktop/mobile overflow, zero page errors. This isolates real renderer and state modules with nonproduction data; it is not an authenticated full CRM browser run.
- No production writes, schema changes, new dependencies, gradient descent, training, or model parameter updates introduced.

## Pending / next

CP-OI-NATIVE-02A: genuine signed read and source reconciliation. Open the native route in a signed local CRM browser, verify actual records and existing board/domain linkage, test refresh and deep links. If records are missing or incomplete, identify their source before implementing purchase order mutations. Do not remove the underlying board or deploy until the intended acceptance scope is verified. Once verified, continue CP-OI-NATIVE-03 (purchase order creation and editing).
