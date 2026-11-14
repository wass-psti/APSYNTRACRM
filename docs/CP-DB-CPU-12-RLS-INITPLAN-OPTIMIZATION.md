# CP-DB-CPU-12 — Targeted RLS Initplan Optimization and Policy-Semantics Preservation

**Date:** 2026-11-14
**Status:** IMPLEMENTED — production migration applied to the existing Supabase project; all 20 target policies passed read-only post-activation verification and the Performance Advisor initplan finding count fell from 20 to 0. Signed-user interactive regression remains pending.
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `d101931c39b5c2b90982717cbede4e08eb84240a`
**Merged commit:** `44e05c561acb8ed23888ffa880ebcf9bd8cbd81d`
**Remote migration history version:** `20261114151934`
**Migration history name:** `cp_db_cpu_12_rls_initplan_optimization`

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

### Production activation verification

- Supabase migration API applied the migration successfully to the existing project `jtlusodorfnyzgyuewkz`.
- The recorded remote migration history version is `20261114151934` with name `cp_db_cpu_12_rls_initplan_optimization`; the repository migration filename is synchronized to this exact version.
- Read-only live policy verifier: **20 expected / 20 passing / 0 mismatches**. All expected policy identities, role targets, commands, permissive modes, and USING/WITH CHECK presence passed.
- Supabase Performance Advisor after activation: **20 `auth_rls_initplan` findings before → 0 after**. Remaining unrelated findings: 158 unindexed foreign keys, 74 unused-index candidates, 1 duplicate index, and 1 Auth connection strategy notice.
- Edge logs from `2026-11-14 15:19:34 UTC` to `15:30:00 UTC`: **0 requests with HTTP status >=400**. PostgreSQL logs contained no RLS/permission-related errors in the same window. One PostgreSQL error was from a read-only metadata query that referenced a non-existent `inserted_at` column; it did not originate from application traffic.
- Signed-user functional allow/deny testing is still pending; the live policy metadata check is not a substitute for an authenticated application session test.

## 3. Implementation

Migration: `supabase/migrations/20261114151934_cp_db_cpu_12_rls_initplan_optimization.sql`

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

## 6. Production activation and acceptance status

| Requirement | Status | Evidence |
|---|---|---|
| Current advisor findings captured | VERIFIED | Live Supabase Performance Advisor |
| 20 target policies inspected | VERIFIED | Live `pg_policies` inventory |
| Policy-preserving migration authored | IMPLEMENTED | 20 `ALTER POLICY` statements |
| Static regression tests | VERIFIED | 5/5 Node tests |
| PostgreSQL 17 syntax/application | VERIFIED | Disposable fixture |
| Policy predicate equivalence | VERIFIED | Normalized pre/post USING and WITH CHECK comparison |
| Production migration applied | VERIFIED | Supabase migration history version `20261114151934`; name `cp_db_cpu_12_rls_initplan_optimization` |
| Post-production policy inventory | VERIFIED | 20/20 expected policies; 0 mismatches; role targets, commands, permissive modes, and predicate presence matched |
| Performance Advisor initplan finding reduction | VERIFIED | `auth_rls_initplan`: 20 findings before activation, 0 after activation |
| Signed-user allow/deny regression | PENDING | Requires interactive application sessions for the affected user/workspace contexts |

**Decision:** The targeted RLS initplan optimization is active in the existing Supabase project. It changed only evaluation placement of stable request-identity and workspace-context expressions; all 20 policy identities and authorization metadata passed post-activation checks. Do not treat this as complete production acceptance until signed-user allow/deny regression is performed.
