# CP-DB-CPU-09 — Controlled Signed Workload Isolation, Effective-Access CPU Attribution, and Importer Execution Profiling

**Date:** 2026-11-14
**Status:** IMPLEMENTED-UNVERIFIED — read-only baseline, query-plan inspection, and importer source profiling completed; controlled signed workload remains pending manual CRM sign-in.
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Baseline source:** PostgreSQL 17.6, `pg_stat_statements` 1.11, Supabase Database Observability, and signed Edge logs.

## 1. Scope and invariants

This increment adds a repeatable read-only diagnostic SQL script, acceptance tests, and an evidence report. It does not change application behavior or the database.

- No production data writes, QA fixture writes, deletes, or cleanup operations were performed.
- No role, workspace membership, permission, RLS, policy, grant, or session change was made.
- No credentials, API secrets, access tokens, or session tokens were read or copied.
- No impersonation or synthetic JWT claims were used.
- No `pg_stat_statements` reset, statistics reset, configuration change, extension install, or persistent monitoring was performed.
- `EXPLAIN` statements intentionally omit `ANALYZE`; they plan the statements but do not execute them or acquire the represented `FOR UPDATE` locks.
- The only project inspected was the existing `jtlusodorfnyzgyuewkz` Supabase project.

## 2. Runtime availability gate

The production CRM tab opened on the Mac currently displays the APSYNTRA CRM sign-in form. The canonical local Vite URL `http://127.0.0.1:5173/#/` is not listening. No existing signed CRM session was available in the browser used for this increment.

No credentials were entered or requested from the browser, and no authentication bypass or token extraction was attempted. Therefore this increment did not generate any controlled signed effective-access requests or controlled importer requests from the Mac.

The CRM sign-in page remains available for the user to sign in manually. Once the existing authorized session is active, the signed workload can be run through the application UI and correlated against the exact time window. The benchmark will not use another person's signed traffic as a substitute.

## 3. PostgreSQL measurement capabilities

Read-only database inspection at `2026-11-14 09:15:21 UTC` returned:

| Setting / capability | Value |
|---|---|
| PostgreSQL | 17.6 |
| `pg_stat_statements` | 1.11, installed in `extensions` |
| `pg_stat_statements.track` | `top` |
| `pg_stat_statements.track_planning` | `off` |
| `track_functions` | `none` |
| `track_io_timing` | `off` |
| `pg_stat_kcache` | Not installed |
| `pg_stat_statements` reset | `2026-10-20 05:09:04.110272 UTC` |

Consequences:

- The existing extension records top-level statement execution time and block counters. These are not per-function CPU measurements.
- Nested SQL inside PL/pgSQL is not separately attributed by the current `track=top` setting.
- Function-level execution counters are unavailable because `track_functions=none`.
- No per-query CPU counters are available from the installed extensions.
- The Supabase Metrics API exposes host-level metrics but requires a project secret key. It was not accessed; no secret key was retrieved.

Supabase's inspection guidance explicitly describes `pg_stat_statements` as cumulative since its reset point and recommends pairing it with the Metrics API for a matching host-metric window. See [Inspect the database](https://supabase.com/docs/guides/observability/inspect) and [Metrics API](https://supabase.com/docs/guides/observability/metrics).

## 4. Cumulative top-level RPC baseline

Snapshot captured at `2026-11-14 09:15:21 UTC` (`17:15:21 GMT+8`). All values below are cumulative since the October 20 reset, not a controlled test interval.

| RPC | Query ID | Calls | Total execution | Mean | Max | Shared hits | Shared reads |
|---|---:|---:|---:|---:|---:|---:|---:|
| `wm_list_boards` | `-8551254353028248045` | 16,895 | 6,646,401.52 ms | 393.39 ms | 7,994.61 ms | 295,952,302 | 153 |
| `apsyntra_crm_my_effective_access` | `3194171109028220051` | 2,326 | 1,711,755.61 ms | 735.92 ms | 2,827.62 ms | 22,126,225 | 0 |
| `wm_import_board_wizard_extended_atomic` | `5962890455400465064` | 846 | 1,722,545.56 ms | 2,036.11 ms | 7,774.34 ms | 46,003,964 | 1,888 |

The importer has the highest mean elapsed time among these three RPCs. That does not prove that it is the largest CPU consumer. PostgREST origin time also includes request handling outside PostgreSQL, and cumulative `pg_stat_statements` values do not isolate a controlled workload.

## 5. Current database CPU and concurrent traffic

The refreshed Supabase Database Observability report showed **5.55% average CPU** for the `Last 60 minutes` window, `16:14–17:14 GMT+8` on November 14.

The preceding CP-08 observation was 3.82% for `15:43–16:43 GMT+8`. These windows overlap by 29 minutes and are not independent before/after measurements. They must not be presented as a CPU increase caused by CP-09 or as a regression.

A five-minute Edge-log inspection (`09:11–09:16 UTC`) showed other signed traffic during the observation window:

| RPC | Signed request rows | p50 origin | p95 origin | Errors |
|---|---:|---:|---:|---:|
| `wm_import_board_wizard_extended_atomic` | 22 | 494 ms | 585.6 ms | 0 |
| `apsyntra_crm_my_effective_access` | 10 | 215 ms | 392.4 ms | 0 |
| `wm_list_boards` | 17 | 334 ms | 377.4 ms | 0 |

These requests belong to another signed actor, not the Mac's currently logged-out CRM tab. They are explicitly excluded from CP-09 controlled workload results. The paired log rows without an authenticated actor were also excluded from the signed request counts.

This concurrent importer activity is a material confounder: the CPU chart and cumulative counters cannot be used to claim that the CP-09 operator generated the observed import traffic.

## 6. Effective-access query and index findings

The current effective-access function resolves the profile and active workspace membership in one query, then evaluates workspace role, module role, personal-workspace ownership, and board membership. Supporting unique indexes exist for these access paths, including:

- `profiles_pkey (id)`;
- `workspace_members_pkey (workspace_id, user_id)`;
- `apsyntra_crm_platform_roles_pkey (workspace_id, user_id)`;
- `module_role_assignments_pkey (user_id, module_id)`;
- `ws01_member_roles_pkey (workspace_id, user_id)`;
- `ws02_personal_workspaces_pkey (user_id)`;
- `work_board_members_pkey (board_id, user_id)`.

A representative read-only `EXPLAIN` of the profile/membership lookup chose sequential scans on `profiles` and `workspace_members`, each estimated at one row. These relations are small in the current planner statistics, so sequential scans can be cheaper than index probes; the plan is not evidence of a missing index. Cumulative table counters show approximately 141.36 million sequential scans on `profiles` and 45.67 million on `workspace_members`, while the estimated live-row counts are tiny. Those counters deserve correlation with the actual nested access paths, but do not justify redundant indexes by themselves.

`work_board_items` is the larger unresolved scan signal: approximately 1,007,356 sequential scans and 14.33 billion tuples read against an estimated 40,700 live rows. The specific board-count and importer lock/match plans inspected below use existing indexes, so this cumulative table counter is not yet attributable to those RPCs. With `pg_stat_statements.track=top`, nested statements cannot be separated from the parent RPC for CPU attribution.

The controlled signed effective-access workload has not yet run because the Mac's CRM tab is logged out. Query-level CPU attribution remains unavailable for this workload. No effective-access CPU attribution is claimed.

## 7. Importer execution-path findings

The current `wm_import_board_wizard_extended_atomic` function performs the following work before processing rows:

1. Acquires a transaction-scoped advisory lock for the target board.
2. Locks the board row and validates the expected board revision and edit permission.
3. Locks all groups and columns for the board.
4. Locks all active items for the board.
5. Locks all item-value rows joined through those active items.
6. Locks board-member rows for share.

The importer then validates mappings and column metadata, loops through input rows (bounded by the RPC contract to 1–5,000), and loops through mapped row values. Update/match mode performs indexed match and revision checks. Non-empty mapped cells call `private.wm_import_set_board_cell_cached`, which validates the value, performs the appropriate item/value write, and emits the existing per-cell audit event. The RPC then updates the board timestamp, emits one import-summary event, and sends one coalesced Realtime invalidation.

The source path therefore has two important profiling dimensions:

- **Fixed per-request/board cost:** advisory lock and board-wide group/column/item/value/member locking, even when the import payload updates one existing row.
- **Payload-dependent cost:** row iteration, matching, mapped-cell validation/writes, and per-cell audit events. The outer contract permits up to 5,000 rows and 30 mappings, so this path must be measured with realistic bounded QA payloads before changing its lock footprint or audit semantics.

### Read-only plan results

- Board active-item count uses `work_board_items_active_board_count_idx` via an index-only scan.
- The importer active-item lock query uses `work_board_items_board_id_idx` and filters `archived_at IS NULL`.
- The item-value lock join uses a nested loop, the board-item index, and `work_board_item_values_pkey (item_id, column_id)`.
- Item-title matching uses `work_board_items_match_title_idx`.
- Custom text/value matching uses `work_board_item_values_match_text_idx`.

The relevant matching paths are already indexed. No index or schema change is justified by these plans alone. The broader lock footprint is a profiling candidate, not yet a proven defect; narrowing it could change concurrency guarantees and is deferred until a genuine signed QA workload and contention evidence are available.

## 8. Read-only diagnostic and tests

The reusable script is `sql/tests/cp-db-cpu-09-workload-isolation-readonly.sql`. It captures:

- statistics reset and current tracking configuration;
- the three target `pg_stat_statements` counters;
- relevant table scan/index counters and existing index definitions;
- current session wait-state counts;
- non-executing plans for board counts, importer lock queries, and importer matching predicates.

All statements are `SELECT` or `EXPLAIN` without `ANALYZE`. The script does not execute the RPCs, acquire the planned row locks, reset statistics, or modify configuration.

The test file `frontend/tests/cp-db-cpu-09-workload-isolation.test.mjs` guards the read-only contract, target query IDs, and profiling scope.

## 9. Acceptance status

| Requirement | Status | Evidence |
|---|---|---|
| Existing database/configuration baseline | VERIFIED | PostgreSQL 17.6, pg_stat_statements 1.11, reset/config values captured |
| Top-level RPC baseline | VERIFIED | Three normalized query IDs and cumulative counters captured |
| Existing effective-access indexes/plans | VERIFIED | Current indexes and representative lookup plan inspected |
| Importer lock/match plans | VERIFIED | Non-executing EXPLAIN plans inspected |
| Importer source-path profiling | VERIFIED | Board-wide lock phase, row/mapping loops, cached cell helper, audit/realtime work inspected |
| CPU window baseline | VERIFIED | 5.55% average, 16:14–17:14 GMT+8; not isolated to this workload |
| Controlled signed effective-access workload | PENDING | CRM tab requires manual sign-in; no credentials were used |
| Controlled signed importer workload | PENDING | No QA write or importer invocation was performed in this increment |
| Per-function / per-query CPU attribution | BLOCKED | `track_functions=none`, `pg_stat_statements.track=top`, no `pg_stat_kcache` |
| Schema, permissions, RLS, and settings changes | NOT APPLICABLE | None made |

## 10. Resume procedure

After the user manually signs in to the existing CRM session:

1. Capture the SQL baseline using `sql/tests/cp-db-cpu-09-workload-isolation-readonly.sql`.
2. Run a small, sequential set of ordinary UI-triggered effective-access requests and capture exact timestamps. Do not generate requests by impersonating a user or copying a token.
3. Capture a second SQL snapshot and correlate the target query-ID deltas with signed Edge logs for that same actor and interval. Exclude requests from all other actors.
4. For importer profiling, use only the designated synthetic `CP-BIMP-11 Import QA` board and a bounded, reviewed QA payload. No new columns/groups or operational-board data are in scope. Verify the authoritative audit and item state after the request.
5. Compare the same-window CPU chart and endpoint timing. State clearly that CPU remains database-wide unless an authorized per-query CPU source becomes available.

Do not change global tracking settings, install extensions, reset statistics, or narrow importer locking as part of this resume procedure. If a later optimization requires any of those changes, present the evidence and the specific impact before making that separate change.
