# CP-FRT-IC-01B — Source-Backed Persistence Acceptance

## Implementation
Obligation creation and settlement recording now demand an independent, signed frt_ic_snapshot read-back after the mutation receipt. The same verified session and workspace must still be active.

Creation verifies recorded ID, reference, amount, type, creditor, debtor, issue date, and maturity date. Settlement verifies the saved obligation outstanding balance against the server receipt. Both use the existing roster-validated and bilateral-consistent snapshot projector.

If a write was acknowledged but a follow-up read fails or disagrees, the UI reports uncertain persistence and tells the operator to refresh and inspect the original reference. No write is automatically repeated. Existing role scope, private RPCs, database tables, audit behavior, RLS, and other FRT features are unchanged.

## Genuine production acceptance prerequisites
1. Finance-approved source document showing an actual intercompany creditor, debtor, unique reference, principal, issue date, and maturity for loans.
2. An existing authorized FRT finance role records the obligation using the deployed entry form.
3. Verify independent read-back, reload/reopen, both matrix sides, maturity classification, and audit events.
4. Only after a real payment documented as settled, record the settlement and verify its persisted balance and audit event after reopening.

## Verified evidence
- Full frontend regression: 2,085 passed, zero failures.
- Signed current production session: GENERAL_MANAGER; the three-company RPC returned valid reciprocal matrices and the projector accepted the response.
- An unavailable OPEX panel was recovered by reselecting OPEX; the signed backend service itself was available.
- Local focused tests verify read-back failures and stale settlement responses never automatically repeat a mutation.
- Initial production ledger inventory: zero obligations, zero settlements, zero intercompany audit events.

## Pending
Source-backed genuine production obligation and settlement round-trip. No authentic source document or settlement evidence was found in the accessible records. No financial records were fabricated or changed for acceptance.

Do not claim that signed empty-ledger reads or disposable PostgreSQL tests constitute genuine financial persistence acceptance.
