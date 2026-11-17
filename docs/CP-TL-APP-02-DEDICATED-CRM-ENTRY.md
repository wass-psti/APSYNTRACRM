# TradeLink dedicated APSYNTRA CRM application route

## Scope

This change adds a dedicated TradeLink navigation entry at `#/tradelink`, analogous to FM1's `#/fm1` application entry and TimeTracker's dedicated app route. It **reuses** the existing native TradeLink renderer, signed Board/domain client and APSYNTRA CRM authentication, rather than embedding or copying the uploaded standalone Node server.

The uploaded `TradeLink-Standalone(2).zip` contains v0.1.74: TypeScript browser UI, local Node/JSON persistence, development identity, workflow, revision history, attachments, reports and six document modules. CRM already has an independently developed native TradeLink implementation. Copying the standalone local backend or development fallback into the CRM would create a second state/authorization boundary, so this change is confined to app entry, navigation and presentation.

## Entry and compatibility

- Sidebar: **TradeLink** links to `#/tradelink`.
- Entry canonicalizes to `#/tradelink/drafts/quotation`.
- Portal sections: Create New (all six document types), All Documents, Activity, Analytics, User Manual.
- Deep links under the dedicated route are translated to the existing signed Board loader. There is no independent database/host.
- Existing `#/boards/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/tradelink/...` URLs stay compatible.
- Unavailable or inaccessible TradeLink Board is reported; no Board is created.
- The dedicated view does not show the generic Board toolbar or tabs; the Board remains available through My Boards.
- Legacy renderer and API imports remain compatible; only the dedicated presentation rewrites internal portal links to the new route.

## Unchanged authority

- Existing Supabase Auth identity and workspace context.
- Existing TradeLink Board, source document models, six document modules, signed RPCs, revision and dual-review behavior, saved-document print and access checks.
- No new SQL migration, permission, service-role key, browser-local backend, synthetic production data or production attachment activation.

## Verification

`node --test frontend/tests/tradelink-dedicated-app.test.mjs`
`npm test`
`npm run check`
`npm run build`

Follow-up manual signed acceptance is needed for Create New, All Documents, record deep links, reviewer actions, Analytics, approval/print flow, old Board URL compatibility and mobile navigation. Local syntax/source tests cannot establish signed production readiness.

## Known boundaries

This is **the FM1-style application entry integration**, not a claim that every locally implemented standalone feature has already been ported or accepted. In particular, do not import local development login, JSON workspace data or local file blobs into production. Features not present or activated in the existing CRM TradeLink contract require separate authorization and acceptance.
