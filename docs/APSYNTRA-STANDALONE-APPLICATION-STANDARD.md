# APSYNTRA CRM — Standalone Native Application Architecture Standard

**Reference implementation:** TimeTracker Attendance  
**Initial migration target:** TradeLink  
**Target registry:** The 12 APSYNTRA board-backed applications  
**Parent architecture:** One CRM host, one shared TypeScript/JavaScript client layer, one Supabase backend, and the existing authoritative board/domain records.

## 1. Required application pattern

Each migrated application must provide the following layers without duplicating its existing business rules or persistence model:

1. **Inventory** — original screens, workflows, business rules, edge cases, reports, and exports.
2. **Mapping** — existing board identity, module key/ID, database tables, RPC contracts, shared host state, and authoritative sources.
3. **Adapter** — a focused `*-native.js` adapter for domain operations and projections. Reuse the existing client implementation; do not create a second API client.
4. **Renderer** — a focused `*-ui.js` entrypoint that exposes semantic application UI. Keep business state in the host controller.
5. **Styles** — application-scoped CSS using the shared design tokens and existing accessibility conventions.
6. **Routing** — a canonical application route and sidebar entry through the existing CRM host lifecycle. Board IDs are internal data-source identifiers, not user-facing application URLs.
7. **Events** — `data-action` / `data-*` actions handled by the existing centralized delegated event handlers.
8. **Verification** — unit, contract, integration, browser, build, deployment, and signed-runtime acceptance.

### Navigation and data rules

- Sidebar links open the native application route directly.
- Application-owned boards are not substitutes for native application pages and are hidden from ordinary board navigation after the native route is accepted.
- Preserve the board and domain records as backend sources. Hiding a shortcut is not a board deletion, archive operation, or data migration.
- Legacy board URLs may be canonicalized to the corresponding native application URL for compatibility; they must never render a generic board-detail page as the application interface.
- Keep deep links, refresh behavior, selected application section, unsaved-form behavior, and host session lifecycle intact.
- Do not add new roles, permission layers, approval gates, or authorization restrictions as part of this architecture-only migration. Preserve existing contracts and checks.

## 2. TimeTracker reference

TimeTracker establishes the existing CRM-native pattern:

- Route: `#/time-tracker` (`TIMETRACKER_APPLICATION_ROUTE`).
- Existing-board discovery: `findTimeTrackerAttendanceBoard()`.
- Adapter: `frontend/time-tracker-native.js`.
- Renderer entrypoint: `frontend/time-tracker-ui.js` and the existing attendance UI modules.
- Scoped styles: `frontend/time-tracker-application.css`.
- Host state, route lifecycle, and delegated events: `frontend/app.js`.
- Authoritative attendance operations continue through the existing TimeTracker RPC contracts; the route does not provision another board or data store.

## 3. TradeLink mapping and migration

### Identity and authoritative sources

| Field | Existing contract |
|---|---|
| Module key / module ID | `tradelink` |
| Existing board ID | `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` |
| Canonical application route | `#/tradelink` |
| Existing board contract | `frontend/tradelink-board-items.js` |
| Primary document table | `public.tradelink_documents` |
| Document event history | `public.tradelink_document_events` |
| Supporting private records | `private.tradelink_document_reviews`, `private.tradelink_document_status_events`, `private.tradelink_document_revision_snapshots`, `private.tradelink_document_sequences` |
| Supporting public records | Existing vendor-asset, attachment-reconciliation, attachment-cleanup, and cleanup-reference tables from the TradeLink migrations |
| Board projection | Existing board item projection and `DomainApi.board()` / board event APIs; no second board is created |

The document and workflow data remains authoritative in the existing TradeLink database contracts. The board remains an existing linked projection and workspace source; the application route does not make the board ID part of its public URL.

### Existing adapter and renderer

- Adapter entrypoint: `frontend/tradelink-native.js`, re-exporting `TradeLinkDomainClient` from `frontend/tradelink-domain-client.js`.
- Renderer entrypoint: `frontend/tradelink-ui.js`, re-exporting the semantic renderer in `frontend/tradelink-application.js`.
- Draft/document workspace: `frontend/tradelink-draft-workspace.js`.
- Scoped application styles: `frontend/tradelink-application.css` and the existing TradeLink reference/split-view styles.
- Host state: `state.tradeLinkSection`, `state.tradeLinkDraft`, `state.tradeLinkActivity`, and `state.tradeLinkAnalytics` in `frontend/app.js`.
- Events: existing centralized delegated `data-action` handlers in `frontend/app.js`.

### Existing RPC families retained

The adapter continues to use the existing signed RPCs; this migration does not replace or alter their contracts.

- Read/list: `tl03_analytics_summary`, `tl03_documents_list`, `tl03_documents_page`, `tl03_assigned_documents`, `tl03_document_read`, `tl03_document_read_assigned`, `tl03_document_revision_bundle`, `tl03_document_history`, `tl03_document_review_stages`, and `tl03_pdf_approval_stages`.
- Document lifecycle: `tl03_document_create`, `tl03_document_save`, `tl03_document_commit`, `tl03_document_submit`, `tl03_document_review`, `tl03_document_decide`, `tl03_document_operate`, and `tl03_document_status_update`.
- Review/PDF audit: `tl03_record_review_stage` and `tl03_record_pdf_approval_stage`.
- Attachments: existing `tl03_attachment_list`, `tl03_attachment_prepare`, `tl03_attachment_finish`, and `tl03_attachment_remove` RPCs.

### Standalone route behavior

- `#/tradelink` is the sidebar entry and canonical application root.
- Deep links use `#/tradelink/drafts/...`, `#/tradelink/documents/...`, `#/tradelink/activity`, and `#/tradelink/analytics`.
- The host resolves the existing TradeLink board internally and invokes the existing `loadBoard()` lifecycle with the native TradeLink renderer. The generic board-detail renderer is not used as the application UI.
- Legacy `#/boards/<TradeLink-board-id>/...` routes are canonicalized to the matching native route.
- The TradeLink and FuelTrack board shortcuts are omitted from active My Boards, Overview board previews, Recent boards, global-search board suggestions, and generic board-detail tab navigation. The same board-visibility rule is applied to the already-standalone TimeTracker and Fund Tracker applications; their existing board records remain intact. The underlying board and all records remain unchanged.

### FuelTrack+ v3 mapping and migration

#### Identity and authoritative sources

| Field | Existing contract |
|---|---|
| Module key / module ID | `fueltrack` |
| Existing board ID | `7af78b3f-67bf-4600-9aa1-9006d19d486e` |
| Canonical application route | `#/fueltrack` |
| Board marker | `[APSYNTRA:MODULE:fueltrack:v1]` |
| Request records | Existing backend-owned relations exposed through signed FuelTrack RPCs; no direct frontend table queries |
| Audit records | Existing immutable audit relation exposed through `fueltrack_v3_audit_read` |
| Receipt metadata | Existing receipt relation exposed through `fueltrack_v3_receipt_*` RPCs |
| Receipt storage bucket | Existing `work-board-files` bucket and linked Board-item paths |
| Database boundary | Existing signed RPC contract; underlying relation names remain backend-owned and are not duplicated in the browser adapter |
| Board projection | Existing FuelTrack+ v3 Board items, columns and values; no second board or data store |

#### Existing application inventory

- Dashboard — verified signed FuelTrack summary and existing Board-only fallback.
- Analytics — Fuel Price, Efficiency, Frequency, Requestors and Odometer views, with existing date-range and metric filters.
- All Requests — search, status/date filters, sorting, pagination and expandable request history.
- New Fuel Request — Vehicle Fuel and Container Refill forms using the existing reference options and submission contract.
- Approvals — signed request queue and existing approve/reject lifecycle.
- LightFuels — refueling queue, two-step refueling details, receipt upload and completion workflow.
- Activity — signed audit timeline, filtering and CSV export.
- Existing exports — All Requests CSV and Activity CSV; spreadsheet-formula neutralization remains in the current exporters.

#### Adapter, renderer and host integration

- Adapter entrypoint: `frontend/fueltrack-v3-native.js`, re-exporting `FuelTrackV3DomainClient` from the existing `frontend/fueltrack-v3-domain-client.js`.
- Renderer entrypoint: `frontend/fueltrack-v3-ui.js`, re-exporting the existing semantic renderer and board projection from `frontend/fueltrack-v3-application.js`.
- Route parser: `frontend/fueltrack-v3-application-route.js`.
- Scoped styles: `frontend/fueltrack-v3-application.css`, included in the shared stylesheet build.
- Host state and event handlers remain in `frontend/app.js`; existing `ft3-*` actions continue through centralized delegated handlers.
- Existing authoritative RPCs remain unchanged: `fueltrack_v3_read`, `fueltrack_v3_analytics`, `fueltrack_v3_audit_read`, `fueltrack_v3_submit`, `fueltrack_v3_decide`, `fueltrack_v3_mark_refueled`, `fueltrack_v3_receipt_prepare`, `fueltrack_v3_receipt_read`, `fueltrack_v3_attach_receipt`, and `fueltrack_v3_complete`.
- Existing idempotency keys, revision checks, signed readbacks, audit records, Board-item linkage, receipt storage and export behavior are preserved.

#### Standalone route behavior

- `#/fueltrack` opens the existing FuelTrack native application renderer through the CRM host lifecycle.
- Section and deep links use `#/fueltrack/analytics/...`, `#/fueltrack/requests`, `#/fueltrack/requests/record/<uuid>`, and the other existing section names.
- Legacy `#/boards/<FuelTrack-board-id>/...` URLs canonicalize to the matching standalone route, including analytics filters and request record IDs.
- The FuelTrack board is hidden from ordinary My Boards, Overview previews, Recent boards, global-search board suggestions and generic board-detail tabs. The existing board and records remain intact and continue to serve as authoritative sources.
- No new role, permission, approval or database layer is introduced by the route migration.

## 4. Twelve-application migration registry

The module keys below are from the existing `BOARD_MODULES` registry. A board-backed application is not considered migrated merely because a renderer or sidebar link exists; its native route, authoritative data mapping, persistence, deep links, and signed runtime must all pass acceptance.

| Application | Module key | Current code evidence | Standardization status |
|---|---|---|---|
| TimeTracker Attendance | `timetracker` | Native adapter, UI, scoped CSS, and `#/time-tracker` route | Reference pattern; standalone route and board-shortcut suppression implemented |
| Fund Released Tracker | `frt` | Native adapter, UI, scoped CSS, and `#/fund-tracker` route | Existing standalone route; legacy board URLs now canonicalize to the native route and board shortcuts are suppressed |
| TradeLink | `tradelink` | Native adapter, renderer, scoped CSS, delegated events, canonical `#/tradelink` route | Standalone route migration complete; PR #511 merged |
| FuelTrack+ v3 | `fueltrack` | Native adapter/UI entrypoints, renderer, scoped CSS, canonical `#/fueltrack` route | Standalone route implemented; verification and merge pending |
| FuelTrans Standalone | `fueltrans` | Native host adapter and separate FuelTrans app/client; current host route is board-scoped | Standalone route migration pending |
| Material Request Hub | `materials` | Existing material-sourcing application/schema modules; current entry is board-scoped | Standalone route and full inventory pending |
| Tool Traceability | `tools` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |
| Toolbox Issues | `toolbox` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |
| Order Intake | `orders` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |
| Employee Evaluation | `evaluation` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |
| Charter Navigator | `charter` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |
| APS AIMS | `aims` | Module manifest entry; no dedicated native adapter/renderer/CSS triplet identified in this inventory | Inventory and mapping pending |

**Separate application:** Feedmill Ticketing Portal (FM1) has its own `frontend/fm1/` application package and `#/fm1` host entry. It is not one of the 12 module keys above and should retain its own domain model and lifecycle while following the same host integration principles.

## 5. Acceptance checklist per application

- [ ] Original screens, business rules, edge cases, and exports inventoried.
- [ ] Existing board/module identity and authoritative database/RPC sources mapped.
- [ ] Dedicated adapter entrypoint reuses existing client/API contracts.
- [ ] Dedicated semantic UI renderer is mounted by the existing CRM host.
- [ ] Application-scoped CSS and shared design tokens are used.
- [ ] Canonical standalone sidebar route and route resolver work after refresh and deep linking.
- [ ] Application-owned board shortcuts are hidden from ordinary navigation without deleting the board.
- [ ] Central delegated `data-action` events cover all existing workflows.
- [ ] Persistence/readback and existing exports pass contract and integration tests.
- [ ] Browser, production build, deployment, and signed-runtime acceptance pass.

## 6. Scope guard

Architecture standardization must preserve the existing Supabase project, schemas, RPCs, data, and business workflows. No new database, board, application shell, role system, permission model, or approval layer is introduced by this standard.
