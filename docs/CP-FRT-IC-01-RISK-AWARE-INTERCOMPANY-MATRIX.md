# CP-FRT-IC-01 — Risk-Aware Intercompany Matrix

## Scope

Activates the Risk-Aware Intercompany (IC) Matrix inside the existing Fund Released Tracker OPEX Analytics view. The feature covers bilateral receivable/payable exposure, entity net positions, intercompany loan maturity analysis, risk indicators, source-led obligation creation, and partial/full settlement recording.

The feature uses the existing APSYNTRA CRM frontend, Supabase project, FRT workspace/company roster, signed FRT role resolver, and FRT audit log. It does not replace or modify existing request approval, liquidation, transfer, archive, or company-selection workflows.

## Source-of-truth discovery

The production schema inventory found no existing intercompany loan, receivable, payable, maturity, or bilateral exposure ledger. Existing FRT request/liquidation records are not a reliable substitute for intercompany obligations.

No historical balances are inferred or imported. The matrix starts at zero until a finance user records actual opening obligations from verified source documents.

## Ledger model

### public.frt_ic_obligations

One immutable source record per bilateral obligation:

- Workspace, creditor company, debtor company
- RECEIVABLE or LOAN
- Unique workspace reference
- Description and principal amount (PHP)
- Issue date and optional due date
- Loan entries require a maturity date
- Creator and creation timestamp

Each record contributes the same outstanding amount to the creditor's receivables and the debtor's payables.

### public.frt_ic_settlements

Append-only settlement events linked to an obligation:

- Positive amount, settlement date, unique reference, optional notes
- Parent obligation row is locked during settlement calculation
- The transaction rejects amounts greater than the current outstanding balance
- Partial and full settlements update both matrix sides from the same source

The tables have RLS enabled and no direct anon or authenticated table grants. Public PostgREST RPC wrappers execute as SECURITY INVOKER and delegate to narrowly scoped, non-exposed private implementations that validate auth.uid() and existing FRT membership/roles.

## RPC contracts

- frt_ic_snapshot(uuid) — signed workspace-scoped read projection for all FRT companies in the active workspace.
- frt_ic_create_obligation(uuid,jsonb) — creates a validated bilateral receivable or loan.
- frt_ic_record_settlement(uuid,uuid,jsonb) — atomically records a partial/full settlement and verifies the remaining balance.

The read RPC uses the existing private.frt_current_role resolver. Write RPCs reuse the existing FRT mutation roles: GENERAL_MANAGER, FINANCE_MANAGER, and FINANCE_APPROVER. No new roles, role assignments, bootstrap identities, or CRM administrator privileges are introduced.

Every create/settlement operation adds an event to the existing FRT audit log in the same database transaction.

## Analytics

- Receivables matrix: creditor company by debtor company
- Payables matrix: debtor company by creditor company (the reciprocal of the same ledger)
- Entity net position: receivables minus payables
- Active loan balance and count
- Days outstanding and days to maturity
- Overdue obligations: due date before the snapshot date
- Due-soon obligations: maturity from today through the next 30 days
- High-exposure pairs: outstanding bilateral exposure at or above ₱500,000 (the threshold shown in the supplied Monday reference)

The dashboard reports internal balance because each obligation generates both sides from one source record. It explicitly does not claim that the counterparty has independently confirmed its books. No reconciled or external confirmation status is inferred.

## Frontend integration

- Extends the existing OPEX Analytics view with entity totals, both matrices, loan maturity table, obligations/settlements list, risk indicators, and disclosure.
- Uses the existing company roster; matrix covers the workspace's FRT companies regardless of the selected company tab.
- Adds finance-role controls to record a source-backed obligation and record settlement.
- Loads the intercompany snapshot only when OPEX Analytics is selected, avoiding extra finance RPCs in the Fund Tracker and Executive Dashboard views.
- Reloads the signed snapshot after each acknowledged write.
- Existing REQUESTOR membership retains read access but does not gain ledger mutation capability.
- The existing FRT UI remains usable if the new snapshot RPC is temporarily unavailable.

## Integrity and security boundaries

- No direct client table access.
- No service-role or secret key in the frontend.
- No changes to existing RLS policies or CRM roles.
- Workspace and company IDs are validated server-side.
- References are unique per workspace to prevent duplicate entry.
- Amounts use decimal numeric types; no floating-point money arithmetic.
- Settlements lock the parent obligation row to prevent concurrent over-settlement.
- Audit event and ledger write are atomic.
- No bank transfer, approval, or external payment is initiated by a ledger write.
- No existing FRT request, liquidation, recipient, or payment record is altered.

## Verification

### Disposable PostgreSQL 17

- Existing SEC06/SEC10/SEC11/SEC14 FRT setup and regression scripts: PASS
- CP-FRT-IC-01 migration: PASS
- Empty ledger snapshot and 3-company matrices: PASS
- Bilateral WAO→WASS loan and PSTI→WAO receivable fixture: PASS
- Entity net positions and reciprocal matrices: PASS
- Overdue/maturity and ₱500,000 exposure threshold: PASS
- Partial settlement updates both sides: PASS
- Over-settlement denial: PASS
- Duplicate workspace reference denial: PASS
- Existing General Manager write parity: PASS
- Existing REQUESTOR read preserved / write denied: PASS
- Foreign workspace, nonmember and unsigned read denials: PASS
- Table grants, RLS and RPC execute grants: PASS
- Audit events and unchanged existing FRT request/liquidation fixtures: PASS
- Test transaction rolled back: PASS

### Frontend

- Signed snapshot schema validation and company-roster binding
- Reciprocal matrix parity validation
- Entity net-position arithmetic validation
- Invalid date, cross-workspace, and malformed payload denial
- Finance-role create/settlement client checks and post-write session recheck
- Responsive OPEX IC dashboard and read-only REQUESTOR presentation

## Explicitly outside this milestone

- Independent counterparty confirmation or two-party reconciliation.
- Interest accrual, FX conversion, bank integration, or automatic transfers.
- Importing historical/opening balances without verified source documents.
- Editing/voiding an obligation or reversing a settlement.
- External statement matching or reconciliation file ingestion.

These require their own source contracts and workflow decisions. The present implementation does not label internal single-ledger balance as external reconciliation.

## Release state

Implementation and disposable acceptance are complete. Production migration activation, GitHub merge/deployment, and live signed-user create/settlement acceptance remain pending until the release sequence is completed.
