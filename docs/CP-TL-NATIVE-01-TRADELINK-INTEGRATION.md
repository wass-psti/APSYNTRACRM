# CP-TL-NATIVE-01 — TradeLink native application integration baseline

**Date:** 2026-11-17 Asia/Manila  
**Repository:** `wass-psti/APSYNTRACRM`  
**Base:** `main` at `d00b5a38137ddb1606f45696abe2d116ad949bf6`  
**Supabase:** existing project `jtlusodorfnyzgyuewkz` (PostgreSQL 17.6)  
**Board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Module key:** `tradelink`

## 1. Objective and architectural decision

Use the completed TimeTracker native integration as the repeatable host-integration pattern while retaining TradeLink's own commercial document model and lifecycle.

TradeLink was already integrated into the APSYNTRA CRM board host and already had a signed domain client and semantic renderer. CP-TL-NATIVE-01 adds the explicit `tradelink-native.js` and `tradelink-ui.js` entrypoints and routes the host through them. The existing implementations remain canonical and are re-exported rather than duplicated.

No new framework, application host, authentication client, SDK, backend, database, board, role, permission, approval hierarchy, migration, or production record is introduced.

## 2. Inventory — existing TradeLink screens and modules

### Portal screens

| Screen | Existing responsibility |
| --- | --- |
| Create New | Create a commercial document using the selected source module and its document form |
| All Documents | Signed persisted-document list, filtering, search, paging, preview, editing where supported, revision history, and printing |
| Activity | Existing signed CRM Board activity; not represented as a separate TradeLink collaboration ledger |
| Analytics | Existing signed read-only aggregate RPC |
| User Manual | Source workflow, review, printing, numbering, company and analytics guidance |

### Six source document modules

| Key | Module | Domain responsibility |
| --- | --- | --- |
| `esi` | Electronic SI | Sales invoice, client/tax identity, VAT treatment and finance verification |
| `packing` | Packing List | Shipment contents and source reference |
| `delivery` | Delivery Receipt | Delivered goods, serial/asset identifiers, QC and logistics responsibility |
| `payment` | Payment AR | Received payment, instrument, payor, receiver and verifier |
| `quotation` | Quotation | Commercial offer, price, validity, delivery and payment terms |
| `po` | PO to Suppliers | Supplier purchase order, commercial value and review routing |

The quotation commercial status is separate from the document approval workflow. The original quotation stages are Working on it, Sent, Client Review, Accepted, Declined, On Hold and Closed; these must not be mapped automatically to the Board Quote Status choices.

## 3. Business lifecycle and important edge cases

The existing production behavior and UI manual define the following:

- Save defaults to **For Approval**. A user explicitly selects Draft to save a Draft.
- Two distinct assigned reviewers validate the same saved revision using **Use Time Now**.
- The first reviewer validation leaves the document For Approval; the second validation changes it to Approved.
- Only an Approved revision is eligible for the existing saved-document print workflow.
- **Revise Approved** creates a new For Approval revision and preserves the previous Approved revision as immutable history.
- Existing document number, company assignment and reviewer assignments remain bound across revisions.
- Existing saved document numbers are retained. Automatic numbering remains disabled; do not activate or infer a new numbering scheme.
- A stale expected revision is a conflict; exact same-actor retry behavior is handled by the existing server contract.
- An uncertain save must not create a second document. Refresh the signed list and exact-read the document before retrying with changed values.
- Deep links identify a record but do not authorize or synthesize it. The host reloads the signed listing and exact record.
- The server list is bounded and paginated. A record outside the current page must be verified by exact signed read before being shown.
- Historical revisions are obtained only from the signed revision bundle. A missing revision RPC fallback may show the current signed record only; it must not invent historical snapshots.
- Board synchronization must preserve the exact `board_item_id`, document number, type, revision and workflow state.
- Unsaved editor data is transient host state. It must not be presented as persisted or used as a saved PDF.
- Browser Print / Save as PDF is the saved document output, not electronic PDF issuance.
- Older documents without a company assignment retain the historical Sales & Services default and display the existing warning.
- Analytics does not combine currencies or infer foreign-exchange rates. Receivables aging uses qualifying Approved ESI invoices with due dates; only completed cash Payment AR receipts with an exact ESI document-number reference and matching currency reduce receivables. Unmatched/excess cash is reported separately; cheques remain pending bank clearance; invoices without due dates are excluded.

## 4. Map — authoritative existing sources

### Existing Board and host

- Module key: `tradelink`.
- Canonical Board: `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`.
- Canonical Board marker: `[APSYNTRA:MODULE:tradelink:v1]`.
- The sidebar already obtains TradeLink from the existing `BOARD_MODULES` manifest.
- The existing route is `#/boards/<board-id>/tradelink/<section>`.
- The root/legacy overview route canonicalizes to Create New / Quotation; signed edit and document routes remain explicit.
- `frontend/app.js` remains the host controller, owns TradeLink state, route/session lifecycle and central delegated events.

### Existing authoritative database records

| Source | Purpose |
| --- | --- |
| `public.tradelink_documents` | Canonical current document payload, type, number, workflow state, revision, Board link and timestamps |
| `private.tradelink_document_revision_snapshots` | Immutable revision snapshots and snapshot provenance |
| `private.tradelink_document_reviews` | Revision-bound primary/secondary review assignments and recorded timestamps |
| `private.tradelink_document_status_events` | Revision-bound workflow state transitions |
| `public.tradelink_document_events` | Append-only document operation events |
| `private.tradelink_document_sequences` | Existing numbering sequence structure; automatic numbering is not enabled |
| `public.work_boards` / `public.work_board_items` | Existing CRM Board and linked Board item |

The live read-only catalog inspection confirmed the above objects and existing RPC signatures. The production project currently reports 15 TradeLink documents and 15 baseline revision snapshots. The current aggregate counts are point-in-time diagnostics only; the integration must always retrieve fresh signed data.

### Existing signed RPC surface

| RPC | Adapter responsibility |
| --- | --- |
| `tl03_documents_list` | Bounded signed document list |
| `tl03_documents_page` | Search/filter/cursor-paged document list |
| `tl03_assigned_documents` | Signed reviewer-assigned list |
| `tl03_document_read` | Exact current document read |
| `tl03_document_read_assigned` | Exact assigned-reviewer read |
| `tl03_document_save` | Existing create/update/approved-supersession transaction |
| `tl03_document_status_update` | Existing document status update |
| `tl03_record_review_stage` | Existing primary/secondary review timestamp |
| `tl03_document_review_stages` | Existing signed review-stage readback |
| `tl03_document_revision_bundle` | Current and immutable historical revision projection |
| `tl03_analytics_summary` | Existing read-only analytics aggregate |

Production catalog inspection found authenticated execution enabled and anonymous execution disabled for the inspected public TradeLink RPCs. This integration does not change those grants or function definitions.

## 5. Adapter and renderer entrypoints

### Adapter — `frontend/tradelink-native.js`

- Exposes the existing `TradeLinkDomainClient` as `TradeLinkNativeClient`.
- Re-exports the existing validation and projection functions and the existing feature gates.
- Does not duplicate RPC transport, session validation, domain rules, revision handling or server receipts.
- `TradeLinkDraftWorkspace` now constructs the native adapter entrypoint.
- The legacy `tradelink-domain-client.js` remains the canonical implementation and public compatibility path.

### Renderer — `frontend/tradelink-ui.js`

- Exposes the existing source-aligned semantic renderer and its pure navigation/filter helpers.
- Does not own mutable application state or call the database.
- The host renders through this entrypoint.
- The legacy `tradelink-application.js` remains the canonical renderer implementation and compatibility path.

### Styles

- Existing scoped stylesheet: `frontend/tradelink-application.css`.
- The stylesheet is already included in `scripts/priority5-style-manifest.mjs`.
- The generated `frontend/apsyntra-styles.bundle.css` remains linked by `index.html`.
- No global CSS or bundle-order changes are needed.

## 6. Route, events and host lifecycle

The existing TradeLink route and sidebar registration are retained. No duplicate standalone route or second application host is created.

- Route and board identity continue to be resolved in the existing CRM host.
- The host controller retains `tradeLinkDraft`, `tradeLinkSection`, activity, analytics and pending-operation state.
- Domain actions continue to use `data-action` and the host's delegated event handlers.
- Form, click, change and input behavior stays in `frontend/app.js`.
- Session, workspace, route serial and exact Board identity are rechecked before asynchronous results are committed to host state.
- Existing TimeTracker and other application routes are not changed.

## 7. Feature gates preserved

The native entrypoint exposes the existing capability values without changing them:

| Capability | Existing value |
| --- | --- |
| Domain reads | Enabled |
| Existing document writes | Enabled |
| Analytics | Enabled |
| Dual reviewer timestamps | Enabled |
| Automatic numbering | Disabled |
| Legacy submit RPC | Disabled |
| Legacy review/revision RPC | Disabled |
| Legacy approve/reject RPC | Disabled |
| Legacy operational workflow RPC | Disabled |
| Electronic PDF approval-stage RPC | Disabled |

The existing `Revise Approved` path is handled by the already merged and activated `tl03_document_save` contract. It is not a reason to enable the separate staged workflow RPCs.

## 8. Verification plan and classification

- Unit: native adapter alias, feature-gate preservation, source document validation and workspace projection.
- Contract: existing RPC names, board ID and domain client remain canonical.
- UI: six module screens, portal navigation and reviewer presentation.
- Route: existing sidebar module, canonical route and signed edit route.
- Events: central delegated event handlers and host-owned state.
- Styles: scoped CSS and generated bundle manifest.
- Build/deployment: GitHub Actions frontend validation, Vite production build and GitHub Pages deployment at the exact merge commit.
- Signed runtime: preserve the existing live session; verify portal navigation, All Documents readback, exact document detail, reviewer stage readback and existing Approved revision behavior without fabricating business records.

**Production changes:** none in CP-TL-NATIVE-01. No migration, production RPC, permission, document, review, revision, counter, attachment or company profile is changed by the adapter/UI entrypoint integration.

**Acceptance boundary:** a passing unit suite/build proves the refactor and its source contracts. It does not by itself certify a fresh signed browser session or the complete six-module business lifecycle.
