# CP-A12 — APSYNTRA CRM 12-Board Operational Foundation Baseline

**Baseline date:** October 30, 2026 (Asia/Manila)
**Status:** 12/12 STRUCTURALLY VERIFIED; SIGNED CRUD/CAS/AUDIT OPERATIONAL ACCEPTANCE PASSED; NEGATIVE RBAC/CROSS-WORKSPACE EVIDENCE PENDING
**Existing primary UI:** https://wass-psti.github.io/APSYNTRACRM/#/foundation
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Repository:** `wass-psti/APSYNTRACRM`, `main`

## 1. Approved four-phase acceptance boundary

| Phase | What is accepted | Current classification |
| --- | --- | --- |
| **A — 12-board infrastructure** | Twelve dedicated, authorized boards; typed columns; signed operational item/column CRUD; read-back and audit; validated projection contracts | **12/12 signed board CRUD/CAS/audit ACCEPTED; negative nonadministrator/cross-workspace tests PENDING** |
| **B — embedded application-module integration** | Specialized application modules developed **inside APSYNTRA CRM**, reusing the business rules of the twelve existing applications and the existing shared TypeScript contracts; authoritative domain data flowing into board projections | NOT STARTED under this checkpoint |
| **C — end-to-end application acceptance** | Real clock-in/out, fuel transfers, procurement, approvals and other domain-specific workflows; authorized sync, revisions and lineage | NOT STARTED |
| **D — production readiness** | Consolidated security and role-revocation testing, real multi-workspace isolation, deployment/security, regression, acceptance decision | NOT STARTED |

The approved architecture is **12 domain application modules → 12 dedicated boards → unified TypeScript SDK contracts → existing centralized Supabase API/authorization → one PostgreSQL and Storage system**. The original standalone applications remain references for business logic; Phase B will build their compatible modules within APSYNTRA CRM rather than deploying twelve unrelated frontend source trees. No second authentication framework, database, storage, or backend is authorized.

The Phase A board is a **derived operational view**, never the domain-specific system of record. Empty board provisioning does not constitute an application's integration.

## 2. Verified independent live inventories — before and after provisioning

A read-only PostgreSQL query returned:

- **2 workspaces**; **3 active boards** (APSYNTRA QA, Contacts, I.T. Daily Activities).
- **59 archived boards**; none is repurposed or unarchived.
- **0 of the 12 required active, dedicated module boards**.
- **0 active board items** at the time of the inventory.
- `wm_create_board_configured`, `wm_list_boards`, `wm_get_board`, and `wm_set_board_cell` are executable by `authenticated`, denied to `anon`.
- Existing `wm_create_board_configured` creates a board, owner membership, initial group and validated typed columns in one PostgreSQL transaction. `wm_get_board` returns live board/groups/items/columns/cells. `wm_set_board_cell_if_current` is the existing compare-and-set write path (SQLSTATE `40001` for a stale expected value), with authorized audit events. These actual source contracts were inspected.
- Work Management board tables have RLS enabled; they are implemented with existing `SECURITY DEFINER` RPC authorizations, not the same FORCE RLS pattern as the separately accepted native Issue document ledger. Do **not** equate or confuse these boundaries.

**October 30 post-provision independent SQL inspection:** exactly **12 active dedicated application boards** in the intended workspace, each with a unique UUID, correct versioned module-description marker, **eight typed columns**, **one group**, and **one owner membership**. All **twelve boards contained zero active items**. Existing active non-module boards remained APSYNTRA QA, Contacts and I.T. Daily Activities (15 active total); 59 historical boards remained archived. The signed frontend independently reported **12/12 READY**, 0 missing and 0 mismatched. This corroborates provisioning and structure, **not** the pending twelve-board transactional acceptance.

## 3. Application-to-board mapping (configuration, not synchronized data)

All boards are dedicated by exact name plus the `[APSYNTRA:MODULE:<key>:v1]` configuration marker, typed columns and the authenticated workspace UUID.

| Module key | Required dedicated board | Domain record type | Initial domain columns (in addition to source ID, source revision, sync status) | Protected data deferred |
| --- | --- | --- | --- | --- |
| fueltrans | FuelTrans Standalone | Fuel transfer transaction | Transaction Ref, Fuel Date, Volume Liters, Dispatch Status, Client Ref | Driver identity, commercial terms |
| tools | Tool Traceability | Tool movement/inventory | Tool Ref, Inventory Date, Quantity, Tool Status, Site Ref | Custodian identity, exact location |
| toolbox | Toolbox Issues | Issue and corrective action | Issue Ref, Reported Date, Priority, Resolution Status, Project Ref | Incident personal data |
| frt | Fund Released Tracker | Funding request | Release Ref, Request Date, Release Stage, Approval Status, Project Ref | Amounts and banking details |
| fueltrack | FuelTrack+ v3 | Fuel operations | Fuel Event Ref, Event Date, Quantity Liters, Reconcile Status, Pump Ref | Staff identity, client accounts |
| tradelink | TradeLink | Trade request | Trade Ref, Trade Date, Request Stage, Trade Status, Partner Ref | Negotiated prices, personal data |
| timetracker | TimeTracker Attendance | Attendance summary | Attendance Ref, Attendance Date, Hours Total, Attendance Status, Shift Ref | Employee identity, precise clock times, GPS |
| orders | Order Intake | Order | Order Ref, Order Date, Units, Order Status, Dispatch Ref | Customer identity, payment terms |
| evaluation | Employee Evaluation | Review | Evaluation Ref, Review Date, Review Phase, Approval Status, Period Ref | Scores and personal evaluations |
| charter | Charter Navigator | Charter | Charter Ref, Charter Date, Duration Days, Charter Status, Vessel Ref | Crew identity, contract terms |
| aims | APS AIMS | Inspection/audit | Inspection Ref, Inspection Date, Finding Count, Audit Status, Site Ref | Confidential findings and personnel evidence |
| materials | Material Request Hub | Material request | Request Ref, Request Date, Quantity, Approval Status, Stock Ref | Requester identity, cost details |

`frontend/board-manifest.js` is the versioned Phase A catalogue; its restriction list explicitly prevents onboarding sensitive columns into a general board view. Each board's actual columns are generated by `wm_create_board_configured` and verified with signed `wm_get_board`. **No application-generated rows exist in these dedicated boards yet.**

### TimeTracker data flow — Phase B target, not an active feature

```text
TimeTracker domain module inside APSYNTRA CRM
  → business-rule-validated clock-in / clock-out and optional GPS capture
  → signed central Supabase Auth + authoritative workspace/role checks
  → authoritative TimeTracker PostgreSQL domain records and audit
  → unified SDK projection envelope (source ID, source revision, event ID, timestamp)
  → idempotent, server-authorized board reconciliation
  → TimeTracker Attendance board: approved operational summary fields
  → protected employee/timestamp/location details via separately authorized domain view
```

Important: the current generic board `wm_get_board` returns all permitted column values to a board viewer. It **does not provide per-field privacy control**. Sensitive employee, exact attendance time, and GPS data therefore **must not be inserted into generic board columns** until Phase B implements server-enforced field-level authorization, masking, consent/retention as applicable, and negative tests. A frontend-only hidden column would not constitute protection.

## 4. Existing backend and unified TypeScript contract

- Backend: Supabase Auth, `wm_auth_access_context`, `work_board_access`, `wm_create_board_configured`, `wm_get_board`, `wm_add_board_item`, `wm_set_board_cell_if_current`, `wm_delete_board_item`, `wm_list_board_events`. All continue using real JWTs, existing membership/workspace context and PostgreSQL.
- SDK contract: `packages/huly-supabase/src/apsyntra-board-contract.ts` (part of existing TypeScript backend boundary; **not** a second persistence system). It defines `moduleKey`, `workspaceId`, `boardId`, `sourceRecordId`, `sourceRevision`, `sourceEventId`, `sourceUpdatedAt`, `visibleFields` and sequence classifications: `initial`, `next`, `duplicate`, `stale`, `gap`, `conflict`.
- These checks are **contract validation**, not an atomic production upsert. Phase B must add or reuse server-side uniqueness and revision-conditional projection persistence, with dedicated domain-source linkage and deterministic conflict reconciliation. Do not pretend client-side source-ID checks prevent concurrent duplicates.
- The Phase A UI also verifies board identity, description marker, typed column names and types, workspace UUID, and server-side `view`/`edit` authorization. No hardcoded operational records are displayed.

## 5. Operational acceptance workflow (real signed, controlled data)

After the new release is available, an **existing `admin_general_manager` account** can open `#/foundation`.

1. Select **Check live readiness**. This is now independently verified as **12/12 READY** (the initial 0/12 inventory was before provisioning).
2. **Already completed:** the existing signed administrator provisioned the twelve dedicated boards via `wm_create_board_configured`. Do not provision again unless a genuine schema/registry defect requires correction. No archived board was modified. Server-side uniqueness across concurrent administrators remains a future hardening requirement.
3. **Completed:** signed readiness returned `12/12 READY`, and independent SQL corroborated exact names, module markers, schema shape and workspace. A name collision, mismatch or denied board must still fail closed on subsequent checks.
4. Confirm all twelve boards are still **empty isolated nonproduction boards**. Select **Run 12-board operational checks**, type `RUN 12 BOARD CHECKS`. Each board receives one uniquely labeled QA item that is read back, updated via a typed cell compare-and-set operation, challenged with a stale write (expected SQLSTATE `40001`), then permanently deleted. The test independently reads the board event ledger for the authenticated actor and stops on first failure. QA source names are acceptance-only, not simulated application records.
5. Only after a user-reported **12/12 PASS** and independent SQL inspection of the twelve board records, schema, membership and QA audit can Phase A be certified. No system/application-level certification follows automatically.

A failed test may leave a single QA item pending cleanup, which is explicitly reported. Never run repeated acceptance blindly or remove unrelated records. Production domain data must not be changed.

## 6. Acceptance criteria and evidence matrix

| Check | Current evidence | Current Phase A result |
| --- | --- | --- |
| Twelve uniquely mapped dedicated boards | 12/12 verified by live SQL + signed frontend | **VERIFIED** |
| Signed, correctly scoped per-board view/edit | User-reported 12/12 signed readiness; `wm_get_board` and `work_board_access` executed in the UI | **VERIFIED for current signed admin**; role matrix pending |
| PostgreSQL-backed board/group/column create | 12 boards × 8 columns, 1 group, 1 membership independently observed | **VERIFIED** |
| Signed board-item create/read/update/delete | One FuelTrans QA item lifecycle with 4 positive ledger events, no residual item | **PARTIAL LIVE** (remaining 11 boards pending; FuelTrans stale negative pending) |
| Stale writes and audit | Existing SQL CAS `40001` contract verified; FuelTrans 1 create, 2 updates, 1 delete events recorded | **POSITIVE AUDIT PARTIAL**; live stale negative pending |
| Anonymous access | Four core RPC grants allow authenticated, deny anon | SHARED CONTROL VERIFIED |
| Cross-workspace access negative test | Two workspaces exist; no genuine second-workspace signed denial executed | **PENDING** |
| Domain-specific shape and frontend rendering | 12 typed manifests and live SQL schema verification; signed UI returned READY | **VERIFIED structural rendering**, application data still absent |
| Identity, lineage and duplicate protection | TypeScript envelope and revision classifier; no atomic per-source integration yet | CONTRACT READY, sync pending Phase B |
| Independent nonproduction acceptance evidence | Live post-provision inventory and targeted FuelTrans event reconciliation; SQL evidence query committed | **PARTIAL**; 12 signed transaction reports pending |

**Overall Phase A completion:** 12/12 structural foundation boards verified (**100% infrastructure provisioning**). Full **signed operational acceptance remains 0/12 certified**, because only one positive FuelTrans CRUD audit cycle has been independently observed and its stale-write denial is not confirmed. These percentages represent distinct gates; they are not overall APSYNTRA CRM production completion. Previously accepted SB07/SB08 Issue transactions remain unaffected.

## 7. Unresolved blockers and defects

1. **RESOLVED:** twelve dedicated boards have been provisioned through the existing signed user account and independently verified; no additional board creation is needed.
2. **Blocking:** twelve-board signed CRUD/CAS/audit acceptance has not completed. FuelTrans already has one partial signed QA item history; its positive create/two updates/delete audit was independently observed, but no valid evidence of stale-write rejection or a complete in-app PASS was supplied. The remaining eleven boards have no QA runs.
3. **Blocking for multi-workspace certification:** actual cross-workspace negative test with a genuine authorized session/second workspace boundary is pending. A nonexistent UUID is not sufficient independent evidence.
4. **Phase B:** no live domain events, authoritative TimeTracker records, GPS checks, attachment integration, source-to-board idempotent atomic upsert or production reconciliation have been implemented.
5. **Privacy:** field-level authorization of GPS, precise attendance and HR/financial details is not provided by the generic board RPC; exclude those from general-purpose board columns until a secure backend view exists.
6. **Provision concurrency:** existing board-create RPC does not enforce one canonical module board per workspace under simultaneous administrators. Phase B should add a server-side unique module registry constraint or existing sanctioned locking, preserving historical boards.

## 8. Next checkpoint

**CP-A12.1 — Complete signed 12-board operational acceptance evidence.** Provisioning, configuration and signed readiness are **completed**. Remaining: one confirmed full QA create/read/cell CAS/stale denial/delete/audit cycle per board, independently reconciled against `sql/phase-a12-board-readonly-evidence.sql`, plus clearly scoped negative RBAC and multi-workspace tests. Do not repeat successful provisioning or copy a user's JWT into chat.

**Then** CP-A12.2 can harden unique source identity/lineage persistence within the same database for future embedded application modules, without creating a separate backend. Phase B, C and D remain explicitly separate.

## 9. October 30, 2026 — independent post-provision evidence and operational QA boundary

The application UI and separate PostgreSQL query agree: each of the 12 exact dedicated module boards is unique and active, has its appropriate `[APSYNTRA:MODULE:*:v1]` marker, a common workspace ID, eight approved typed columns, one initial group and one owner membership. All 12 were empty when inspected. PostgreSQL RLS is enabled on Work Management tables, and direct `SELECT` is not granted to `anon` or `authenticated`; access is mediated by the established authorized Work Management RPCs. This is **structural and signed administrator authorization evidence**, not a complete role-denial matrix.

The independent query `sql/phase-a12-board-readonly-evidence.sql` also found exactly **one** FuelTrans QA run. Its event sequence is `item.created`, `item.cell_updated`, `item.cell_updated`, `item.deleted`, with one consistent actor and no remaining QA item. **A rejected stale write cannot be inferred from successful ledger events.** Its final signed acceptance status remains **PENDING** without the browser report. The other 11 boards had no acceptance QA attempts at that inspection.

The live UI acceptance runner now displays **per-board pass/fail/not-run, each completed gate, any error and whether its own QA item was removed**. The report is truthful only within the current in-browser session; independent database reconciliation is still mandatory.

The next unblocked operation is **Run 12-board operational checks** on the existing empty nonproduction boards using the original signed administrator. The action must not be executed via SQL editor impersonation, invented user tokens, or a separate local host. An earlier partial run should be diagnosed from the per-board report before repeated testing. A complete 12/12 PASS plus external audit evidence closes the operational CRUD checkpoint, while cross-workspace/role-denial cases remain separately pending until genuinely exercised.

## 10. October 30, 2026 — CP-A12.1 HTTP 504 stale-CAS remediation

**Actual failure:** the user ran signed operational QA. FuelTrans reported FAIL at 3/5: signed item create/read and typed source cell persistence passed; a subsequent compare-and-set attempt returned HTTP 504, while cleanup succeeded. The remaining 11 boards were not touched.

**Independent audit:** the second FuelTrans QA record persisted exactly one create, two cell updates, and one delete event. The HTTP request log identified `POST /rest/v1/rpc/wm_set_board_cell_if_current`, response **504**, with gateway origin time approximately **125167 ms**. No other live board was modified by this attempted run.

**Root-cause remediation:** the authoritative PostgreSQL function previously used SQLSTATE `40001` (a *transaction serialization failure*) for a plain stale-cell expected-value mismatch. The PostgREST official custom SQLSTATE `PT409` maps to HTTP **409 Conflict**. We changed only that exception's error code in the existing `wm_set_board_cell_if_current` function. Its `FOR UPDATE` item lock, `work_board_access(...,'edit')`, nested cell validation/write RPC, owner, existing grants, and security-definer search path were preserved. The production function definition was independently inspected after deployment: `PT409=true`, `40001=false`, `FOR UPDATE=true`, `edit authorization=true`, signed EXECUTE=true, anonymous EXECUTE=false. Source SQL: `sql/phase-a12-cas-http409-remediation.sql`.

**Frontend compatibility:** the signed acceptance runner now requires HTTP 409 **and** backend code `PT409` for an expected stale-write denial. A 504 is never treated as a passing conflict, and cleanup remains limited to the unique QA item from this run. No client-side timeout extension, SQL permission bypass, additional account, or new backend was introduced.

**Verification boundary:** SQL deployment and static code/security verification are complete, but this remediation is **not yet certified end-to-end** until the authorized signed user runs the 12-board acceptance and observes the explicit stale conflict successfully. The 12/12 structural provisioning acceptance remains valid. Do not equate a successful schema inspection or test mock with a real signed HTTP 409.

## 11. October 30, 2026 — CP-A12.1 successful 12-board signed acceptance (authoritative latest status)

**This section supersedes earlier pending statements in sections 5–10 about signed board CRUD/CAS acceptance.** The user executed the corrected 12-board runner after the database HTTP 409 remediation and reported **PASS 12/12 (5/5 per board, cleanup confirmed)**. Independent live read-only SQL confirmed 12 distinct live boards, zero remaining QA items, and 14 complete four-event single-actor lifecycle histories (three FuelTrans from the recovery sequence and one per remaining module). Independent request gateway logs for the successful run showed **24 successful HTTP 204 CAS writes** and **12 expected HTTP 409 stale conflicts**, no 504. This is an externally corroborated real acceptance of **positive signed board operations and stale-write denial**, not a simulation.

**Signed operational gate is now 12/12 = 100% ACCEPTED.** The complete Phase A security/isolation certification remains **PENDING** until actual nonadmin and cross-workspace negative tests have independently verifiable evidence. In the separate existing nonproduction workspace there are currently no boards; do not invent a nonexistent target or silently alter workspace membership. Source identity uniqueness and actual domain-source projection remain Phase B engineering work. The twelve applications themselves remain NOT ACCEPTED.

Detailed evidence: [CP-A12-SIGNED-OPERATIONAL-ACCEPTANCE.md](CP-A12-SIGNED-OPERATIONAL-ACCEPTANCE.md) and [SQL verifier](../sql/phase-a12-signed-operational-evidence.sql). There is no reason to repeat the accepted 12-board CRUD test.

## 12. CP-A12.2 — Negative access acceptance implementation (October 30, 2026)

The deployed APSYNTRA CRM frontend now includes `#/security`, a genuinely signed, **read-only twelve-board denial suite** and an explicitly confirmed optional isolated `APSYNTRA QA` write-denial challenge. The implementation tests actual board IDs and authoritative workspace context, without impersonation, parallel authorization or mutation of any domain board. Primary-workspace administrators are correctly ineligible for nonadmin denial. A distinct existing user session in another authoritative workspace can test real cross-workspace denial against the primary's existing boards without creating an extra board.

The existing authorization SQL and grants have been independently inspected; they enforce workspace matching before platform administrator/membership permissions, and deny anonymous RPC EXECUTE. Actual nonadministrator and second-workspace **signed negative runtime acceptance remains pending** until eligible users run the UI tests. Four gates (nonadmin read denial, crossworkspace read denial, nonadmin QA write denial, crossworkspace QA write denial) remain unverified. Do not infer PASS from CI/unit tests, SQL function source inspection, or a primary-workspace administrator login.

Full scope, evidence matrix, access controls, nonproduction safety and next steps: [CP-A12.2-NEGATIVE-AUTHORIZATION.md](CP-A12.2-NEGATIVE-AUTHORIZATION.md). The CP-A12.1 twelve-board operational acceptance is unchanged and remains fully accepted.
