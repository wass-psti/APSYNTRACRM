# TradeLink — Persistent Draft Operations, Board Linkage and All Documents Integration

**Date:** November 7, 2026 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Existing project:** WatchdogWorkspace `jtlusodorfnyzgyuewkz`  
**TradeLink board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Status:** **IMPLEMENTED / AUTOMATED VERIFIED / DEPLOYED** for the guarded application paths. **Production signed document create/read/save acceptance NOT VERIFIED and ACTIVATION NOT AUTHORIZED.** The previous dark-launch production flags and Stage B privileges remain disabled.

## User objective and authoritative architecture

Requested: **Create → Preview → Save → PostgreSQL document and Board item → All Documents → Reopen saved document → Preview the correct revision**, using the redesigned TradeLink interface without a separate source of truth, mock success, standalone authentication or workflow approvals bypass.

The existing reviewed `sql/cp-tl03-staged-domain.sql` contains the atomic `private.tl03_commit` contract: create adds a linked `work_board_items` row, inserts `tradelink_documents`, appends `tradelink_document_events` and writes Board Activity in **one PostgreSQL transaction**. Update/archive/restore use expected-revision conflict checks and preserve the one-to-one Board item foreign key. Identical revision-zero create retries can return an idempotent receipt for the same document ID; the frontend must **not** create a second Board item. The public `tl03_documents_list` and `tl03_document_read` RPCs are existing signed, manager-checked Stage A read paths. Server-side workspace/RLS, central module role and board scope remain authoritative.

**No new schema, migration, SQL grants or server-side privilege bypass was introduced.** This development connects the existing staged client to the already committed transaction/read contracts for later controlled activation.

## Implementation

**Final source and corrected regression commit:** `64fe0abfeab1f190ee437b583546144587c35d91`. Review earlier code commits `b243840c` (integration), `4bca0114` (syntax correction), `fbc0f3d7` (multi-line saved totals), and final test correction `64fe0abf`. Initial failing CI jobs were corrected, not accepted as passes.

- **`frontend/tradelink-draft-workspace.js`:** The redesigned Save Draft toolbar action now uses the existing form submission path **only when the existing write feature flag and signed Board manage permission both allow it**. Under current production flags it stays disabled. Added an authoritative persisted-document preview renderer, validating the existing row's exact document ID, board scope, workspace, source document number/type and revision before displaying its content. All displayed text is HTML-escaped, including multiple persisted line items. Priced saved documents recalculate subtotal/discount/VAT/total from **all** persisted lines using the existing source finance engine; missing foreign-currency FX rates are never inferred. Existing local pre-save validation/preview remains distinct from saved content. Added a read-only **Preview saved** action in All Documents, a signed Refresh control and an explicitly scoped selected-record display; no ad hoc browser storage.
- **`frontend/tradelink-application.js`:** The authorized Board records projection joins only **matching server-returned `boardItemId` and document number** against the current signed TradeLink document list; rows are not inferred into documents. When valid, the existing Board record displays an **Open document** action routed to the same authoritative preview. Unmatched/unverified board rows never become fabricated document records.
- **`frontend/app.js`:** Wired the top Save Draft control to the actual form's `requestSubmit()`; uses the existing signed `TradeLinkDraftWorkspace.save` / server commit receipt and retains the same pending document ID across ambiguous network failures. On acknowledged commit, concurrently re-reads the exact authoritative document, signed document list, and Board projection; verifies revision, Board item ID, document number/type and Board workspace before reporting a **fully synchronized** save and navigating to **All Documents**. If the commit receipt is confirmed but verification fails, the error explicitly distinguishes **“commit succeeded, view not verified”** from an unconfirmed save and requires refresh before retry. No second client-side Board creation occurs. Saved document open is authorized only from the signed Documents route and an ID already present in the current signed document list; mismatched or stale revisions fail closed. Refresh and route/identity transitions discard stale selected saved previews.
- **`frontend/tradelink-application.css`:** Accessible focus outline and responsive read-only saved record content/line-item presentation.
- **`frontend/tests/tradelink-draft-workspace.test.mjs`:** New source tests cover server revision labels, multi-line saved totals, safe HTML rendering, mismatched workspace/document rejection, forged authorized rows remaining hidden under both dark-launch flags, signed-route/action wiring, and receipt/Board/list synchronization source structure.

**Source limitation preserved:** Existing Stage B server commit supports only signed **Draft** create/update/archive/restore. Source workflow submission/approval, legal PDFs, templates and private attachments are distinct unactivated work; this change must not imply those operational capabilities are released.

## Evidence

| Gate | Status / direct result |
| --- | --- |
| Frontend guarded save, read, Board link and saved preview source | **IMPLEMENTED** at final SHA |
| Focused source/financial/security regression | **VERIFIED**, 1,156/1,156 frontend tests passed, zero failures |
| Disposable PostgreSQL, collaboration and overtime CI | **VERIFIED**, all three jobs succeeded; no live writes |
| GitHub Pages deployment | **VERIFIED**, run [42328048083](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42328048083) success at exact source SHA |
| Live Pages CDN exact-commit smoke | **VERIFIED**, [frontend validation 42328048303](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42328048303) success and log `LIVE PAGES SMOKE: PASS for 64fe0abfeab1f190ee437b583546144587c35d91`, including `frontend/app.js`, `frontend/tradelink-draft-workspace.js`, `frontend/tradelink-application.js`, CSS |
| Current production read-only privileges and zero-record baseline | **VERIFIED by fresh SELECT-only query**: `saved_documents=0`, `audit_events=0`, TradeLink `board_items=0`; `authenticated` read/list EXECUTE granted, both Stage B commit EXECUTEs denied, zero Stage B migration |
| Actual signed production document save/refresh/reopen/Board click and multiuser isolation | **BLOCKED / NOT VERIFIED**; no permitted production fixture and write grants disabled |
| Controlled read flag, Stage B grants, real production record data | **NOT AUTHORIZED / NOT EXECUTED** |

The final frontend success is **source and mocked/isolated regression evidence**, not a claim that a genuine GoTrue-signed production document was persisted.

## Production activation requirements and no-go decision

**As of the fresh query, frontend `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false` remain unchanged.** The two Stage B write functions are **not** executable by the `authenticated` Postgres role. The application must not display a working Save Draft control until a distinct, controlled production activation has legitimately met its gates.

The already reviewed change-control blockers remain: actual recoverable-backup evidence and shared-project RPO/RTO decision, named production executor/security reviewer/rollback authority, genuine signed-user positive and negative authorization acceptance (including revoked and foreign-workspace cases where eligible), scoped legacy TradeLink security review, a separately approved **exact two-function authenticated EXECUTE grant** and rollback plan, an independently approved **production QA document record and cleanup scope** if a live fixture is required, and a separately approved frontend read/write flag deployment. These are materially risky production permission, data and operational actions, not covered by standing development authorization.

The source-controlled candidates remain `sql/cp-tl03c-write-permission-candidate.sql` and `sql/cp-tl03c-stage-b-write-revoke-candidate.sql`. **Neither was executed.** Revalidate the canonical read-only 15-point Stage A preflight immediately before any future authorized change. Do not conflate a frontend flag with an authenticated server grant.

**Decision:** **NO-GO to production document writes, and NO-GO to enabling disabled frontend document reads/writes without separate acceptance/approval.** Technical operational code is ready for controlled signed integration acceptance. Overall production operational completion percentage **INDETERMINATE** because required live scenarios are blocked; source regression progress is independently evidenced (1,156/1,156).
