# CP-TL-CREATE-NEW-02C — Genuine Signed-User Six-Module Production Acceptance

**Date:** 2026-11-19

**Status:** IMPLEMENTED-UNVERIFIED — acceptance harness and safeguards prepared; genuine signed-user execution pending.

**Repository:** `wass-psti/APSYNTRACRM`

**Supabase:** existing project `jtlusodorfnyzgyuewkz` only.

## Scope

Verify the existing TradeLink `User` module role against the canonical TradeLink board and exercise all six native Create New forms. The acceptance harness uses the existing signed browser session and the existing TradeLink domain RPCs. It does not automate authentication or change any role, permission, grant, policy, or workspace assignment.

## Six modules

1. Electronic SI (`esi`, `ESI-`)
2. Quotation (`quotation`, `Q-`)
3. Packing List (`packing`, `PL-`)
4. Delivery Receipt (`delivery`, `DR-`)
5. Payment AR (`payment`, `AR-`)
6. PO to Suppliers (`po`, `PO-`)

## Acceptance sequence

For each module, the harness verifies:

- Existing signed `TradeLink` module context returns role `User` and the canonical board in the current workspace.
- Native form and Save control are rendered; the explicit Draft option is available; document number is server-assigned and read-only.
- In the separately approved write mode, a clearly marked QA-only Draft is created through the existing `tl03_document_create` RPC.
- The server receipt, exact `tl03_document_read`, creator list, All Documents page, and `tl03_board_projection` agree on document ID, number, revision, Draft state, and linked Board item.
- The exact document is reopened by its signed deep link, the browser is refreshed, and the same content and revision are read again.
- The Draft is updated once through `tl03_document_save`; revision 2, unchanged Board item identity, updated All Documents page, exact readback, and another refresh/reopen are verified.

The QA payload states that it is test-only and does not represent a commercial commitment, actual payment, dispatch, delivery, or purchase authorization. All QA records remain visible in the production workspace after acceptance. The harness intentionally has no cleanup or delete path.

## Explicit production-write gate

Default execution is read-only. Production writes require both:

- `--create-approved-qa-drafts`
- `CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED=YES`

This gate is an operational approval boundary for production data, not an application role or permission change. An uncertain create/update stops the run and is never automatically retried. Partial QA records are preserved for inspection; no cleanup is performed.

## Execution

Read-only signed User preflight:

```bash
node scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:<existing-debug-port>
```

Approved six-module production QA create, refresh/reopen, and revision-two update:

```bash
CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED=YES \
node scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:<existing-debug-port> \
  --create-approved-qa-drafts
```

Use an already signed browser session. The harness never reads credentials, cookies, tokens, or browser storage, and does not close the user's browser.

## Current evidence and blockers

- Production catalog: 36 active TradeLink `User` assignments; all 36 have Board Viewer membership and none has Board Editor/Owner membership.
- Production document baseline: 4 active documents, 2 active Drafts, 4 linked Board items, and 0 active documents missing a Board item.
- Existing `CP-TL-CREATE-NEW-02C QA ONLY` marker count: 0 before this acceptance run.
- Current connected APSYNTRA browser tab is signed out. Genuine signed-user acceptance cannot be claimed until an existing TradeLink User signs in.
- Local disposable PostgreSQL runner is currently blocked because the Docker engine is not responding. The previously completed CP02 disposable acceptance and regression evidence remain separate from this 02C live-browser acceptance.
- No production TradeLink QA document or Board item was created during 02C preparation.

## Acceptance boundary

The harness implementation and its static contract tests are not production acceptance. CP-TL-CREATE-NEW-02C remains pending until the read-only signed User preflight passes and the six QA Draft create/update run is explicitly approved and verified end-to-end.
