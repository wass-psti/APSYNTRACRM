# CP-DB-CPU-13 — Stable RLS Authorization Helper Initplan Optimization

**Date:** 2026-11-14
**Status:** IMPLEMENTED-UNVERIFIED — production migration applied; 13/13 live policy checks passed and the Performance Advisor initplan finding count remains zero. Post-activation scan-rate and signed-user runtime regression are pending.
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `d0f36120c231e2b0f0134c134d09522e256fc99a`
**Merged commit:** `5eaa279eef7c16d5cb18c1623e1c5e8a46210629`
**Remote migration history version:** `20261114154136`
**Migration history name:** `cp_db_cpu_13_stable_rls_helper_initplan_optimization`

## 1. Objective

Reduce repeated per-row evaluation of stable authorization helpers in RLS policies. CP-DB-CPU-12 addressed direct `auth.uid()` and workspace-GUC evaluation; this increment addresses stable helper calls that remained unwrapped:
- `current_workspace_id(...)`
- `has_module_access(...)`
- `is_platform_admin(...)`

All three are verified `STABLE` functions. They depend on the signed request/session context and explicit constant arguments, not on the candidate row. Scalar subqueries allow PostgreSQL to evaluate them once per statement as initplans.

## 2. Workload evidence captured before this increment

Current `pg_stat_user_tables` cumulative counters:

| Table | Sequential scans | Sequential tuples read | Estimated live rows |
|---|---:|---:|---:|
| `profiles` | 141,433,717 | 4,024,969,455 | 1 |
| `workspace_members` | 45,678,574 | 2,000,233,907 | 4 |
| `ws01_lifecycle_flags` | 43,505,084 | 43,505,083 | 1 |

These counters are evidence of very frequent table scans, not proof that a single policy or function caused every scan. The stable helper definitions and 13 live policy expressions were inspected before selecting the target set.

## 3. Exact scope

Migration: `supabase/migrations/20261114154136_cp_db_cpu_13_stable_rls_helper_initplan_optimization.sql`

Exactly 13 existing policies are altered:
- Five Huly document/event policies.
- Four APS AIMS policies.
- Two self/admin profile and module-role policies.
- Two Order Intake read policies.

Expression wrappers added:
- `current_workspace_id(...)`: 13.
- `has_module_access(...)`: 7.
- `is_platform_admin(...)`: 6.

Row-dependent `work_board_access(board_id, ...)` remains unchanged and is not hoisted. No policy identity, table, role target, command, permissive mode, predicate meaning, membership rule, workspace rule, or effective permission is intentionally changed.

## 4. Explicit non-goals

- No roles, grants, revokes, memberships, permissions, or workspace boundaries changed.
- No RLS enable/disable/force changes.
- No policy creation or deletion.
- No index additions/removals; the three high-scan tables are very small, and index changes are not justified by current evidence.
- No function body, volatility, security-definer setting, search path, RPC contract, cache, database setting, or application behavior changes.
- No hoisting of row-dependent helpers.

## 5. Verification

- Static regression: exactly 13 policy alterations; 13 workspace, 7 module-access, and 6 platform-admin helper wrappers; row-dependent board-access checks retained.
- Disposable PostgreSQL 17 fixture: all 13 `ALTER POLICY` statements executed in a transaction.
- Baseline fixture reflects the live CP-DB-CPU-12 policy state, including existing `(SELECT auth.uid())` wrappers.
- Normalized pre/post USING and WITH CHECK expressions matched exactly after removing only the three new stable-helper scalar wrappers.
- All 13 policy identities, roles, commands, permissive modes, and USING/WITH CHECK presence remained unchanged.
- Transaction rolled back; no fixture data retained.

### Production activation verification

- Supabase migration API applied the migration to the existing project `jtlusodorfnyzgyuewkz`.
- Remote migration history: version `20261114154136`, name `cp_db_cpu_13_stable_rls_helper_initplan_optimization`; repository filename is synchronized to this version.
- Read-only live verifier: **13 expected / 13 passing / 0 mismatches**.
- Live helper wrapper counts: **13** `current_workspace_id`, **7** `has_module_access`, **6** `is_platform_admin`.
- Performance Advisor `auth_rls_initplan` findings remain **0** after CP-DB-CPU-12 and CP-DB-CPU-13.
- The cumulative table scan counters have not yet been converted into a post-activation rate comparison; no CPU reduction is claimed.
- Signed-user functional allow/deny regression remains pending.

## 6. Acceptance status

| Requirement | Status | Evidence |
|---|---|---|
| Stable helper volatility verified | VERIFIED | `pg_proc.provolatile = 's'` for all three functions |
| 13 target policies inspected | VERIFIED | Live `pg_policies` inventory |
| Policy-preserving migration authored | IMPLEMENTED | 13 `ALTER POLICY` statements |
| Static regression | VERIFIED | 5/5 passed |
| PostgreSQL 17 syntax/application | VERIFIED | Disposable fixture |
| Predicate equivalence | VERIFIED | Normalized pre/post USING and WITH CHECK comparison |
| Production migration | VERIFIED | Supabase migration history version `20261114154136`; name `cp_db_cpu_13_stable_rls_helper_initplan_optimization` |
| Post-activation policy inventory | VERIFIED | 13/13 policies; 0 mismatches |
| Post-activation stable-helper wrappers | VERIFIED | 13 workspace, 7 module-access, 6 platform-admin wrappers |
| Performance Advisor initplan findings | VERIFIED | Remain at 0 |
| Post-activation scan-rate and CPU comparison | PENDING | Requires comparable signed traffic and a rate-based measurement window |
| Signed-user allow/deny regression | PENDING | Requires an authenticated CRM application session |

**Decision:** CP-DB-CPU-13 is active in the existing Supabase project. Policy metadata and stable-helper wrappers are verified, but CPU reduction is not yet proven. Keep the increment IMPLEMENTED-UNVERIFIED until post-activation scan-rate comparison and signed-user allow/deny regression are complete.
