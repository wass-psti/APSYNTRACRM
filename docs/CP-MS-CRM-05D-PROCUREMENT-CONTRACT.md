# CP-MS-CRM-05D — Procurement workflow contract and integration boundary

## Evidence (2026-11-28, read-only production catalog)

Material Request Hub board: 617c4c0f-e343-4b3b-8456-50d47dcbaf99, Main group 21566a87-b287-4a61-b521-bb233956e09e. Existing certified pricing, immutable FX, lifecycle and import contracts remain authoritative.

Supplier PO Procurement (aa0d8acb-5f0e-4628-b0b4-76ef369b9f51): same workspace, active board, 346 active rows, 312 populated Supplier Name cells and 84 distinct raw name values. One populated legacy Material Sourcing reference, no exact current material UUID match. Existing source title is a record label, not an independently certified unique PO number. Contact board has 28 active rows all classified Customer; Contacts has 19 active rows with no demonstrated supplier classification. Order Intake registry has 909 legacy and 1 native client-order record. TradeLink sales quotations/vendor assets are not incoming procurement quotations.

RFQ Ref No is an ordinary text field (4 populated current materials). Vendor Details and Supplier PO No. are existing protected scalar fields; Supplier PO No. has no populated cells. No dedicated RFQ/received quote/selection/link contract was found in the live catalog or inspected source tree.

## Increment 05D.1: reference discovery

Use existing signed board shell and paginated reads; verify source board identity, active status, same workspace, complete read and expected columns. Existing source VIEW permission remains authoritative: Material Sourcing access does not implicitly confer another board's access. Display source record UUID, label, supplier name, supplier PO date, client PO reference and unverified legacy reference. Group only case/whitespace normalized names for search; never assert master supplier identity or infer a link. Archived source records are excluded. No amounts, generic board writes, persistence of source data in browser storage or source mutation. The source board remains authoritative. Explicit load, pagination of visible rows, clear route-owned content on close or replacement.

## Proposed next increment — durable RFQ and received quotations (not implemented or approved)

A new item-scoped persistence contract is needed; scalar RFQ/vendor/buying-price cells cannot represent multiple quotations or lifecycle history. Prepare a candidate outside auto-applied migrations, reconcile existing SQL dependencies and run disposable PostgreSQL regression before requesting production activation.

- Reuse canonical material UUID, workspace and Main group. Preserve original board title, field schemas, creation receipts and archive/restore; archival must retain procurement history and restoration must recover it.
- Store separate RFQ identities (multiple historical RFQs per material), explicit RFQ reference, dates and status. Preserve existing RFQ text; no implicit backfill or migration of legacy links.
- Store received quote identity and immutable revisions scoped to the RFQ. Store supplier display snapshot with optional verified existing supplier PO source UUID; allow manually entered supplier names without declaring master identity. No automatic contact conversion. Include quoted quantity, unit price, currency, separately stated shipping amount/currency and basis, lead time, validity date, supplier quotation reference and notes.
- Compare quoted terms explicitly; never compare mixed currencies as raw numbers. Only compare comparable quantity, tax basis, shipping basis and currency, or use the existing immutable FX contract with explicit provenance. Do not create a second pricing engine.
- Record selection as a deliberate action with quote revision and reason. No automatic overwrite of material buying price, supplier scalar or saved pricing versions; any later promotion of chosen terms must explicitly reuse the existing atomic material edit and pricing contracts.
- Store explicit supplier PO linkage to a verified active source board/item in the same workspace with existing source VIEW checks, and client PO reference to an authorized Order Intake registry identity where verified. No automatic PO issuance or external communications, no writes to Order Intake, existing Procurement boards, TradeLink or existing records.
- Use existing signed material VIEW for commercial read, existing material ADMIN plus board EDIT for commercial write, server scope validation, CAS revisions and stable operation identifiers. Preserve server authorization, validate source links under existing source-board permissions, audit with work_board_log without quote amounts or raw sensitive content. Do not grant direct private table access.
- Define exact RFQ and quotation state transitions and amendment semantics before writing candidate SQL. Include cancel/reopen decisions, selection invalidation after amendment, duplicate request replay, stale revision, concurrent selection, archived material, foreign scope, source revocation and rollback tests. Select only one current quotation per RFQ; keep all historical selections and revisions. No claim of atomic cross-module writes.
- Production activation requires explicit approval of exact reviewed SQL candidate and target. Frontend workflow must not activate ahead of server contract readiness. Verify signed fixture creation, two quotations, comparison, selection, link, reload, archive/restore history and no unintended pricing changes. No permanent cleanup without separate approval.

## Acceptance register (initiative)

1. Production source inventory.
2. Source ownership/schema reconciliation.
3. Native read-only reference integration.
4. Source lookup regression and browser fixture.
5. Main integration and authenticated reference lookup.
6. Durable RFQ/quotation contract and disposable regression.
7. Native quotation capture, comparison and selection.
8. Verified PO references and procurement history.
9. Approved production activation and authenticated workflow acceptance.
10. Final cross-feature regression and closeout.

Do not reopen 05A/05B/05C absent a demonstrated defect. This reference increment deliberately does not claim completion of 05D.
