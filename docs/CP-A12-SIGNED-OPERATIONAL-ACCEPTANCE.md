# CP-A12.1 — Signed 12-Board Operational Acceptance Evidence

**Date:** October 30, 2026 (Asia/Manila).
**Repository:** `wass-psti/APSYNTRACRM`.
**Frontend:** `https://wass-psti.github.io/APSYNTRACRM/#/foundation`.
**Backend:** Existing Supabase Auth, authorized Work Management RPCs, one PostgreSQL and Storage system.
**Decision:** **ACCEPTED** for 12/12 signed administrator board CRUD/CAS/audit cycles and structural provisioning; **Phase A full authorization/isolation certification remains open**.
**Application acceptance:** NOT INCLUDED. The twelve domain modules are not accepted merely because the corresponding board passes.

## Evidence sources and separation

1. **Actual user-signed frontend run:** twelve boards each showed **PASS 5/5**: authorized empty board, signed create/read, typed cell persistence, conditional update plus stale-write denial, delete and authenticated audit. Each reported confirmed cleanup.
2. **Independent read-only PostgreSQL evidence:** twelve expected active board names in one workspace, each with eight typed columns, one group, one board membership, no remaining item, and at least one complete four-event QA lifecycle. **14 complete lifecycles total**, including two previous FuelTrans attempts. All event groups had the order `item.created → item.cell_updated → item.cell_updated → item.deleted`, one consistent actor, and zero remaining test items. Source: `sql/phase-a12-signed-operational-evidence.sql`; this query was executed live before this record was committed.
3. **Independent Supabase request-gateway evidence:** in the successful signed test window `2026-10-30T06:10:35Z` through `06:11:45Z`, for `POST /rest/v1/rpc/wm_set_board_cell_if_current`, there were **24 HTTP 204 successes** and **12 HTTP 409 conflicts**. This independently confirms that the `PT409` conflict mapping resolved the former 125-second HTTP 504 failure. The gateway counts do not expose individual board IDs; board-by-board assignment comes from the signed frontend report.
4. **Authorization implementation/grants inspection:** `work_board_access` returns false for missing/inactive identity, missing board, and mismatch between the caller's authoritative current workspace and board workspace; only then may platform-admin override or board membership be applied. The signed board CRUD/query functions' `EXECUTE` privileges are denied to `anon`. Board storage tables have RLS and no direct API table SELECT to `anon`/`authenticated`. These checks establish implemented policy and grants, **not** genuine runtime denial for a nonadministrator or a different workspace.
5. **No synthetic application data:** every acceptance item had a unique `APSYNTRA-A12-QA-` label, lived on an empty nonproduction dedicated board and was removed after verification. The audit history remains by design.

## Board-by-board independently reconciled results

| Dedicated board | Current active items | Independent positive QA sequences | Latest signed QA |
| --- | ---: | ---: | --- |
| FuelTrans Standalone | 0 | 3 (including two earlier attempts) | PASS 5/5 |
| Tool Traceability | 0 | 1 | PASS 5/5 |
| Toolbox Issues | 0 | 1 | PASS 5/5 |
| Fund Released Tracker | 0 | 1 | PASS 5/5 |
| FuelTrack+ v3 | 0 | 1 | PASS 5/5 |
| TradeLink | 0 | 1 | PASS 5/5 |
| TimeTracker Attendance | 0 | 1 | PASS 5/5 |
| Order Intake | 0 | 1 | PASS 5/5 |
| Employee Evaluation | 0 | 1 | PASS 5/5 |
| Charter Navigator | 0 | 1 | PASS 5/5 |
| APS AIMS | 0 | 1 | PASS 5/5 |
| Material Request Hub | 0 | 1 | PASS 5/5 |
| **Total** | **0** | **14** | **12/12** |

## Contract and operational acceptance boundaries

- **Accepted:** twelve existing unique dedicated boards, schema/group/membership readiness, current administrator's signed view/edit, authorized item creation/independent read, persisted typed-cell changes, CAS HTTP 409 stale-write rejection, delete/cleanup, and independently corroborated audit.
- **Pending for complete Phase A:** actual signed negative tests using existing identities for unauthorized nonadministrator board access and cross-workspace isolation. The second existing workspace (`FRT-ACCEPTANCE-QA-v0.5.0`) currently has **no board**, so there is no genuine cross-workspace board target yet. Do not substitute a random UUID or manufacture an account. Approval to create an isolated cross-workspace board must be scoped explicitly if needed.
- **Phase B only:** development of 12 specialized modules **inside APSYNTRA CRM** based on existing standalone business rules; server-authoritative source linkage, unique module/source identity, atomic idempotent projection, field-level privacy for GPS/HR/finance, and real domain transactions.
- **Phase C/D only:** application-specific end-to-end acceptance, security/revocation matrix, resilience, final production readiness and any final merge approval. Nothing here certifies the standalone applications or full app integration.

## Acceptance disposition

**CP-A12.1 signed board operations: PASS, 12/12 (100%).**
**Phase A overall: not yet fully certified**, because real negative authorization and multi-workspace isolation evidence is incomplete. Do not rerun CRUD just to collect the same evidence; continue with an explicitly scoped read-only negative authorization test using existing accounts.

Previously accepted Pages-backed Issue persistence and supported native Issue transactions remain intact.
