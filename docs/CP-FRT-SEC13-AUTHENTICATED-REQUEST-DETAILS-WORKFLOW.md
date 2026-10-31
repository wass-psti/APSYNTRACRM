# CP-FRT-SEC13 — Authenticated Request Details and Financial Workflow Contract Integration

**Date:** 2026-11-01 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM` — direct `main`
**Runtime:** GitHub Pages frontend + existing centralized Supabase project `jtlusodorfnyzgyuewkz`
**Authority:** 12 application domains → 12 boards → central TypeScript and Supabase authorization. No local host, Docker, new auth service or new finance schema.

## Scope and integration delivered

1. `frontend/frt-finance-workflow.js` implements `loadFRTRequestDetailReadOnly` through the **existing signed `public.frt_get_request(p_workspace_id,p_request_id)` RPC**, using `auth.getVerifiedUser` and `api.context()` before/after. Requests must originate from the current signed `frt_list_requests` result, with the actual workspace and selected company; the detail result's `id`, `workspace_id`, and `company_code` must all match.
2. The client rechecks `frt_bootstrap` on every detail read, requiring matching active membership, an authorized selected company and **unchanged effective FRT role** since the signed list was loaded. It fails closed on a missing record, stale role, changed caller/workspace, invalid response, 401/403, or unavailable backend RPC. No private errors or secret data are exported in its blocked return object.
3. `projectFRTRequestDetail` reduces the broad backend JSON to an explicit UI-only allowlist: voucher, title, date needed, request status, liquidation status, and boolean state flags (finance approved, GM verified, closed). **The existing backend detail RPC can include banking/recipient/requestor/amount, attachment/item/audit/liquidation fields in its HTTP response; this first SEC13 integration only prevents these values from entering app state and rendering. It is NOT server-side field-level redaction.** Exposing the backend response in browser DevTools remains possible to an already-authorized RPC caller; a separate restricted-field RPC is needed if field-level secrecy is required.
4. Mirrors eight existing `public.frt_request_action` workflow branches in a **read-only role-and-lifecycle candidate preview**: `approve`, `approve/revoke`, `reject`, `transfer`, `transfer/revoke`, `close`, `archive`, and `liquidation/approve`. The preview is explicitly `NOT_VERIFIED_FOR_EXECUTION`; the existing finance RPC remains authoritative for any future operation. It does not create buttons, call `frt_request_action`, apply permission grants or execute any finance mutation.
5. `frontend/frt-finance-ui.js` adds a per-request **View details** selector and escaped detail/workflow display inside the **existing Fund Released Tracker board**. All fields are HTML-escaped, sensitive payload fields are absent from displayed HTML, and denied detail responses never render raw content. `frontend/frt-finance-readonly.js` preserves backend-listed request UUIDs in private in-memory client state solely to select an existing listed request; no arbitrary detail selection or new board is exposed.
6. `frontend/app.js` maintains selected-request state, read-only loading, active role and company snapshot, and revision/route guards. Details are invalidated on logout, session expiration, workspace switch, board navigation, finance refresh, company switch or detail close. Late responses after a route, identity, company or revision change are discarded.

## Live source-of-truth contract inspection

Read-only PostgreSQL inventory independently confirmed the existing definitions of `frt_get_request`, `frt_request_action`, `frt_bootstrap`, and `frt_list_requests` before implementation. The `frt_requests` constraints define the status values `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `CLOSED`, `REJECTED`; liquidation statuses `NOT_SUBMITTED`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `RETURNED`. The JS preview is derived from the existing action function but is intentionally **not an authorization decision**. Changes to server workflow rules will require preview reconciliation.

No database migrations, altered grants, new RPCs, finance writes or production role assignments were made by this milestone.

## Targeted security regression coverage

`frontend/tests/frt-finance-workflow.test.mjs` verifies:
- Signed, list-scoped RPC use and redacted detail projection; no finance mutation calls.
- Absence-of-listed-record, workspace/company mismatch, active membership validation and company authorization.
- Server denial, session/identity drift and stale FRT role transition detection.
- Invalid lifecycle state and malformed detail payload fail-closed.
- Correct role-and-state candidate preview across approval, rejection, closing, liquidation and GM verification, **never presented as execution authority**.
- HTML injection escaping, denied-result isolation and non-executable UI.
- Existing board attachment, stale-result invalidation and absence of `frt_request_action` from the frontend host.

The prior SEC12 request-list test was updated to reflect preservation of the existing request UUID needed for selecting details; the public UI remains free of identifiers except the selected control's signed-list request-id attribute.

## Verification and acceptance evidence

| Gate | State |
| --- | --- |
| Existing FRT detail/action server contracts and status constraints inspected | VERIFIED |
| Signed, list/role/workspace/company-bound detail fetch implemented | VERIFIED by source + automated tests |
| Restricted UI projection, HTML escaping and no finance write path | VERIFIED by source + automated tests |
| Existing FRT board integration and client-side session/route invalidation | VERIFIED by source + automated tests |
| GitHub frontend regression | VERIFIED — 220/220 tests PASS at implementation commit \`c747777e307ee368fa5f0e1a17f55ed2890a9ef8\` |\n| Disposable PostgreSQL central authorization regression | VERIFIED — successful at the same implementation commit |\n| GitHub Pages CDN exact-source smoke | PENDING — deployment queue / stale CDN; not counted as PASS |
| Real nonbootstrap signed production request-detail view and execution-authority acceptance | **PENDING — no existing live FRT requests** |

**CI evidence:** [SEC13 implementation run #41253670822](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41253670822) recorded frontend 220/220 PASS and disposable PostgreSQL SUCCESS; its `live-pages` check failed because the published CDN continued serving an earlier `frontend/app.js` while the latest Pages deployment was still pending. The failed live-pages job was re-run once without modifying security rules, but source-to-live acceptance was not yet verified. Subsequent commit `d963053716dfef0f0058f6d8ceb2dff993737ff0` added all three new FRT finance assets to the exact-content CDN smoke and increased its bounded propagation retry allowance without weakening its byte-for-byte assertions. [Follow-up frontend+Pages workflow #41253873996](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41253873996).\n\nA read-only post-implementation Supabase inspection found **zero** `frt_requests`, two existing finance audit rows, zero liquidations, zero voucher counters, ten RLS-enabled FRT tables, and the previously installed nonpublic session guard. Central role assignment and board membership counts were 123 and 77, respectively, with three CRM overrides; these are snapshot counts, not a guarantee of historical immutability. The frontend cannot provide genuine request-detail production acceptance without an existing legitimate request. **Do not create fake production records, elevate an account, or disable session guard simply to generate a PASS.**

**Original CI07 disposition remains 100% administratively closed by operator waiver (5 verified + 3 waived), not 100% technically accepted.** The waiver does not authorize bypassing backend financial restrictions and cannot be carried forward as a positive signed-finance acceptance result.

**SEC13 development scope: implementation and automated regression VERIFIED; live CDN verification and genuine signed finance request-detail acceptance PENDING.** This is not final production-finance certification.\n\n## Next development dependency

Complete actual signed read-only SEC13 operational acceptance when a legitimate FRT request exists. Future SEC14 may add a server-side restricted-field request-detail contract and independently authorized, audited finance actions; those require explicit server role/lifecycle enforcement and separate production mutation acceptance, not inference from this client-only candidate preview.
