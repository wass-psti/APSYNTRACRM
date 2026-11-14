# CP-DB-CPU-11 — Query-Level CPU Attribution Feasibility, Instrumentation Cost Review, and Importer Contention Decision

**Date:** 2026-11-14  
**Status:** IMPLEMENTED-UNVERIFIED — live read-only database and log inspection completed; repository CI and local regression execution remain pending because Desktop Commander has no connected device.  
**Repository:** `wass-psti/APSYNTRACRM`  
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)  
**Database:** PostgreSQL 17.6  
**Branch:** `perf/cp-db-cpu-11-attribution-feasibility`

## 1. Scope and guardrails

This increment evaluates query-level CPU attribution, instrumentation overhead, effective-access observability, and importer contention using existing read-only platform capabilities.

- No production data was inserted, updated, deleted, or cleaned up.
- No role, membership, permission, RLS policy, grant, schema, index, database setting, extension, or credential was changed.
- No statistics were reset.
- No extension was installed.
- No restart, monitoring service, scheduled job, or background process was introduced.
- No importer RPC was invoked.
- No application session was impersonated.
- No other user's signed workload was treated as the user's controlled workload.
- All database inspections used read-only SELECT queries.
- The existing CP-10 synthetic QA data remains untouched.

## 2. Verified platform and instrumentation inventory

The existing Supabase project is `ACTIVE_HEALTHY`, region `ap-southeast-2`, running PostgreSQL `17.6.1.165` (engine 17).

A live read-only snapshot at `2026-11-14 14:00:45.830 UTC` returned:

| Capability | Observed state | Attribution consequence |
|---|---|---|
| `pg_stat_statements` | 1.11 installed | Cumulative normalized statement execution and block counters |
| `pg_stat_statements.track` | `top` | Nested statements are not separately attributed |
| `pg_stat_statements.max` | 5,000 | Bounded statement entries |
| `track_functions` | `none` | Function tracking is currently disabled |
| `track_io_timing` | `off` | Per-block I/O timing is not collected |
| `pg_stat_kcache` | Not available in the extension catalog | No supported per-query kernel CPU counter identified |
| `pg_stat_monitor` | Available version 2.1, not installed | Not currently collecting statistics |
| `shared_preload_libraries` | Does not include `pg_stat_monitor` | Installing/using it would require a preload/configuration and restart path |

The PostgreSQL statistics reset timestamp is `2026-10-20 05:09:04.110272 UTC`. Current `pg_stat_statements` and function counters are cumulative; they are not a per-request time window.

### Important function-counter qualification

The read-only `pg_stat_user_functions` view returned six rows, including one recorded call for `apsyntra_crm_my_effective_access` and supporting functions. However, the live `track_functions` setting is `none`. Those counters cannot be assumed to represent current requests or a controlled interval; they may predate the current setting. They are not accepted as current signed-workload attribution.

## 3. Current cumulative statement evidence

A single read-only snapshot at `2026-11-14 14:00:45.830 UTC` returned:

| RPC | Calls | Total execution | Mean execution | Shared buffer hits | Shared reads |
|---|---:|---:|---:|---:|---:|
| `wm_list_boards` | 17,102 | 6,648,511.33 ms | 388.76 ms | 296,236,128 | 153 |
| `wm_import_board_wizard_extended_atomic` | 927 | 1,743,303.80 ms | 1,880.59 ms | 48,669,742 | 2,011 |
| `apsyntra_crm_my_effective_access` | 2,516 | 1,714,414.06 ms | 681.40 ms | 22,435,464 | 0 |

These counters have accumulated since the October 20 reset. They combine traffic from multiple actors and workloads. They are useful for prioritizing elapsed-time investigation, but they do not identify CPU time or assign work to a particular signed user.

In particular, the importer’s high cumulative and mean elapsed time is not proof of CPU saturation or lock contention. CP-10's bounded signed runs remain the only controlled importer samples in this evidence set:

- 3 rows / 9 mapped cells: 55.531 ms PostgreSQL top-level elapsed.
- 25 rows / 75 mapped cells: 115.099 ms PostgreSQL top-level elapsed.
- Both completed in one batch, with all requested rows created and verified.
- The 25-row run amortized the fixed per-request cost; it did not justify changing indexes or lock semantics.

PostgreSQL execution elapsed time is not CPU time.

## 4. Signed request and database-log correlation feasibility

Supabase unified logs were inspected read-only for the 24-hour window `2026-11-13 14:01 UTC` through `2026-11-14 14:01 UTC`.

Observed event counts:

| Log source | Events |
|---|---:|
| `postgres_logs` | 86,474 |
| `edge_logs` | 25,005 |
| `auth_logs` | 1,463 |
| `pgbouncer_logs` | 542 |
| `realtime_logs` | 231 |
| `storage_logs` | 137 |
| `postgrest_logs` | 119 |
| `workflow_run_logs` | 108 |
| `auth_audit_logs` | 74 |
| `function_logs` | 42 |
| `function_edge_logs` | 40 |

The Edge log schema includes request-level identifiers and signed identity context, including `request_id`, `trace_id`, `request.sb.auth_user`, and JWT subject/session metadata. These can isolate an authenticated HTTP request and its Edge-origin duration.

The PostgreSQL log schema exposes database-side fields including `parsed.query_id`, `parsed.session_id`, `parsed.process_id`, `parsed.user_name`, `parsed.application_name`, and `parsed.query`. The inspected PostgreSQL log attributes do not include the Edge `request_id`, `trace_id`, or authenticated application user identifier.

Therefore, the available evidence can:
- isolate a signed request at the Edge layer;
- identify normalized PostgreSQL statement classes and cumulative elapsed time;
- inspect PostgreSQL sessions, waits, and blockers at a point in time.

It cannot reliably join a specific signed Edge request to its PostgreSQL backend session using the fields observed in these logs. Nor can it derive CPU time from Edge `response.origin_time` or PostgreSQL statement duration.

Supabase's November 10, 2026 Correlated Logs feature adds request-, trace-, and user-oriented navigation in Studio. The currently observed PostgreSQL log schema still lacks the shared Edge request/trace identifiers required to attribute a database CPU sample to the originating signed actor. This feature improves request investigation but does not itself create per-query CPU counters.

## 5. Instrumentation cost and decision

### `pg_stat_monitor`

The extension catalog advertises version 2.1, but the extension is not installed and is absent from `shared_preload_libraries`.

Upstream installation guidance requires loading `pg_stat_monitor` at PostgreSQL startup, allocating additional shared memory, changing `shared_preload_libraries`, and restarting PostgreSQL. It provides query performance metadata, origins, planning/execution details, and time buckets. It is not a per-query kernel CPU accounting source.

**Decision:** Do not install it for this increment. It adds shared-memory and operational/restart cost without resolving the specific requirement for direct per-query CPU attribution.

### `pg_stat_kcache`

It is not present in the project's available extension inventory. No supported installation route was established for this managed Supabase project. Do not attempt to install third-party binaries or change the project environment.

**Decision:** Not available as a production measurement path in the current project.

### Function tracking

Changing `track_functions` from `none` would alter database-wide instrumentation behavior and still provide function execution time, not kernel CPU time. It would also not solve signed-user attribution when multiple actors share the same database role.

**Decision:** Do not enable global function tracking for this increment. Existing historical function counters are not treated as current measurements.

### I/O timing and query plans

Enabling `track_io_timing` would add timing instrumentation and could help distinguish I/O wait from execution time, but it does not provide CPU time. Read-only `EXPLAIN` can expose estimated plans; `EXPLAIN ANALYZE` executes the statement and is not suitable for invoking the production importer function.

**Decision:** Keep the existing setting unchanged. Use existing block counters and non-executing plans only where needed.

### Host CPU metrics and Supabase logs

The Supabase Database Observability CPU chart and Metrics API provide host/database-level metrics, not per-query CPU accounting. Matching them to a controlled interval is useful for a bounded experiment but cannot allocate CPU among concurrent SQL statements. The Metrics API requires a project secret key; no secret was retrieved or used.

**Decision:** Use host CPU as contextual evidence only. Do not claim per-query attribution.

## 6. Importer contention assessment

A read-only live snapshot at `2026-11-14 14:01:47.286 UTC` returned:

| Signal | Value |
|---|---:|
| Active sessions | 2 |
| Active sessions waiting on an event | 1 |
| Blocked session pairs | 0 |
| Database deadlocks since statistics reset | 0 |
| Cumulative temporary bytes | 48,663,370,316 |
| `track_functions` | `none` |

The single active wait was `Client / WalSenderWaitForWal`, not a row-lock or heavyweight-lock wait. The other active session had no wait event. No blocked session pair was observed.

The earlier count of 15 sessions with a non-null wait event included non-active sessions (for example, idle client waits); it must not be interpreted as 15 contending queries.

The cumulative temporary-byte counter spans the full statistics interval and is not attributable to the importer or to a specific signed actor.

No importer-specific lock wait, deadlock, or current contention was demonstrated by this snapshot. The CP-10 controlled import samples also showed one atomic batch per run, zero temp blocks written for those measured statement deltas, and favorable per-row amortization.

**Decision:** No importer lock narrowing, concurrency semantic change, index addition, or query rewrite is justified. Keep the current importer behavior and board-wide lock contract unchanged.

## 7. Acceptance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Existing project and PostgreSQL version verified | VERIFIED | Supabase project metadata and live SQL |
| Current tracking and extension inventory | VERIFIED | Read-only settings and extension catalog |
| Cumulative RPC performance baseline | VERIFIED | Three target query IDs and current cumulative counters |
| Edge signed-request identifiers inventoried | VERIFIED | Unified Edge log attribute inventory |
| PostgreSQL log identifiers inventoried | VERIFIED | Unified PostgreSQL log attribute inventory |
| Edge-to-Postgres request/session correlation | BLOCKED | No shared request/trace/user field observed in PostgreSQL logs |
| Direct per-query CPU attribution | BLOCKED | No pg_stat_kcache; pg_stat_statements is elapsed-time and block counters |
| pg_stat_monitor cost evaluated | VERIFIED | Available but uninstalled; requires preload/shared memory/restart; does not provide kernel CPU attribution |
| Function-statistics suitability | VERIFIED | Current track_functions=none; returned counters are not current-interval evidence |
| Importer contention assessment | VERIFIED | No blocked pairs or deadlocks; CP-10 bounded samples remain healthy |
| Production schema/configuration/extension changes | NOT APPLICABLE | None performed |
| Repository tests and CI | PENDING | Desktop Commander device disconnected; PR CI not yet executed |

## 8. Final engineering decision

**No production instrumentation or importer optimization is warranted by the evidence gathered in CP-DB-CPU-11.**

The project already has low-overhead cumulative query elapsed-time statistics and host-level CPU metrics. The missing capability is direct per-query CPU accounting tied to a signed application actor. The available extension candidate, `pg_stat_monitor`, introduces a preload/restart cost and does not provide the required kernel CPU attribution. Function tracking and I/O timing would add overhead or configuration changes without closing that gap.

The correct outcome is to retain the current database configuration and importer behavior. Do not create an artificial optimization or add monitoring solely to satisfy a checklist.

## 9. References

- Supabase [Inspect the database](https://supabase.com/docs/guides/observability/inspect) — cumulative statistics, query performance checks, and session/lock diagnostics.
- Supabase [pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) — statement elapsed-time and block statistics.
- Supabase [Customizing Postgres configs](https://supabase.com/docs/guides/database/custom-postgres-config) — configuration changes are advanced and can affect stability.
- Supabase [Correlated Logs, November 10, 2026](https://supabase.com/changelog/53230-correlated-logs) — requestId, traceId, and userId navigation in Studio.
- Percona [pg_stat_monitor](https://github.com/percona/pg_stat_monitor) — startup preload and shared-memory requirement.

## 10. Next step

If the repository tests and CI pass, CP-DB-CPU-11 can close with direct per-query CPU attribution explicitly documented as a platform/instrumentation limitation, not an application defect.

Do not automatically create CP-DB-CPU-12. Only propose another priority if a new, measurable issue appears or the user explicitly requests additional instrumentation work.
