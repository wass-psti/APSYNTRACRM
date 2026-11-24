# CP-OI-NATIVE-01 — Order Intake data foundation

## Baseline
Fetched origin/main at 4e6b3374 on 2026-11-24. The canonical existing Order Intake board is d045708b-6e36-4f0a-92fc-f0b8baf93de3. The CRM ownership manifest currently classifies it as a generic board. The domain records are public.order_intake_orders and public.order_intake_activity. Existing global search reads order_intake_orders through the signed transport.

## Implementation
- Native adapter uses existing signed Auth and DomainApi, paginated read, idempotent creation, revision-aware update/status/archive/restore. No new RPC, table, role, permission, service, or dependency.
- Financial preview uses integer minor units and the existing SQL VAT-inclusive formula. Database readback remains authoritative. Currency totals remain separate.
- Workflow preserves the exact stored status, including Collected, Working on it, and previously unknown values. It does not silently merge stages or drop records.
- Projection is valid only for a complete consistent collection. The future UI must distinguish complete totals from partial pages; paging during concurrent writes is not snapshot isolation.

## Source reconciliation
The provided legacy blueprint and screenshots are requirements references, not proof of current CRM runtime. Their total counts, profit displays, and status groupings differ. The current SQL supports PHP/USD/EUR, requires client name and delivery date, and defines 14 status options. The source describes additional currencies, optional/legacy missing fields, confirmations, notifications, bulk actions, and traceability. These must be reconciled against real contracts instead of inventing data or silently changing existing validation. No production data has been modified.

## Next milestone
CP-OI-NATIVE-02 — native host route and read surface. Reuse existing workspace ownership and session lifecycle; expose Dashboard, Workflow, Search, All Orders. Validate data availability and board/domain linkage with signed read-only browser evidence before changing ordinary board shortcuts. Use the domain adapter; show explicit empty/loading/error states and per-currency totals. Do not represent partial pages as entire fiscal-year totals. Subsequent milestones will connect editing, status persistence, bulk operations and confirmations to verified contracts, with no new authority rules.

This foundation does not activate a production route or establish signed runtime acceptance.
