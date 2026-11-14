# CP-DB-CPU-13 — Stable RLS Authorization Helper Initplan Optimization

**Date:** 2026-11-14
**Status:** IMPLEMENTED-UNVERIFIED — migration and tests are implemented; disposable PostgreSQL 17 acceptance passed. Production activation and signed-user runtime regression are pending.
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `d0f36120c231e2b0f0134c134d09522e256fc99a`
**Branch:** `perf/cp-db-cpu-13-stable-rls-helper-initplans`

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

Migration: `supabase/migrations/20261114153218_cp_db_cpu_13_stable_rls_helper_initplan_optimization.sql`

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

## 6. Acceptance status

| Requirement | Status | Evidence |
|---|---|---|
| Stable helper volatility verified | VERIFIED | `pg_proc.provolatile = 's'` for all three functions |
| 13 target policies inspected | VERIFIED | Live `pg_policies` inventory |
| Policy-preserving migration authored | IMPLEMENTED | 13 `ALTER POLICY` statements |
| Static regression | VERIFIED | 5/5 passed |
| PostgreSQL 17 syntax/application | VERIFIED | Disposable fixture |
| Predicate equivalence | VERIFIED | Normalized pre/post USING and WITH CHECK comparison |
| Production migration | PENDING | Not applied |
| Post-activation scan-rate and CPU comparison | PENDING | Capture same counters after representative signed traffic |
| Signed-user allow/deny regression | PENDING | Requires an authenticated CRM application session |

**Decision:** Ready for controlled activation after CI. Do not declare CPU reduction until post-activation scan-rate and runtime measurements are collected under comparable signed-user traffic.
