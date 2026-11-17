# CP-FRT-FLOW-03H-RESUME-02B — First Genuine WAO Production Request, Authoritative DV Issuance, and Actual Accounting Persistence

**Project:** APSYNTRA CRM
**Application:** Fund Release Tracker / Fund Tracker
**Repository:** wass-psti/APSYNTRACRM
**Production branch:** main
**Production baseline:** `04f0f1948d791fda2df57a7b758b6ddd87400ca1`
**Existing Supabase project:** jtlusodorfnyzgyuewkz
**Date:** 2026-11-17
**Status:** TECHNICAL READINESS VERIFIED / FIRST GENUINE PRODUCTION TRANSACTION BLOCKED

## Objective

Use the existing deployed WAO Fund Tracker to capture the first genuine business request, verify the production DV allocation and request/expense readback, and persist the actual double-entry accounting lines.

Do not manufacture a production request, payee, amount, account mapping, bank event, receipt, or audit trail. Preserve the existing request RPC, atomic monthly voucher allocator, duplicate guard, accounting RPC, voucher renderer, and workflow. No new authority layer, approval tier, parallel accounting subsystem, or unrelated security redesign is in scope.

## Production runtime

Read-only inspection of the deployed application confirmed:

- URL: `https://wass-psti.github.io/APSYNTRACRM/#/fund-tracker`
- Current company: **WAO — Watchdog Automation OPC**.
- Session context: `GENERAL_MANAGER`.
- Signed financial data: connected.
- Realtime state: `Live synced`.
- The existing **New Fund Request** action is available.
- The WAO request table displays no requests.

## Authoritative production inventory

Read-only Supabase queries against project `jtlusodorfnyzgyuewkz` returned:

| Table | Production rows |
|---|---:|
| `frt_requests` | 0 |
| `frt_request_items` | 0 |
| `frt_request_accounting_lines` | 0 |
| `frt_voucher_counters` | 0 |
| `frt_bank_executions` | 0 |
| `frt_liquidations` | 0 |
| `frt_liquidation_items` | 0 |

The request table has no genuine production request to use for DV or accounting readback. No previous user-supplied genuine WAO request, supplier invoice/quotation, or supporting transaction document was found in available prior context, connected email, or files. Illustrative/test amounts are not production evidence.

## Existing request and atomic DV implementation

The deployed `public.frt_create_request(uuid,jsonb)` definition was inspected without invoking it.

The existing function:

1. Validates the supplied company, request dates, title, department, fund source, description, beneficiary and destination account, and 1–100 positive expense lines.
2. Computes the request total from the submitted expense lines.
3. Acquires a transaction-scoped advisory lock for the workspace/company/payee/amount duplicate key.
4. Applies the existing ten-minute duplicate check.
5. Atomically increments the company/year/month row in `frt_voucher_counters`.
6. Inserts the request and its expense items using the same database transaction.
7. Writes the `REQUEST_CREATED` audit event in that transaction.
8. Returns the persisted request, including its allocated voucher number.

This existing transaction boundary is the authoritative production DV allocator. It was not changed or invoked against production during this milestone.

## Existing double-entry accounting implementation

The deployed `public.frt_save_request_accounting_lines(uuid,uuid,bigint,jsonb)` definition was inspected read-only.

The existing function:

- Locks the request row before saving.
- Enforces the expected accounting revision.
- Accepts 2–100 lines.
- Uses integer cents for debit and credit input.
- Requires each line to contain a positive debit or a positive credit, not both.
- Requires total debit = total credit = the exact request total.
- Replaces the prior revision's lines atomically.
- Persists the next revision and `ACCOUNTING_LINES_SAVED` audit event.
- Returns the authoritative accounting snapshot.

The frontend verifies the server-returned revision and balanced snapshot before reporting a successful save. Account codes, account names, classifications, and amounts are manual inputs; no chart-of-accounts mapping or real transaction classification was inferred or fabricated.

## Actual business data still required

The existing request wizard requires genuine values for:

- Request name/title and expense purpose/description.
- Department.
- Fund source account.
- Request date and date needed.
- Actual payee/supplier name.
- Actual expense categories and exact amounts.
- Destination account/GCash number and, if applicable, bank.
- Optional check number and order/project reference where applicable.

The destination bank/account information should be entered directly in the production application, not sent in chat. Accounting account codes/names and debit/credit treatment must reflect the actual transaction and approved accounting records; they must not be guessed.

## Verification results on current main

Baseline: `04f0f1948d791fda2df57a7b758b6ddd87400ca1`.

- Full frontend regression: **2,616/2,616 PASS**.
- Focused FRT tests: **287/287 PASS**.
- Production build: **PASS**. The existing large-chunk warning remains non-fatal.
- Request wizard Chromium acceptance: **PASS** — three steps, required validation, two expense rows, back navigation, final payload, desktop bounds and responsive mobile layout.
- Voucher Chromium acceptance: **PASS** — seven-page A4 PDF, two expense rows, two accounting rows, exact-cent balance, accounting editor save, PDF preview/download, print/reprint, CSS loaded, zero page errors.
- Disposable PostgreSQL lifecycle acceptance: **PASS** — atomic test DV allocation, request/expense persistence, Finance approval, GM verification, bank evidence, two-receipt liquidation, approval, closure, and seven audit events. The test transaction was rolled back.
- Signed production Fund Tracker runtime: **LIVE SYNCED** with WAO selected and zero request records.

The disposable DV and accounting fixtures are test evidence only. They are not production transactions and are not presented as such.

## Acceptance classification

- **VERIFIED:** Current production WAO runtime and live-sync state; empty signed production inventory; existing atomic request/DV allocator definition; existing accounting revision, cent-balance, persistence and readback definition; full frontend/FRT regression; production build; request wizard browser behavior; voucher PDF/print/reprint browser behavior; disposable lifecycle with rollback.
- **IMPLEMENTED-UNVERIFIED:** Atomic DV allocation and request/expense persistence for the first genuine production submission; actual request-scoped accounting persistence and readback.
- **BLOCKED:** Genuine WAO request submission because no actual business request details or supporting transaction document are available.
- **PENDING:** Production request ID and DV; signed request/expense readback; real accounting lines; genuine voucher; Finance/GM transitions; bank execution evidence; receipt/liquidation reconciliation; financial closure.
- **NOT APPLICABLE:** New migration, new voucher allocator, parallel ledger, synthetic production transaction, additional approval tier, or unrelated authorization changes.

## Production integrity

No production write, RPC invocation that creates or mutates a financial record, DV allocation, accounting save, bank execution, liquidation, receipt, audit event, migration, or deployment was performed. Production inventory queries were read-only. No company profile was changed.

## Next action

Submit one genuine WAO business request through the existing production **New Fund Request** action using actual source documents and transaction details. Enter destination account information directly in the form. Once submitted, use the generated DV number to resume signed production readback and actual accounting persistence. Continue the existing voucher and financial workflow only from that authoritative request.

The next gate is the real business transaction data. There is no software or authority-control change needed to clear this blocker.
