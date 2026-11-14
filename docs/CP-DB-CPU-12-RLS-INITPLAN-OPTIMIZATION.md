# CP-DB-CPU-12 — Targeted RLS Initplan Optimization and Policy-Semantics Preservation

**Date:** 2026-11-14  
**Status:** IMPLEMENTED-UNVERIFIED — migration and regression coverage are implemented; disposable PostgreSQL 17 acceptance passed. Production migration application is pending explicit approval because it alters existing RLS policy definitions, even though the predicates and effective permissions are preserved.  
**Repository:** `wass-psti/APSYNTRACRM`  
**Base commit:** `d101931c39b5c2b90982717cbede4e08eb84240a`  
**Branch:** `perf/cp-db-cpu-12-rls-initplan`

## 1. Objective and scope

Apply the Supabase Performance Advisor's targeted recommendation to move stable request identity and workspace-context lookups out of per-row RLS predicate evaluation and into statement-level scalar subqueries (initplans).

This increment changes only the evaluation placement of:
- `auth.uid()` in six policies (10 occurrences).
- `current_setting('watchdog.workspace_id', true)` in fourteen policies (23 occurrences).

No authorization redesign is included.

## 2. Evidence captured before implementation

### Live workload (24-hour Edge log window)

Window: `2026-11-13 14:50 UTC` through `2026-11-14 14:50 UTC`.

| RPC | Requests | Average origin time | P95 origin time | Errors |
|---|---:|---:|---:|---:|
| `wm_get_board_items_page` | 2,360 | 192.36 ms | 609.60 ms | 5 |
| `wm_list_boards` | 2,009 | 231.23 ms | 609.60 ms | 0 |
| `apsyntra_crm_my_effective_access` | 1,789 | 333.81 ms | 1,618 ms | 1 |
| `wm_get_board_shell` | 962 | 116.38 ms | 305.95 ms | 5 |
| `wm_get_board` | 730 | 166.95 ms | 346 ms | 0 |
| `wm_import_board_wizard_extended_atomic` | 206 | 239.28 ms | 526 ms | 0 |

Legacy `wm_get_board` requests were still present in the 24-hour Edge logs (712 Chrome 155 and 18 Chrome 157 requests, from three signed users). The current `main` client already uses shell plus keyset item pages; the legacy RPC was not removed or restricted because the logs do not establish that every remaining caller is obsolete. This is a separate client-convergence investigation.

### Query-plan check

`wm_list_boards`' active item-count aggregation used `work_board_items_active_board_count_idx` with an index-only scan. A representative read-only plan over the current workspace's 252 active boards and 14,408 active items completed in 6.522 ms. A lateral variant completed in 3.965 ms in that single warm-cache sample, with the same 853 shared-buffer hits; this isolated difference is not sufficient evidence for a production query rewrite or another index.

### Supabase Performance Advisor

The current advisor reported:
- 20 `auth_rls_initplan` policy findings.
- 158 unindexed foreign-key findings.
- 74 unused-index findings.
- 1 duplicate-index finding.
- 1 Auth DB connection strategy notice.

The 20 RLS findings were inspected individually. They cover `profiles`, `module_role_assignments`, Order Intake, Fund Released Tracker, Tool Traceability runtime tables, Watchdog board compatibility tables, and Huly transaction events. The other advisor findings are not blanket-applied; indexes are not added or dropped without a hot-query justification.

## 3. Implementation

Migration: `supabase/migrations/20261114150000_cp_db_cpu_12_rls_initplan_optimization.sql`

- Alters exactly the 20 advisor-identified policies.
- Replaces row-correlated auth calls with `(SELECT auth.uid())`.
- Replaces row-correlated workspace GUC reads with `(SELECT current_setting('watchdog.workspace_id'::text, true))`.
- Retains each policy name, schema, table, permissive mode, role target, command, USING presence, WITH CHECK presence, and the original predicate logic.
- Uses bounded local lock and statement timeouts (2 seconds / 20 seconds).
- Does not create or drop policies, roles, users, tables, or schemas.
- Does not change grants, revokes, RLS enable/force state, workspace rules, role ceilings, membership rules, or any application authority.
- Does not modify application RPC contracts, indexes, database settings, or data.

## 4. Verification artifacts

- `frontend/tests/cp-db-cpu-12-rls-initplan.test.mjs` — static regression checks for exactly 20 policy alterations, 10 auth initplan wrappers, 23 workspace GUC initplan wrappers, and no role/grant/RLS enablement or data changes.
- `sql/tests/cp-db-cpu-12-rls-initplan-verification.sql` — read-only post-activation check for all 20 policy identities, roles, commands, permissive modes, and scalar-subquery presence.

### Disposable PostgreSQL 17 acceptance

A temporary, isolated PostgreSQL 17 container was created and removed after the test. The migration was applied inside a transaction to a fixture containing all 20 original policy definitions.

Verified:
- All 20 `ALTER POLICY` statements parsed and executed.
- Exactly 20 baseline and target policy identities were present.
- All 20 policy role targets, commands, and permissive modes were unchanged.
- USING/WITH CHECK presence was unchanged.
- Normalized USING and WITH CHECK expressions exactly matched their pre-migration predicates after removing only the scalar-subquery wrappers.
- The transaction was rolled back; no fixture or production data was retained.

Node regression: **5/5 passed**.

## 5. Explicit non-goals

- No changes to production roles, grants, revokes, or effective authorization.
- No new workspace access or board capabilities.
- No RLS disablement or bypass.
- No bulk addition of the 158 advisor-suggested FK indexes.
- No deletion of the 74 unused-index candidates or duplicate-index cleanup.
- No database-wide configuration, extension, pool-size, cache, or background-worker changes.
- No legacy `wm_get_board` removal.

## 6. Acceptance status and next gate

| Requirement | Status | Evidence |
|---|---|---|
| Current advisor findings captured | VERIFIED | Live Supabase Performance Advisor |
| 20 target policies inspected | VERIFIED | Live `pg_policies` inventory |
| Policy-preserving migration authored | IMPLEMENTED | 20 `ALTER POLICY` statements |
| Static regression tests | VERIFIED | 5/5 Node tests |
| PostgreSQL 17 syntax/application | VERIFIED | Disposable fixture |
| Policy predicate equivalence | VERIFIED | Normalized pre/post USING and WITH CHECK comparison |
| Production migration applied | PENDING | Requires separate approval for production RLS policy DDL |
| Post-production advisor reduction and signed-user regression | PENDING | Run only after production activation is authorized |

**Decision:** The migration is technically ready for controlled activation, but has not been applied to the existing Supabase project. The production gate is limited to approval for changing the definitions of existing RLS policies. The change is designed to preserve their effective permissions exactly.
