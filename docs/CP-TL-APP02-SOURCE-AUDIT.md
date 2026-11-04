# CP-TL-APP02 — Uploaded TradeLink source audit and APSYNTRA integration gates

Date: 2026-11-04. Source inspected: user-supplied `tradelink.zip` (`tradelink/src/**`, application documentation, scripts, and both source Supabase migrations). This is an engineering baseline, **not a declaration that the production application is complete**.

## Source inventory / reproducible checks

The uploaded archive contains 231 ZIP entries / 214 regular files, including:
- `src/main.ts` — ~274 KB document/form/navigation controller.
- `src/styles.css` — ~302 KB source design system.
- `src/domain/{types,constants,model,workflow,document-modules,document-workspace,rbac,attachments,collaboration,change-history,version-history}.ts`.
- `src/{auth,data,sync,services,files}/**`, `src/bootstrap.ts`, `watchdog-host-bridge.js`, server code, migrations and verification scripts.
- No React, Vue or Angular frontend dependency. The source is browser-native TypeScript transpiled to JavaScript.

Offline in the extracted archive: `tsc --noEmit -p tsconfig.json` passed using TypeScript 5.8.3. `tsc -p tsconfig.json` passed. These original-source scripts passed: `verify-workflow.mjs`, `verify-create-modules.mjs`, `verify-rbac.mjs`, `verify-attachments.mjs`, `verify-all-documents.mjs`, `verify-persistence.mjs`, `verify-version-history.mjs`, `verify-collaboration.mjs`, and `verify-server-sync.mjs`. `verify-supabase-integration.mjs` did **not** pass: the offline build emits `dist/tradelink-config.js` with `enabled:false`, whereas that script asserts the production Supabase URL and publishable key. No credentials were injected to force this test to pass. They use source-defined local fixtures/roles; **none is a signed APSYNTRA acceptance test**.

The package's `APP_VERSION` is `0.1.74`, while historical README headings refer to `v2.0.15`. Preserve the actual domain contracts; do not infer release equivalence from the mixed headings.

## Domain model and relationships

- `DocumentRecord`: stable document ID/number, one of six `documentType` values, dates, persisted company/vendor binding and print template, party/contact fields, references, financial terms, currency, VAT/discount/exchange rate, `LineItem[]`, reviewer/approver/operational assignees, and a `DocumentWorkflow`.
- `DocumentWorkflow`: state, revision and ordered append-only `WorkflowEvent[]`. Original states: Draft, Submitted, Under Review, Revision Required, Approved, Rejected, Completed, Cancelled. Workflow transitions require actor capabilities; state/content lock and assigned reviewer/approver checks apply.
- Six Create New modules: Electronic SI (`esi`), Packing List (`packing`), Delivery Receipt (`delivery`), Payment AR (`payment`), Quotation (`quotation`), and PO to Suppliers (`po`). Source module rules separately distinguish **structural draft validity** from **full submission readiness**.
- Supporting entities: `StoredParty` (client/supplier), `Vendor`/`VendorTemplate`, `DocumentComment`, `DocumentAttachment`, `DocumentVersion`, `RecoveryEntry`, audit/activity events, notification read receipts, and workspace snapshots.
- `document-workspace.ts`: full document search, sorting, filters, bounded pagination, saved views and quick preview.
- `model.ts`: line item subtotal, discount, VAT and PHP exchange-rate calculation. Preserve currency alongside amounts; a single board number cannot represent amount denomination.
- `attachments.ts`: supported PDF/image/text/Office files, max 20 MB, SHA-256, object identity, replacement/removal/restore history. File bytes stay outside workspace JSON.
- Other source workspaces: Activity/Notifications, User Manual, Recovery, and application Access.

## Critical platform alignment findings

1. **Authentication:** `src/auth/host-provider.ts` includes a local-development General Manager fallback for standalone launch. Do not include that code in APSYNTRA. Only existing APSYNTRA signed identity and fresh server authorization may confer access. Do not seed source local identities, administrators or roles into production.
2. **Application RBAC:** source `rbac.ts` has independent `system-admin`, `manager`, `sales-supervisor`, `sales`, `finance`, `logistics`, `viewer` capability assignments. They are **reference behavior**, not a substitute for central platform/board ceilings or server-enforced module permissions. A central policy mapping and denied-case tests are required before domain writes.
3. **Persistence:** source `src/bootstrap.ts` mirrors localStorage to a standalone Node API, while M7 uses a server-revisioned `tradelink_workspaces` JSON/RPC model. Do not import browser-local, standalone server, or separate membership infrastructure as an independent source of truth.
4. **Source SQL incompatible with direct activation:** `20260904_tradelink_server_sync.sql` establishes TradeLink-specific workspace membership and workspace state; `20260904_tradelink_attachments.sql` authorizes Storage through `tradelink_workspace_members`. The approved APSYNTRA platform uses **existing** central signed workspace/RBAC/RLS; those source policies cannot be applied blindly. No production migration has been executed for this checkpoint.
5. **Backend readiness:** the existing production board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` is active, but its last read-only inspection returned 0 items, 8 v1 technical columns and no five new typed UI columns persisted. Public TradeLink tables seen in the existing project concern vendor assets and attachment cleanup/reconciliation, not an authoritative `DocumentRecord` repository. Do not fabricate documents from board-row titles.
6. **Board projection is lossy:** the requested four Workflow Status options (For Approval, Submitted, Approved, Draft) do not encode the source's eight lifecycle states; the board's eleven Quote Status options differ from `QuoteStatus` in the source (Working on it, Sent, Client Review, Accepted, Declined, On Hold, Closed). **Never silently convert statuses or use a board status cell to authorize workflow transitions.** An explicit, reviewed projection mapping is required.
7. **Board Person and Amount are insufficient alone:** source has creator, updater, reviewer, approver, receiver, checker, and delivery operator; choose a defined Person meaning before projection. Persist currency, rate, discount, tax breakdown and document revision in the authoritative domain; a board Amount number should be a derived, currency-qualified summary.
8. **Source files vs CRM Files:** source uses private `tradelink-attachments` Storage and document-linked metadata. The existing board's Files cell is only a presentation placeholder; private Storage policies and server metadata/grants require separate approval and signed tests.

## Implemented APSYNTRA frontend slices (source-aligned, read-only)

- `frontend/tradelink-application.js`: source-defined module descriptions and workflow stages; six module navigation routes; signed board records query surface; no local mock documents or workflow writes.
- `frontend/tradelink-activity.js`: a real read-only **board event** view using the existing `wm_list_board_events` path via `DomainApi.boardEvents`. A signed `view` check, actor/workspace/route revalidation, and escaped rendering prevent cross-session stale data. This is **not** the original TradeLink collaboration/notification stream.
- `frontend/tradelink-finance.js`: source-derived line-item, discount, VAT (15% TKM/KSA, 12%, exempt and zero), currency and PHP exchange-rate calculation for an **unsaved** preview on Electronic SI, Quotation and PO module pages. Browser input/change updates text nodes; no document writes, local persistence or API calls. The original source's separate full document readiness rules remain unported.
- `frontend/tradelink-board-items.js`: seven-column UI contract and signed manager-only setup for five supported typed columns. The Files column remains inactive.
- `frontend/tradelink-application.css`: scoped responsive and reduced-motion treatments, no new framework.

## Next authorization-safe implementation gates

| Gate | Definition of completion | Current state |
|---|---|---|
| TL-02A Source inventory | Inspect actual source, recover key entity/role/flow contracts, offline compile and focused source tests | VERIFIED for reviewed source |
| TL-02B App navigation/read-only board | Six module pages and signed board reader on existing board, read-only activity view, no local source-of-truth | IMPLEMENTED-UNVERIFIED live |
| TL-02C Typed board configuration | Five real typed columns, exact status labels, signed operator activation, reload and denial evidence | PENDING signed activation |
| TL-03 Domain persistence contract | Central existing-PostgreSQL transaction model preserving documents, line items, approvals, events, attachments and CAS; central RBAC/RLS; migration reviewed without destructive import | PENDING |
| TL-04 Domain UI/workflows | Six source-defined forms, document listing/search/preview, financial calculations, validated Save Draft/Submit, workflow transitions, audit and reporting | PENDING |
| TL-05 Collaboration/recovery/attachments | Source behaviors with private Storage and server-enforced permissions, history, rollback and safe purge gates | PENDING |
| TL-06 Acceptance | Signed positive/negative, cross-workspace, expired/revoked session, revision/CAS, refresh persistence, browser, responsive, regression and production deployment evidence | PENDING |

**No full-source application import, production database write, permission mutation, standalone auth, new backend, or binary Storage upload was performed in TL-02A/B.** Do not advance to production writes until a signed central document API and server-side authorization contract exist.
