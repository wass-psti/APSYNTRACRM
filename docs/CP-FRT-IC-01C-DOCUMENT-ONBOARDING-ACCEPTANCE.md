# CP-FRT-IC-01C — Source-document onboarding and final finance acceptance

## Authoritative production preflight — 2026-11-13
- Existing WatchdogWorkspace Supabase project and signed FRT finance module inspected.
- Production intercompany obligations: 0; settlements: 0; FRT IC audit events: 0.
- No verified source agreement, real opening receivable or loan, or actual settlement proof was present in the accessible workspace files or local filename inventory.
- No production financial transaction was attempted. This cannot be labeled a genuine write/reopen/settlement PASS.

## Implemented frontend continuation
On a transient unavailable or invalid-contract state, the OPEX Risk-Aware IC Matrix displays an explicit **Retry signed ledger read** action. It calls the existing signed `loadFRTFinance` read path only, preserves current company and workspace context, and never creates an obligation or retries a mutation. The button is hidden when the snapshot is valid.

## Genuine onboarding prerequisites
1. The document is authentic, available to authorized finance staff, and identifies the creditor, debtor, document reference, issue date, amount, and (for loans) maturity date.
2. The responsible authorized finance user verifies it outside the application. The existing ledger's reference and description fields describe the source; the ledger does **not** store document attachments and should not be advertised as doing so.
3. The finance user creates exactly one obligation from the document through the signed FRT form; the system verifies the independent signed post-save snapshot, both matrix sides, and the matching audit event.
4. Reload/reopen the same signed workspace and verify the reference, principal, outstanding amount, counterparty, and maturity classification.
5. Only when actual independently documented settlement has occurred, record its real reference, date, and amount. Verify independent read-back, residual balance, audit history, and two-sided reconciliation after a fresh reopen.
6. Do not fabricate production records or mark internally balanced as counterparty-confirmed reconciliation.

## Acceptance classifications
- Signed three-company read and reciprocal empty matrix: VERIFIED in CP-FRT-IC-01B.
- Client signed create/settlement readback and denial tests: VERIFIED in CP-FRT-IC-01B.
- Explicit read-only retry affordance: IMPLEMENTED, local regression VERIFIED.
- Genuine production document-led entry: PENDING, no source document.
- Genuine settlement round-trip: PENDING, no documented settlement.

## Security and scope
No additional authority, restrictions, schema change, policy/grant, background service, role assignment, or automatic transaction retry was introduced.
