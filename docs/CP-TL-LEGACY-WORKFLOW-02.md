# CP-TL-LEGACY-WORKFLOW-02 — Numbering, dates, quotation status and receivables aging

## Source parity

The original TradeLink implementation defines six document types and uses a per-type counter beginning at `11130`, with these number prefixes:

| Document type | Prefix | First number |
|---|---:|---:|
| Electronic Sales Invoice | `ESI-` | `ESI-011130` |
| Packing List | `PL-` | `PL-011130` |
| Delivery Receipt | `DR-` | `DR-011130` |
| Payment AR | `AR-` | `AR-011130` |
| Quotation | `Q-` | `Q-011130` |
| Purchase Order | `PO-` | `PO-011130` |

This starting value and prefix map are taken from the legacy application's document constants/counter implementation, not inferred from an example number.

## Implemented in this candidate

- New documents can use the additive server-assigned numbering RPC. The UI and client feature flag remain OFF until the migration is activated; while OFF, the existing editable-number form and original atomic save RPC remain in use so deploying the frontend alone cannot break production document creation.
- A private sequence table is keyed by board, workspace and document type. Sequence-row locking serializes concurrent allocations; existing numbered records are reconciled before each allocation so the counter cannot move backwards after a manual import.
- A per-document advisory transaction lock makes retries with the same stable document ID reuse the original number. The sequence increment and existing atomic TradeLink save execute in one transaction; a failed save rolls the allocation back.
- The signed client validates the returned number's type-specific prefix before it accepts the save receipt when automatic numbering is activated. Existing updates continue through the established compare-and-swap save RPC and retain their assigned number.
- Document date is now an actual persisted `date` field (new forms default to the local current date). Optional `dueDate` is persisted as an ISO calendar date; old documents without dates remain valid. The saved ESI print output already displays document date and due date.
- Quotation commercial status is exposed separately from approval/workflow state, using the legacy values: Working on it, Sent, Client Review, Accepted, Declined, On Hold and Closed.
- Analytics adds commercial quotation status aggregates, retains workflow outcome aggregates, and reports tax by currency/VAT treatment.
- Aging uses all active history, independent of an optional analytics reporting window. It includes approved ESI invoices with valid due dates, allocates only completed cash Payment AR amounts with an exact ESI document-number reference and matching currency, reports unmatched cash and excess payments separately, and keeps cheque amounts pending bank clearance. ESI invoices without due dates are counted as excluded. No FX conversion is inferred.
- The in-app User Manual describes the number/date/status behavior and the exact financial-reporting rules.

## Database and security contract

- The additive migration targets the existing TradeLink board/project only and is now recorded in the production migration ledger as version `20261116070000`.
- The public create RPC is `SECURITY INVOKER`; its private implementation is `SECURITY DEFINER` with an empty search path and the same owner as the existing private save function.
- Execute is granted only to `authenticated`; `anon` and `PUBLIC` remain denied. The private sequence table is not granted to client roles.
- Existing signed manager checks and the existing atomic save function remain authoritative. No client-supplied document number is trusted on create.
- The existing analytics RPC signature and signed manager/workspace boundary are preserved. `CREATE OR REPLACE` changes only its aggregate result shape and query logic.
- No roles, RLS policies, workspace permissions, Storage configuration, credentials, or production business records were changed by this migration.

## Verification evidence

- Focused TradeLink tests cover automatic numbering request/receipt, blank unassigned create numbers, date validation, due-date persistence, quotation commercial status, and analytics aging normalization/rendering.
- The migration was applied to an isolated temporary PostgreSQL 17 container using test-only stub dependencies before merge. A separate post-merge read-only inspection then observed the same migration recorded in the production Supabase ledger.
- Database fixtures verified first/next numbers, stable retry, invalid calendar-date rejection, exact cash allocation, unmatched cash, pending cheques, due-date exclusion, commercial quotation status and workflow outcome.
- Six concurrent quotation creates returned six distinct sequential numbers (`Q-011130` through `Q-011135`).
- Analytics aging was verified against all-history data even when the selected reporting window excluded the invoice/payment records.

## Post-merge production observation (2026-11-16)

- A read-only production inspection observed migration `20261116070000` recorded in `supabase_migrations.schema_migrations` with 17 statements, and the expected sequence table, create RPCs, analytics replacement and immutable-number trigger installed.
- Database logs record the DDL session at `2026-11-16T08:21:14Z` as database user `postgres`. The logged application name is empty, so the available evidence does not identify the initiating actor. This implementation session did not invoke a production migration command; the execution source remains unconfirmed.
- Post-merge read-only acceptance found zero sequence rows and three active TradeLink documents. Their existing document numbers and revisions were unchanged; no automatic number was issued.
- ACL verification: the public create wrapper is `SECURITY INVOKER` and executable by `authenticated` only; the private creator is `SECURITY DEFINER` with an empty search path and the same owner as the existing save function; the sequence table has no `anon`/`authenticated` privileges; the trigger function is not executable by either client role.
- `TL03_ANALYTICS_ENABLED=false` and `TL03_AUTOMATIC_NUMBERING_ENABLED=false` remain in the deployed frontend. The UI continues using the existing manual-number atomic save path and does not call the automatic-number RPC or analytics aggregate.
- GitHub Pages live-asset verification passed for the merged main commit. Genuine signed runtime create/retry, Board projection and All Documents reconciliation remain pending until the feature flags are deliberately enabled and signed runtime acceptance is completed.

## Remaining source parity
- The legacy Submitted intermediate lifecycle state remains unimplemented/disabled; this candidate does not widen workflow transitions.
- Dynamic QR verification and electronically issued PDF remain pending because there is no public verification endpoint or signed QR-token contract.
- Disaster Recovery Console remains pending until a defined backup source, restore contract and rehearsal path exist.
- Bank payment instructions and authoritative customer/supplier directory integration remain pending source/profile contracts.
