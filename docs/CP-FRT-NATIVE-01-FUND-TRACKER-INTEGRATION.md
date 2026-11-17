# CP-FRT-NATIVE-01 — Fund Tracker CRM-Native Application Integration

**Project:** APSYNTRA CRM  
**Application:** Fund Release Tracker (Fund Tracker)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Base branch:** `main`  
**Implementation branch:** `feat/cp-frt-native-01-fund-tracker-application-20261117`  
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`  
**Existing FRT board:** `f36da8fe-8d9d-4629-9938-12533cb3ca39`  
**Module ID:** `frt`

## Objective

Apply the established TimeTracker native integration pattern to Fund Tracker while preserving Fund Tracker's own financial data model, workflows, lifecycle, RPC contracts, existing Board projection, and existing Supabase project.

This is a host integration, not a rewrite of the financial application.

## 1. Inventory — existing screens and capabilities

The existing FRT renderer and domain modules expose the following application surfaces:

- Fund Tracker request register, company selector, status distribution, and request details.
- Executive Dashboard and OPEX Analytics.
- User Manual and operational lifecycle guidance.
- New Fund Request wizard, draft restoration, duplicate guard, filing state, and request submission.
- Request detail, lifecycle timeline, finance action review, activity, and audit history.
- Discussion comments are integrated through the existing frt_comments read contract and frt_add_comment write RPC; the host refreshes the persisted thread after posting.
- Activity Log and CSV export are integrated through bounded frt_audit_logs reads, the authoritative company request list, and the existing audit CSV projection.
- General request-file attachment upload/download is not yet integrated into the CRM-native request detail UI. The existing frt_attachments/Storage history is not copied into Board cells; receipt-level liquidation records are a separate supported workflow.
- Company profile metadata and company logo handling.
- Saved recipients, recipient bank details, and private QR file handling.
- Disbursement Voucher preview/document projection and PDF generation/reprint.
- Manual debit/credit accounting lines, templates, balance validation, and saved accounting readback.
- Bank execution evidence and derived liquidation deadline.
- Receipt-level liquidation submission and readback.
- Archive listing and request restoration.
- Intercompany obligations, settlements, and company matrix.

### Recovered standalone source baseline and screen inventory

The preserved Fund Tracker v0.5.0 WatchdogWorkspace integration source was inspected locally. Its source entry points are under Fund-Released-Tracker-main/apps/web/src/:

- App.tsx and FundReleasedTrackerApp.tsx: application shell, company selector, host bootstrap, and navigation.
- pages/FundTracker.tsx: request register, search, status/liquidation filters, sorting, pagination, KPI strip, and request selection.
- pages/Executive.tsx: request-status pipeline, financial KPIs, and top expense categories.
- pages/Opex.tsx: requested-versus-released monthly trend, category breakdown, liquidation exposure, and the original static intercompany placeholder.
- pages/Manual.tsx: user guidance and the original FRT role/workflow explanation.
- pages/Admin.tsx: standalone FRT member/role administration through the old API compatibility layer; it is not reintroduced as a second CRM role-management system.
- components/NewRequest.tsx: department, fund source, recipient, destination bank/account, needed date, purpose, multiple expense categories, and calculated request total.
- components/RequestModal.tsx: request detail, correction, finance approval/rejection, optional GM verification, revocation, closure/archive actions, supporting-file upload/download, liquidation breakdown, comments, and audit CSV.
- components/InAppNotifications.tsx: in-app attention notices refreshed from existing request data; no email delivery.
- lib/api.ts and platform/integration/*: compatibility API mapping to the existing Supabase project and host-provided workspace session.

The standalone v0.5.0 source does not contain the later CRM-native voucher PDF/accounting editor, company-profile/logo editor, saved-recipient/QR service, bank-execution evidence, receipt-level liquidation, or persisted intercompany ledger. Those are existing APSYNTRA CRM enhancements and remain authoritative; they are not replaced by the older standalone components.

The supplied Monday.com Board ID 18397563989 and @api/monday-storage references are not executable integrations in the recovered v0.5.0 source or current CRM repository. The Monday board identifier is retained as reference provenance only. The current CRM application resolves its own board UUID f36da8fe-8d9d-4629-9938-12533cb3ca39 through the frt module marker. No Monday SDK, storage namespace, or external Board ID is used as an APSYNTRA persistence key.

### Existing lifecycle and business rules

- A new request is created through the existing signed FRT writer and starts in the established pending-approval workflow.
- Voucher numbering is generated by the existing monthly company-scoped counter contract. The current format is `DV-[CO]-[YYYYMM]-[SEQ]`.
- The duplicate guard uses the existing ten-minute window. It is not a replacement for the database uniqueness/transaction contract.
- Request drafts use the existing 24-hour TTL and ten-second save delay.
- Finance approval, rejection, and other request actions remain existing server-owned lifecycle transitions.
- General Manager verification is separate from actual bank execution evidence.
- A 72-hour liquidation deadline is derived from a recorded bank execution event, not from GM verification alone.
- Liquidation uses the existing receipt-level contract; a submitted liquidation is not equivalent to a bank payment.
- Accounting amounts use exact decimal/cents handling. Saved debit and credit totals must reconcile to the request amount before the voucher projection can be treated as complete.
- Intercompany obligations and settlements remain a separate document-backed ledger; free-text fund-source labels do not create accounting obligations.
- Archive and restore use the existing source record and lifecycle checks.

### Edge cases to preserve

- A populated CRM Board mirror must not be interpreted as an authoritative count of financial requests.
- Missing signed aggregates remain unavailable; no totals, department allocations, budget utilization, bank status, or overdue figures are fabricated.
- A stale request, accounting, or date revision must be reconciled against the existing server contract rather than silently overwritten.
- Duplicate submissions, missing company membership, malformed money/date values, invalid receipt sets, and unavailable RPCs retain their existing error paths.
- Private bank, recipient, QR, attachment, and requester data must not be copied into generic Board cells or the native search projection.
- A failed read or save must not be presented as a successful financial operation.

### Existing exports

- Voucher PDF preview/download/print/reprint uses the existing voucher document pipeline.
- Audit history has a CSV projection through the existing audit export helper.
- Ordinary CRM Board CSV/XLSX export remains a Board export and is not a substitute for a financial request, accounting, or audit export.

## 2. Map — authoritative sources and shared state

| Concern | Existing source |
|---|---|
| Module identity | `frt` in `frontend/board-manifest.js` |
| Board identity | `FRT_BOARD_ID` in `frontend/frt-board-reference.js` |
| Existing Board | Fund Released Tracker; Board projection only |
| Financial source of truth | Existing FRT Supabase domain tables and signed RPCs |
| Host lifecycle | Existing CRM `loadBoard`, `boardPage`, `render`, and route controller |
| Shared FRT state | Host `state.frtFinance`, `frtFinanceBusy`, `frtFinanceView`, `frtStatusFilter`, `frtFinanceDetail`, `frtFinanceDetailBusy`, `frtFinanceDetailId`, `frtFinanceDetailRevision` |
| Native request search | Existing safe-list projection, routed through the new adapter |
| Delegated events | Existing central `data-action` handler in `frontend/app.js` |

### Existing FRT tables found in migrations

- `frt_memberships`
- `frt_companies`
- `frt_voucher_counters`
- `frt_requests`
- `frt_request_items`
- `frt_liquidations`
- `frt_liquidation_items`
- `frt_attachments`
- `frt_comments`
- `frt_audit_logs`
- `frt_saved_recipients`
- `frt_bank_executions`
- `frt_ic_obligations`
- `frt_ic_settlements`
- `frt_request_accounting_lines`

### Existing RPC contracts found in the FRT migrations and clients

Current signed application contracts:

- Bootstrap and safe reads: `frt_bootstrap`, `frt_board_list_safe`, `frt_board_dashboard_safe`, `frt_restricted_request_detail`.
- Request lifecycle and assignment: `frt_create_request`, `frt_request_action`, `frt_set_request_filing_status`, `frt_update_request_date_cas`, `frt_assignable_people`, `frt_request_assignment`, `frt_assign_request_person`.
- Company profile: `frt_update_company_profile`.
- Recipients: `frt_list_saved_recipients`, `frt_save_recipient`, `frt_set_recipient_qr`.
- Accounting: `frt_request_accounting_snapshot`, `frt_save_request_accounting_lines`.
- Bank and liquidation: `frt_bank_execution_snapshot`, `frt_record_bank_execution`, `frt_liquidation_snapshot`, `frt_submit_liquidation_v2`, `frt_liquidation_aging_company`.
- Intercompany: `frt_ic_snapshot`, `frt_ic_create_obligation`, `frt_ic_record_settlement`.
- Archive: `frt_archive_list`, `frt_restore_request`.

Compatibility/legacy routines retained in migration history include frt_list_requests, frt_get_request, frt_update_request, frt_register_attachment, frt_submit_liquidation, frt_dashboard, frt_companies, frt_admin_users, and frt_admin_set_role. They are not substituted for the current signed request, voucher, accounting, liquidation, or company-profile contracts. The current comments adapter intentionally uses frt_add_comment; audit history reads the existing frt_audit_logs table with company/request scoping. The standalone Admin page's legacy frt_admin_* compatibility routes are not reintroduced into CRM role management. General request-file attachment UI remains pending.



This integration does not add or modify a database object.

## 3. Adapter

Added `frontend/fund-tracker-native.js`.

- FundTrackerNativeClient.snapshot() delegates to the existing loadFRTFinanceReadOnly domain read.
- FundTrackerNativeClient.searchRequests() delegates to the existing searchFRTRequestsReadOnly safe search.
- The adapter is the host controller's single FRT domain API facade for request creation/filing, date edits, assignment, domain actions, company profile/logo, saved recipients, accounting editor mounting, voucher detail, bank execution, liquidation, comments, audit, aging/deadline snapshots, archive/restore, and intercompany operations.
- frontend/app.js calls the facade for those operations instead of importing the underlying FRT API clients directly. UI renderers and pure presentation helpers remain in their existing modules.
- The facade injects the existing signed AuthClient and DomainApi into the established domain modules. Those modules remain authoritative for validation, RPC contracts, mutations, readback, and lifecycle rules.
- Pure accounting, company-profile, workflow, voucher, receipt, bank-execution, and request-detail projections are exported from the adapter.
- No second Supabase client, browser-local financial store, duplicate RPC implementation, or new schema is introduced.

## 4. Renderer

Added `frontend/fund-tracker-ui.js`.

- Provides a semantic application shell using header, main, and footer elements.
- Reuses `renderFRTFinanceReadOnly` for the actual financial application surfaces.
- Preserves the existing FRT `data-action` contracts.
- Keeps mutable application state in the CRM host controller.

## 5. Styles and bundle

Added `frontend/fund-tracker-application.css` with selectors scoped to the Fund Tracker native root.

- Reuses existing FM1 design tokens.
- Adds application header, status, company context, footer, responsive behavior, focus visibility, and reduced-motion handling.
- Registers the stylesheet in `scripts/priority5-style-manifest.mjs` and the ordered-source documentation in `index.html`.
- Adds the new application assets to `scripts/pages-smoke.mjs`.

## 6. Route and host lifecycle

Added the dedicated route `#/fund-tracker` and validated request deep links:

`#/fund-tracker/record/[companyCode]/[requestId]`

The route resolves only the existing FRT board and calls the existing `loadBoard(boardId, 'finance')` lifecycle. It does not create a board or bypass the signed host context.

Same-board navigation is handled explicitly: if the host can retain the already-loaded FRT board, pending native request deep links still reload the company-scoped request list and resolve the requested detail instead of being dropped by the retained-board fast path.

The existing `#/boards/[boardId]/finance` route and its request deep links remain supported.

## 7. Events and state

Existing `frt-finance-view`, `frt-finance-detail`, `frt-finance-action`, company selection, wizard, accounting, voucher, liquidation, archive, and collaboration events remain delegated through the existing central event handler.

The adapter and renderer do not introduce a second event bus or independent application state store.

## 8. Verification status

- Route and board resolver unit tests: PASS.
- Native adapter composition tests: PASS.
- Renderer/delegated-action contract tests: PASS.
- Sidebar, CSS manifest, HTML entry, generated bundle, and Pages smoke asset tests: PASS.
- Full frontend regression after latest-main sync and adapter facade cutover: 2,580 PASS, 0 FAIL.
- Ordered stylesheet bundle verification: PASS.
- Production Vite build: PASS (existing non-blocking startup-guard script-tag and large-chunk advisories).
- Fund Tracker native renderer Chromium acceptance: PASS.
- Focused FRT adapter/host-contract regression after facade cutover: 92 PASS, 0 FAIL.
- GitHub Actions latest-head workflow: QUEUED after latest-main sync; final CI result pending.
- GitHub Pages deployment verification: pending merge and deployment.
- Genuine signed production runtime acceptance: pending.

No production financial record, accounting entry, company profile, recipient, voucher, liquidation, bank execution, or archive record is created or modified by this integration milestone.

### Current parity gaps carried forward

- General request-file attachments: PENDING. The recovered standalone RequestModal supports file upload/download, while the current CRM renderer explicitly keeps generic attachment upload separate. Receipt-level liquidation items are implemented independently.
- Purchase Order synchronization: PENDING / UNVERIFIED. No current native FRT-to-Order Intake write contract was established in this inventory.
- Genuine production request, voucher, accounting, bank-execution, and liquidation readback: PENDING because the live FRT request/accounting/liquidation/bank-execution tables currently contain no production rows. No synthetic financial records are permitted.
- FRT-specific Admin screen: NOT REINTRODUCED. The old standalone Admin page uses retired compatibility RPCs; existing CRM workspace/role behavior is preserved without a second role system.


## 2026-11-17 Source Recovery and Native Adapter Cutover

### Recovered standalone source inventory

The preserved Fund Tracker v0.5.0 WatchdogWorkspace integration source was inspected locally under Fund-Released-Tracker-main/apps/web/src/:

- App.tsx and FundReleasedTrackerApp.tsx: application shell, company selector, host bootstrap, and navigation.
- pages/FundTracker.tsx: request register, search, status/liquidation filters, sorting, pagination, KPI strip, and request selection.
- pages/Executive.tsx: request-status pipeline, financial KPIs, and top expense categories.
- pages/Opex.tsx: requested-versus-released monthly trend, category breakdown, liquidation exposure, and the original static intercompany placeholder.
- pages/Manual.tsx: user guidance and original FRT role/workflow explanation.
- pages/Admin.tsx: standalone FRT member/role administration through old API compatibility routes. This screen is not reintroduced as a second CRM role-management system.
- components/NewRequest.tsx: department, fund source, recipient, destination bank/account, needed date, purpose, multiple expense categories, and calculated request total.
- components/RequestModal.tsx: request detail, correction, finance approval/rejection, optional GM verification, revocation, closure/archive actions, supporting-file upload/download, liquidation breakdown, comments, and audit CSV.
- components/InAppNotifications.tsx: in-app attention notices refreshed from existing request data; no email delivery.
- lib/api.ts and platform/integration/: compatibility API mapping to the existing Supabase project and host-provided workspace session.

The standalone v0.5.0 source does not contain the later CRM-native voucher PDF/accounting editor, company-profile/logo editor, saved-recipient/QR service, bank-execution evidence, receipt-level liquidation, or persisted intercompany ledger. Those later APSYNTRA CRM enhancements remain authoritative and are not replaced by the older standalone components.

The supplied Monday.com Board ID 18397563989 and @api/monday-storage references are not executable integrations in the recovered v0.5.0 source or current CRM repository. The identifier is retained as reference provenance only. The current CRM application resolves its own board UUID f36da8fe-8d9d-4629-9938-12533cb3ca39 through the existing frt module marker. No Monday SDK, storage namespace, or external Board ID is used as an APSYNTRA persistence key.

### Native adapter cutover

The host controller now uses FundTrackerNativeClient as the single FRT domain API facade for:

- Request creation and filing changes.
- Request date and person-assignment operations.
- Existing request lifecycle actions.
- Liquidation reads and submissions.
- Bank-execution reads and recording.
- Comments, audit pages, notifications, aging/deadline snapshots, and CSV projection.
- Archive reads and restoration.
- Voucher reads and intercompany operations.
- Company profile/logo operations, saved recipients, and accounting editor mounting.

The host no longer imports the underlying FRT domain API clients directly for these operations. Existing domain modules still own validation, server RPC contracts, persistence, and readback; the adapter only composes them with the existing AuthClient and DomainApi. Existing UI renderers and delegated host event handling remain in place.

### Current parity gaps

- General request-file attachment upload/download: PENDING. The recovered standalone RequestModal supports file upload/download, while the CRM-native request detail UI keeps general attachments separate. Receipt-level liquidation records remain a separate supported workflow.
- Purchase Order synchronization: PENDING. No verified native FRT-to-Order Intake write contract was established in this inventory.
- Genuine production request, voucher, accounting, bank-execution, and liquidation readback: PENDING because the live request, accounting-line, liquidation, and bank-execution tables contained no production rows at inspection. No synthetic financial records are permitted.
- Standalone FRT Admin screen: NOT REINTRODUCED. Existing CRM workspace/role behavior is preserved without a second role system.

### Post-cutover verification

- Focused FRT adapter and host-contract tests: 92 PASS, 0 FAIL.
- Complete frontend regression: 2,570 PASS, 0 FAIL.
- Ordered CSS bundle integrity: PASS (53 source stylesheets).
- Fund Tracker native Chromium acceptance: PASS.
- Production Vite build: PASS. Existing non-blocking warnings remain for the startup guard script tag and the large bundled entry/PDF chunks.
- Production deployment and signed production runtime: not yet verified for this branch.
