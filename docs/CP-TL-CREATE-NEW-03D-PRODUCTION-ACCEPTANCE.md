# CP-TL-CREATE-NEW-03D — Six-module signed production acceptance

**Date:** 2026-11-20 (Asia/Manila)  
**Outcome:** VERIFIED — six production QA Draft records, six canonical Board items, six revision-two records, twelve audit events.  
**Baseline:** `aca6414b`, signed TradeLink User with existing workspace and native module access.  
**Scope:** functionality and acceptance only. No permissions, roles, RLS policies, migrations, credentials, or production accounting workflow changes.

## Root causes and recovery

1. The original multi-module browser harness assumed that the native draft form was ready as soon as the DOM form existed. During asynchronous context/route settlement, its inputs could be reset and Save could fail to dispatch a create RPC. The focused single-module harness waits for the route to settle and confirms the QA marker and browser form validity immediately before each write.
2. The original QA runner expected `documentNumber` in the `tl03_document_save` update receipt, but update receipts may omit it. The acceptance runner retains the verified document's immutable number and checks it again after signed readback and reload, without replaying an already successful update.
3. The PO test selected the first existing account for both `verifiedBy` and `approvedBy`, which the authoritative dual-review transaction correctly denied (HTTP 400). The final QA payload uses two **distinct, already assigned eligible TradeLink accounts**. Existing reviewer enforcement remains unchanged.

## Production readback and browser evidence

All six records have the explicitly labeled `CP-TL-CREATE-NEW-02C QA ONLY` marker. Each was created through the existing signed native TradeLink form and subsequently updated once through its own previously verified document ID. No approval, submission, dispatch, settlement, or real financial transfer was performed.

| Module           | Server-assigned number | Signed state | Revision | Board item | Audit events |
| ---------------- | ---------------------- | ------------ | -------: | ---------- | -----------: |
| Electronic SI    | ESI-011130             | Draft        |        2 | Verified   |            2 |
| Quotation        | Q-011131               | Draft        |        2 | Verified   |            2 |
| Packing List     | PL-011130              | Draft        |        2 | Verified   |            2 |
| Delivery Receipt | DR-011130              | Draft        |        2 | Verified   |            2 |
| Payment AR       | AR-011130              | Draft        |        2 | Verified   |            2 |
| PO to Suppliers  | PO-011130              | Draft        |        2 | Verified   |            2 |

The final **read-only production SQL reconciliation** returned:

- `documents=6`, `distinct_modules=6`, `distinct_numbers=6`, `distinct_board_items=6`.
- `drafts_revision_two=6`, `synchronized_board_items=6`, `exact_two_events=6`, `revision_marker_verified=6`.
- No QA duplicates. All six Board item titles match their document numbers, with linked items in the same canonical Board.

Final signed Chromium All Documents readback showed **6 of 6** entries, all with Draft status and revision 2. Individual signed create/update flows observed HTTP 200 for their mutation RPC, and read/list/Board projection/paginated-list requests were successful. Refresh/reopen preserved the server number, status and QA marker.

## Repeatability and safety

`scripts/cp-tl-create-new-03d-signed-qa.mjs` is a one-module, one-operation signed-browser acceptance runner. It requires the existing user-signed localhost CDP browser, explicit approval environment flag plus CLI approval switch, a valid module and action, and an exact document ID for update. It verifies form type, canonical immutable document number, Draft state, QA marker, distinct reviewer selections when required, HTTP mutation receipt, readback and reload. It never automatically retries an uncertain production write. The caller must reconcile server-side rows before further action. QA documents are intentionally retained and **must not be automatically deleted**.

These tests establish the six-module **Draft creation/edit/persistence** scope only; they do not constitute acceptance of dual-account approvals, PDF printing, commercial dispatch or financial settlement workflows.
