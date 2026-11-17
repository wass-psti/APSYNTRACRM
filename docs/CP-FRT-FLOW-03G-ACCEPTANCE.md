# CP-FRT-FLOW-03G — First Production-Shaped Request and Complete Lifecycle Acceptance

**Project:** APSYNTRA CRM
**Application:** Fund Release Tracker / Fund Released Tracker
**Repository:** wass-psti/APSYNTRACRM
**Supabase project:** jtlusodorfnyzgyuewkz
**Date:** 2026-11-17
**Status:** TECHNICAL ACCEPTANCE VERIFIED / GENUINE PRODUCTION TRANSACTION BLOCKED

## Baseline and scope

- Starting production branch: `main`
- Starting production commit: `f305ca8fb62a841f0dccc927d0fa49da9f86af87`
- Development branch: `feat/cp-frt-flow03g-20261117`
- Isolated worktree: `/Users/informationtechnology/.apsyntra-work/cp-frt-flow03g-20261117`
- Preserve the existing FRT request writer, monthly company DV sequence, accounting table/RPC, signed voucher projection, finance and GM actions, bank evidence, liquidation RPCs, and existing company profiles.
- No new production migration, new voucher subsystem, new counter, new role, permission, approval tier, or security redesign was introduced.
- No production financial record was created or modified.

## Implementation and acceptance work

1. Reconfirmed the live Supabase project is `ACTIVE_HEALTHY` (PostgreSQL 17.6.1).
2. Re-read the three existing company profiles. WAO and WASS remain populated; PSTI remains unchanged pending legal-entity confirmation.
3. Re-read production financial tables. All seven counts remain zero: requests, request items, accounting lines, voucher counters, bank executions, liquidations, and liquidation items.
4. Inspected the existing request wizard, `frt_create_request`, `frt_request_action`, accounting save/readback, bank execution, liquidation submission/review, and voucher/PDF code paths.
5. Corrected the isolated Chromium request-wizard acceptance fixture to provide its required request date. The application already supplies this value; no product behavior was changed.
6. Added a disposable PostgreSQL 17 lifecycle acceptance script using the source-aligned FRT fixture and the existing monthly voucher, WF-02 liquidation, WF-03 bank execution, and WF-04 aging migrations.

## Verification evidence

- `npm ci`: PASS; 123 packages added; 124 audited; 0 vulnerabilities.
- Focused request wizard, draft, accounting, bank execution, liquidation, and voucher tests: **42/42 PASS**.
- Full frontend regression: **2,598/2,598 PASS**.
- Request wizard Chromium acceptance: PASS; three steps, multi-expense entry, required validation, back navigation, submit payload, 610px desktop dialog, and single-column 390px mobile layout.
- Voucher Chromium acceptance: PASS; seven-page A4 PDF, PDF 1.3, 64,159 bytes, exact-cent debit/credit balance, preview Blob, download, print, reprint, zero browser page errors.
- `scripts/cp-frt-flow03b-disposable-acceptance.sh`: PASS.
- `scripts/cp-frt-flow03c-disposable-acceptance.sh`: PASS, including concurrent accounting revision serialization.
- New `scripts/cp-frt-flow03g-disposable-lifecycle-acceptance.sh`: PASS on disposable PostgreSQL 17.
- The combined disposable workflow additionally passed CP-FRT-WF-02 multi-receipt liquidation, CP-FRT-WF-03 bank execution, and CP-FRT-WF-04 signed aging acceptance.
- Production Vite build: PASS. Existing non-fatal startup-guard classic-script and large-chunk warnings remain.
- All disposable SQL acceptance records are rolled back; the PostgreSQL container is removed by the script cleanup trap.

## Complete disposable lifecycle result

The new rollback-only test exercises the current monthly DV creation contract and the established lifecycle in sequence:

1. Create a WASS request through the existing `frt_create_request` RPC.
2. Verify monthly DV number `DV-WASS-202611-001` and two persisted expense items totaling ₱150.50.
3. Record Finance approval.
4. Record General Manager verification and its reference.
5. Record a disposable staff-attested bank execution event and verify the 72-hour deadline.
6. Submit two receipt items totaling exactly ₱150.50.
7. Read back a balanced liquidation with both receipt records.
8. Record liquidation approval and reviewer provenance.
9. Close the request.
10. Verify the original DV number is unchanged and all seven audit events exist exactly once.

This is isolated acceptance evidence only. The disposable bank reference is not a real payment and is not represented as a bank-confirmed transfer.

## Production boundary and classification

- **VERIFIED:** Existing application request wizard; signed request creation contract in tests; monthly DV numbering; exact expense persistence; accounting persistence/concurrency; voucher projection and A4 PDF behavior; finance/GM/bank/liquidation workflow functions in disposable PostgreSQL; receipt readback; final close; seven audit events; build and full frontend regression.
- **IMPLEMENTED-UNVERIFIED:** Complete workflow against an actual signed production request and the real-user production voucher PDF.
- **BLOCKED:** First genuine production request and its live voucher/accounting/finance/GM/bank/liquidation closeout. Current production contains zero fund requests and no real request-specific business details were supplied in the project, prior conversations, or connected email search.
- **PENDING:** A real request with a real company, requester, purpose, department, fund source, date needed, payee, destination account, expense categories and amounts. Bank execution and liquidation evidence must only be recorded after those events actually occur.
- **PENDING:** PSTI legal-entity confirmation if PSTI is selected. WAO and WASS profile records are already populated.
- **NOT APPLICABLE:** New voucher subsystem, additional accounting subsystem, new approval hierarchy, or unrelated access/security changes.

The production database was only queried. No production request, expense item, voucher number, accounting entry, approval, bank execution, liquidation, receipt, or audit event was inserted or changed during CP-FRT-FLOW-03G.

## Next action

Enter one legitimate business request through the existing production Fund Tracker **New Fund Request** wizard using actual business details. Do not send destination account numbers in chat; enter them directly in the signed application. Once the request has been saved, use its generated DV number to resume live signed readback, accounting persistence, voucher/PDF, finance approval, GM verification, actual bank execution evidence, liquidation, approval, and closeout.

Do not manufacture production data to bypass this dependency.
