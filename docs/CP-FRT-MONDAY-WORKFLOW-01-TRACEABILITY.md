# CP-FRT-MONDAY-WORKFLOW-01 — Source Workflow Reconciliation and Signed Lifecycle Guide

Date: 2026-11-13. Repository: wass-psti/APSYNTRACRM.

## Reference and integration authority

Source: user-supplied November 13 Monday.com Fund Release Tracker functionality flow, Board 18397563989. The source's own "VERIFIED" labels describe the Monday.com application, **not** independent verification of those features in APSYNTRA CRM. Its React components, @api/monday-storage, BoardSDK, board IDs, file columns, and runtime storage keys are **not** copied into APSYNTRA CRM.

APSYNTRA remains the authoritative signed Supabase FRT service. Preserve existing workspace, company, RBAC, request status, optimistic writes, voucher sequence, and audit records.

## Confirmed parity inventory

| Capability in source | Current APSYNTRA evidence | Disposition |
| --- | --- | --- |
| WASS/WAO/PSTI company selector | Signed frt_bootstrap + company-restricted safe lists | Implemented, no change |
| Fund Request multi-item wizard | Existing three-step signed frt-request-wizard, frt_create_request; saved recipient/QR service exists | Implemented; not the source's two-step layout |
| Request workflow | frt_request_action signed role/lifecycle enforcement; finance approval, rejection, GM verification, revocation, close, archive, liquidation approval | Existing contract maintained |
| Vouchers | Atomic frt_voucher_counters per company/year and unique voucher constraint; creation allocates DV-CO-YYYY-NNN | **Different from Monday:** source has approval-time DV-CO-YYYYMM-NNN. Not changed |
| Creation state | Existing request defaults PENDING_APPROVAL | **Different from Monday:** source begins Working on it |
| Detail / request timeline | Existing restricted request detail; new verified-state UI timeline | Implemented in this milestone |
| Financial analytics | Signed company aggregations, top category and 6-month data | Implemented; no inferred budgets |
| Intercompany balance | Source-backed bilateral frt_ic obligations/settlements | Implemented separately; not derived from text posts |
| Liquidation | Existing frt_liquidations and backend submit/approval contract | Full multi-receipt signed UI and payment reconciliation still require integration |
| Three-day post-disbursement timer | Current restricted detail lacks independently confirmed bank disbursement time; GM verification is not transfer proof | Deferred; no fabricated deadline |
| Duplicate payee/amount 10-minute detection | No signed, workspace-scoped duplicate lookup found in current frontend | Pending an authoritative server-side privacy-safe contract |
| Draft auto-save 24 hours | No signed draft persistence contract verified | Pending; never store sensitive bank data in unprotected local storage |
| Balanced editable DV + printable BIR form | Current voucher number exists; no verified end-to-end DV line-ledger editor/export in FRT UI | Pending; do not claim statutory BIR compliance without review |
| Notifications and comments | Current FRT UI explicitly reports discussion and activity unavailable from restricted endpoints | Pending narrow signed activity/notification contracts |
| Archive storage | State exists in backend, but read/list/restore are not enabled by safe UI | Pending |
| PO synchronization | User-supplied Monday Board 3670228015 and hardcoded numeric column are not APSYNTRA contracts | Pending mapping to authorized Order Intake, idempotent writes, failure isolation |
| QR / attachments | Existing saved-recipient private QR flow | Preserve, extend only via authorized verified storage contracts |
| Batch approvals and expense export | Disabled in current FRT view | Pending audited batch operations and scoped exports |

## Implemented change

- Added one pure, fail-closed workflow-stage projector for already-validated restricted FRT details.
- Five steps: request registered, finance approval, GM verification, liquidation, close.
- Shows rejected, blocked, returned, submitted and under-review states without suggesting unauthorized actions.
- Updated request detail and in-app User Manual with accurate current APSYNTRA lifecycle and explicit reference differences.
- Never equates GM verification with actual transfer; never fabricates a three-day countdown.
- Keeps the existing financial action candidates and signed server authorization exactly as they are.

## Release safety and acceptance

No new public RPCs, SQL migrations, RLS, grants, users, roles, workspace rights, financial writes, bank instructions, automations, telemetry, or background processes. Current backend financial and audit data unchanged.

Acceptance: unit tests for projection truthfulness and invalid data, FRT detail regression, full frontend suite, source graph, CSS bundle and GitHub Checks. Signed production browsing may verify the manual; genuine financial request timeline requires a real authorized request, deferred until soft launch.

## Next solid implementation

**CP-FRT-WF-02 — Signed Liquidation Breakdown, Source Documents, and Operational Deadline Contract.** Begin by verifying authoritative release/disbursement evidence. Build a bounded, signed liquidation submission/readback with receipt breakdown and server-side guards using existing FRT tables/RPCs; never invent a bank release time. Next follow-on slices can add duplicate detection/draft recovery, signed DV output, archive/audit retrieval, and Order Intake synchronization once their contracts are verified.
