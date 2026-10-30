# CP-A12 — APSYNTRA CRM 12-Board Operational Foundation Baseline

**Baseline date:** October 30, 2026 (Asia/Manila)
**Status:** IMPLEMENTED FOR SIGNED PROVISIONING; LIVE 12-BOARD ACCEPTANCE PENDING
**Existing primary UI:** https://wass-psti.github.io/APSYNTRACRM/#/foundation
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Repository:** `wass-psti/APSYNTRACRM`, `main`

## 1. Approved four-phase acceptance boundary

| Phase | What is accepted | Current classification |
| --- | --- | --- |
| **A — 12-board infrastructure** | Twelve dedicated, authorized boards; typed columns; signed operational item/column CRUD; read-back and audit; validated projection contracts | **NOT YET ACCEPTED** (no live dedicated boards) |
| **B — embedded application-module integration** | Specialized application modules developed **inside APSYNTRA CRM**, reusing the business rules of the twelve existing applications and the existing shared TypeScript contracts; authoritative domain data flowing into board projections | NOT STARTED under this checkpoint |
| **C — end-to-end application acceptance** | Real clock-in/out, fuel transfers, procurement, approvals and other domain-specific workflows; authorized sync, revisions and lineage | NOT STARTED |
| **D — production readiness** | Consolidated security and role-revocation testing, real multi-workspace isolation, deployment/security, regression, acceptance decision | NOT STARTED |

The approved architecture is **12 domain application modules → 12 dedicated boards → unified TypeScript SDK contracts → existing centralized Supabase API/authorization → one PostgreSQL and Storage system**. The original standalone applications remain references for business logic; Phase B will build their compatible modules within APSYNTRA CRM rather than deploying twelve unrelated frontend source trees. No second authentication framework, database, storage, or backend is authorized.

The Phase A board is a **derived operational view**, never the domain-specific system of record. Empty board provisioning does not constitute an application's integration.

## 2. Verified independent live inventory before provisioning

A read-only PostgreSQL query returned:

- **2 workspaces**; **3 active boards** (APSYNTRA QA, Contacts, I.T. Daily Activities).
- **59 archived boards**; none is repurposed or unarchived.
- **0 of the 12 required active, dedicated module boards**.
- **0 active board items** at the time of the inventory.
- `wm_create_board_configured`, `wm_list_boards`, `wm_get_board`, and `wm_set_board_cell` are executable by `authenticated`, denied to `anon`.
- Existing `wm_create_board_configured` creates a board, owner membership, initial group and validated typed columns in one PostgreSQL transaction. `wm_get_board` returns live board/groups/items/columns/cells. `wm_set_board_cell_if_current` is the existing compare-and-set write path (SQLSTATE `40001` for a stale expected value), with authorized audit events. These actual source contracts were inspected.
- Work Management board tables have RLS enabled; they are implemented with existing `SECURITY DEFINER` RPC authorizations, not the same FORCE RLS pattern as the separately accepted native Issue document ledger. Do **not** equate or confuse these boundaries.

**No 12-board production records were created or modified by this inventory or source-development work.** Board readiness remains **0/12 verified** until the authenticated UI provisions and verifies the intended boards.

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

1. Select **Check live readiness**. Initially expect `0/12` and `missing` for all twelve, based on the independent DB inventory.
2. Select **Provision missing dedicated boards**, type `PROVISION 12 BOARDS`. The app uses the existing signed `wm_create_board_configured` RPC and verifies the inserted board immediately after each operation. It does not import application data or alter archived boards. A second run skips visible existing boards, but **server-side uniqueness for concurrent provisioners is not yet guaranteed**; do not provision simultaneously from multiple sessions.
3. Run **Check live readiness** again: require `12/12 READY`, correct workspace, typed domain columns and server-authorized view/edit per board. Any name collision, mismatch or denied board fails closed.
4. Confirm all twelve boards are still **empty isolated nonproduction boards**. Select **Run 12-board operational checks**, type `RUN 12 BOARD CHECKS`. Each board receives one uniquely labeled QA item that is read back, updated via a typed cell compare-and-set operation, challenged with a stale write (expected SQLSTATE `40001`), then permanently deleted. The test independently reads the board event ledger for the authenticated actor and stops on first failure. QA source names are acceptance-only, not simulated application records.
5. Only after a user-reported **12/12 PASS** and independent SQL inspection of the twelve board records, schema, membership and QA audit can Phase A be certified. No system/application-level certification follows automatically.

A failed test may leave a single QA item pending cleanup, which is explicitly reported. Never run repeated acceptance blindly or remove unrelated records. Production domain data must not be changed.

## 6. Acceptance criteria and evidence matrix

| Check | Current evidence | Current Phase A result |
| --- | --- | --- |
| Twelve uniquely mapped dedicated boards | Live DB has 0/12 | **BLOCKED — provision** |
| Signed, correctly scoped per-board view/edit | Shared RPCs inspected; no dedicated boards to call | PENDING |
| PostgreSQL-backed board/group/column create | Existing configured creation RPC verified by source; 12-run pending | PENDING |
| Signed board-item create/read/update/delete | Existing RPC implementation, automated contract tests | PENDING live 12 boards |
| Stale writes and audit | Existing CAS `40001` and event RPC verified by source | PENDING live 12 boards |
| Anonymous access | Four core RPC grants allow authenticated, deny anon | SHARED CONTROL VERIFIED |
| Cross-workspace access negative test | Two workspaces exist; no genuine second-workspace signed denial executed | **PENDING** |
| Domain-specific shape and frontend rendering | 12 typed manifests and dynamic no-mock renderer implemented | IMPLEMENTED, live 12-view pending |
| Identity, lineage and duplicate protection | TypeScript envelope and revision classifier; no atomic per-source integration yet | CONTRACT READY, sync pending Phase B |
| Independent nonproduction acceptance evidence | Initial SQL inventory collected; QA audit not yet performed | PENDING |

**Overall Phase A board-specific live acceptance: 0 of 12 = 0%.** This is not a regression of previously accepted SB07/SB08 Issue transactions; those remain independently accepted and untouched.

## 7. Unresolved blockers and defects

1. **Blocking:** no dedicated boards have yet been provisioned with a real administrator bearer.
2. **Blocking:** 12-board real signed CRUD, CAS, audit and UI acceptance has not executed; mock/unit tests cannot substitute.
3. **Blocking for multi-workspace certification:** actual cross-workspace negative test with a genuine authorized session/second workspace boundary is pending. A nonexistent UUID is not sufficient independent evidence.
4. **Phase B:** no live domain events, authoritative TimeTracker records, GPS checks, attachment integration, source-to-board idempotent atomic upsert or production reconciliation have been implemented.
5. **Privacy:** field-level authorization of GPS, precise attendance and HR/financial details is not provided by the generic board RPC; exclude those from general-purpose board columns until a secure backend view exists.
6. **Provision concurrency:** existing board-create RPC does not enforce one canonical module board per workspace under simultaneous administrators. Phase B should add a server-side unique module registry constraint or existing sanctioned locking, preserving historical boards.

## 8. Next checkpoint

**CP-A12.1 — Signed 12-board provisioning and acceptance evidence.** Required: 12/12 exact board mappings created by the real administrator, all `READY` through signed RPCs, one isolated QA create/read/cell CAS/stale denial/delete/audit cycle per board, independent database reconciliation, and documented RBAC/negative-case scope.

**Then** CP-A12.2 can harden unique source identity/lineage persistence within the same database for future embedded application modules, without creating a separate backend. Phase B, C and D remain explicitly separate.
