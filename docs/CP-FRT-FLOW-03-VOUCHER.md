# CP-FRT-FLOW-03 — Disbursement Voucher Preview, PDF, Accounting Breakdown, and Reprint

## Implementation

- Added a nested voucher projection to the existing signed frt_restricted_request_detail(uuid, uuid) RPC.
- Preserved its existing signature, private.frt_current_role membership check, SECURITY DEFINER/search-path behavior, workflow response, and existing EXECUTE grants.
- Reused frt_bank_execution_snapshot for recorded bank details.
- The projection returns only voucher-relevant request fields, persisted expense lines, company code/name, preparation display name, finance approver display name, GM verifier display name, approval timestamps, GM reference, and request totals.
- Does not return the recipient account number, member email addresses, comments, attachments, or the broad legacy frt_get_request payload.
- Uses request created_at as voucher date because the existing FRT schema has no separate voucher-date field.
- Uses existing request number, company, payee, bank, department, fund source, request description, order/check reference, and expense line data.
- Expense lines are grouped by persisted category with exact-cent subtotals and a grand total.
- Reconciliation is checked against the persisted request total. A mismatch prevents PDF output.
- Added real A4 PDF output using pdfmake 0.3.14 with embedded Roboto fonts, repeating company/voucher headers, repeated expense table headers, page numbering, multi-page flow, peso formatting, approval records, and bank execution evidence.
- Added PDF preview, download, print, and reprint actions in the existing request details interface.
- Reprint performs a fresh signed read of the existing request detail and bank snapshot, then generates a fresh PDF while requiring the original voucher number to remain unchanged.
- Added responsive voucher preview styling and focused unit/browser acceptance tests.

## Existing contracts preserved

- frt_create_request and the existing sequential DV-[COMPANY]-[YYYYMM]-[SEQ] numbering are unchanged.
- frt_restricted_request_detail(uuid, uuid) retains its existing signature, authorization behavior, workflow fields, and EXECUTE grants. The only database change is an additive nested voucher field.
- frt_bank_execution_snapshot(uuid, uuid) is reused unchanged.
- No new RPC, table, voucher counter, storage bucket, role, permission grant, RLS policy, approval stage, or authentication framework.
- No generated PDF is persisted as a second source of truth. A reprint is regenerated from the persisted request and expense records.
- No production request, expense, approval, bank execution, or liquidation record was created or changed.

## Existing data limitations

- frt_companies currently stores company code and name only. The FRT schema has no authoritative company address, logo, phone, or email fields. The voucher therefore shows the persisted legal entity name/code and clearly identifies the missing profile details; it does not borrow or infer TradeLink profiles.
- No FRT chart-of-accounts mapping exists. The document shows the persisted expense categories and descriptions, category subtotals, and reconciled grand total. It does not invent account codes or debit/credit classifications.
- The existing request schema stores created_at but no separate voucher date. The document labels the request creation timestamp as the voucher date.
- The current production FRT companies have zero requests and zero expense lines. Live signed voucher retrieval and real-user reprint acceptance therefore remain pending until an actual request exists.

## Verification

- Focused voucher tests cover signed read-contract usage, identity and company matching, existing voucher number preservation, total reconciliation, HTML escaping, PHP formatting, category subtotals, A4 PDF definition, multi-page PDF generation, and existing workflow/bank contracts.
- Full frontend regression, production build, browser PDF output, and GitHub CI are run as part of CP-FRT-FLOW-03 acceptance.
