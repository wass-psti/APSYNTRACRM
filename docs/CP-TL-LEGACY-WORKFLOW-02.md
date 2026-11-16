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

- The candidate migration is additive and targets the existing TradeLink board/project only.
- The public create RPC is `SECURITY INVOKER`; its private implementation is `SECURITY DEFINER` with an empty search path and the same owner as the existing private save function.
- Execute is granted only to `authenticated`; `anon` and `PUBLIC` remain denied. The private sequence table is not granted to client roles.
- Existing signed manager checks and the existing atomic save function remain authoritative. No client-supplied document number is trusted on create.
- The existing analytics RPC signature and signed manager/workspace boundary are preserved. `CREATE OR REPLACE` changes only its aggregate result shape and query logic.
- No roles, RLS policies, workspace permissions, Storage configuration, credentials, or production records are changed by this candidate.

## Verification evidence

- Focused TradeLink tests cover automatic numbering request/receipt, blank unassigned create numbers, date validation, due-date persistence, quotation commercial status, and analytics aging normalization/rendering.
- The migration was applied to an isolated temporary PostgreSQL 17 container using test-only stub dependencies; it was not applied to the production Supabase project.
- Database fixtures verified first/next numbers, stable retry, invalid calendar-date rejection, exact cash allocation, unmatched cash, pending cheques, due-date exclusion, commercial quotation status and workflow outcome.
- Six concurrent quotation creates returned six distinct sequential numbers (`Q-011130` through `Q-011135`).
- Analytics aging was verified against all-history data even when the selected reporting window excluded the invoice/payment records.

## Not activated / remaining source parity

- The new migration is a candidate and has not been applied to production. `TL03_ANALYTICS_ENABLED` remains `false`; the frontend create RPC is prepared but production cannot create documents with automatic numbers until the migration is installed.
- Genuine signed runtime create/retry, Board projection and All Documents reconciliation remain pending after controlled migration activation.
- The legacy Submitted intermediate lifecycle state remains unimplemented/disabled; this candidate does not widen workflow transitions.
- Dynamic QR verification and electronically issued PDF remain pending because there is no public verification endpoint or signed QR-token contract.
- Disaster Recovery Console remains pending until a defined backup source, restore contract and rehearsal path exist.
- Bank payment instructions and authoritative customer/supplier directory integration remain pending source/profile contracts.
