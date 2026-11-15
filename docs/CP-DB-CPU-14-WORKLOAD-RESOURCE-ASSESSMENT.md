# CP-DB-CPU-14 — Workload-Driven RPC Coalescing and Database Resource Assessment

**Date:** 2026-11-15
**Status:** VERIFIED AND DEPLOYED — focused regression 7/7, full frontend regression 2,292/2,292, post-merge CI, Pages deployment, live asset hash, and live Pages smoke all pass. No database configuration/index change was justified.
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `127c4d1229f060f1025cdab78c7c5095feefb7bd`
**Implementation PR:** [#404](https://github.com/wass-psti/APSYNTRACRM/pull/404)
**Merged commit:** `532dfe91a0d5987cc2c3bd789ce26e74dec68e25`
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)

## 1. Objective

Reduce avoidable database round trips without introducing persistent authorization/context caching, changing authorization semantics, increasing database concurrency, or modifying database configuration. Use the current production workload to decide whether indexing, pooling, background-worker, or memory changes are justified.

## 2. Scope and guardrails

- Coalesce only overlapping `wm_auth_access_context` reads within one `DomainApi` instance and one signed identity/token generation.
- Never cache a completed workspace-context response. Every later caller obtains a fresh server-authoritative response.
- Return an isolated clone to each caller so one consumer cannot mutate another consumer's context object.
- Reject a pending result if the signed user changes or board/workspace cache generation is invalidated while it is in flight.
- Clear pending context reads during the existing board-cache invalidation path.
- Keep each browser window independent; do not share signed context or tokens across windows.
- No RPC contract, RLS, RBAC, role, grant, membership, permission, workspace boundary, schema, index, data, database setting, extension, connection-pool size, or background job is changed.
- No statistics reset, monitoring service, scheduled task, or telemetry is added.

## 3. Production workload evidence

### 3.1 Recent Edge RPC activity

The Supabase unified Edge log query (default last-24-hour window at capture time) returned:

| RPC | Requests | Average origin time | P95 origin time | Errors |
|---|---:|---:|---:|---:|
| `wm_auth_access_context` | 1,050 | 143.8 ms | 301 ms | 0 |
| `wm_list_boards` | 857 | 170.0 ms | 514.2 ms | 0 |
| `apsyntra_role_is_bootstrap` | 853 | 144.0 ms | 289 ms | 0 |
| `apsyntra_role_is_admin` | 846 | 140.6 ms | 289 ms | 0 |
| `apsyntra_crm_my_effective_access` | 764 | 152.1 ms | 306.9 ms | 0 |
| `wm_get_board_items_page` | 66 | 153.4 ms | 502 ms | 3 |
| `wm_get_board_shell` | 65 | 142.3 ms | 367.2 ms | 3 |
| `wm_import_board_wizard_extended_atomic` | 2 | 436 ms | 828.4 ms | 0 |

The log window showed three signed users for the principal read endpoints. Origin time includes request/edge/backend latency; it is not PostgreSQL CPU time.

A second read-only aggregation of the actor-attributed Edge events found 544 `wm_auth_access_context` calls in the filtered actor-present subset. Forty-six were additional same-actor/same-path events in seconds containing multiple requests. Those may be legitimate independent windows; they are not claimed as duplicate calls that can all be removed. The new coalescer operates only inside a single browser window/API instance.

### 3.2 Cumulative PostgreSQL statement statistics

`pg_stat_statements` showed cumulative high call counts and elapsed time, including `wm_list_boards` (17,416 calls, 381.96 ms mean) and legacy `wm_get_board` (16,560 calls, 76.95 ms mean). These values are cumulative and include historical traffic; they are not a current 24-hour rate. Current 24-hour Edge logs contained no `wm_get_board` requests, so no legacy RPC removal is justified.

### 3.3 Connection and temporary-I/O observation

Read-only snapshot:

- 19 database sessions observed against `max_connections=60`.
- 2 active sessions: the management API query and a Realtime WAL sender.
- 0 idle-in-transaction sessions.
- No blocked application session pair or deadlock observed.
- The Realtime sender's `Client / WalSenderWaitForWal` wait is a client/WAL wait, not evidence of application query contention.
- `work_mem=3500` (PostgreSQL setting unit kB), `statement_timeout=120000`, autovacuum enabled, and no change made.
- Temporary bytes (55.66 GB) and 14,713 temporary files are cumulative counters with no per-RPC attribution. The inspected top application RPC statements had zero temp blocks written.

There is no evidence to increase pool sizes, `max_connections`, `work_mem`, worker counts, or statement timeouts in this increment.

### 3.4 Index findings

The live Performance Advisor reported 158 unindexed foreign keys, one duplicate-index finding, and one Auth connection-strategy notice. The two duplicate partial unique indexes on `public.material_tracker_materials` are both 16 kB, have identical definitions, zero observed scans, and neither is owned by a PostgreSQL constraint. Their small size and lack of workload evidence do not justify a production DDL change in this increment.

Largest unindexed FK candidates inspected:

| Table / FK | Estimated rows | Size | Decision |
|---|---:|---:|---|
| `work_board_events.actor_id` | 349,879 | 138 MB | Keep as candidate; event list reads filter by `board_id`, already indexed; no actor-filter hot path established |
| `work_board_item_values.updated_by` | 344,964 | 108 MB | Keep as candidate; normal cell reads use existing `(item_id,column_id)` and `(column_id,item_id)` indexes; no updated_by hot filter established |
| `work_board_items.created_by` / `updated_by` | 44,300 | 20 MB | Keep as candidate; normal board reads use existing board/position indexes; FK-only indexes do not explain all historical scans |

The `work_board_items` table has cumulative `seq_scan=1,007,357` and `seq_tup_read=14,328,495,061`, but only 44,300 estimated live rows and 1,604,397 index scans. These are cumulative counters with no reset timestamp available in the captured view. They cannot establish current scan rate or the responsible statement. The latest analyze/autovacuum timestamps are recorded in the read-only SQL artifact. No speculative index is added.

### 3.5 Database workload conclusion

The current evidence points to repeated read round trips and historical table-scan counters, not connection exhaustion, active lock contention, or application-RPC temp spills. A broad connection-pool/configuration/index sweep would add risk and write overhead without a proven workload benefit.

## 4. Implementation

`frontend/data.js` now maintains a `contextPending` map for `wm_auth_access_context`.

- Keyed by signed user ID, current access token, and a dedicated workspace-context generation.
- Only concurrent requests with the exact same key share one pending promise.
- Completed responses are removed from the map; no TTL or persistent cache is introduced.
- Full workspace/session invalidation clears pending context reads and increments the dedicated context generation. A board-specific mutation does not invalidate an unrelated context read.
- A result is rejected if identity or generation changes before it resolves.
- Each caller receives `structuredClone(ctx)` to preserve object isolation.
- The server-side `wm_auth_access_context` RPC and its authorization logic remain unchanged.

New regression file: `frontend/tests/cp-db-cpu-14-context-read-coalescing.test.mjs`.

Read-only diagnostic artifact: `sql/tests/cp-db-cpu-14-readonly-workload-baseline.sql`.

## 5. Acceptance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Production RPC activity inventoried | VERIFIED | 24-hour Edge log aggregation |
| Connection and active wait snapshot | VERIFIED | Read-only `pg_stat_activity` query |
| Application RPC temp-block attribution | VERIFIED | Read-only `pg_stat_statements` snapshot |
| High-volume FK/index candidates ranked | VERIFIED | Catalog + table-statistics inventory |
| No speculative DB configuration/index change | VERIFIED | No production DDL or setting change |
| Concurrent context read coalescing | VERIFIED | `DomainApi.contextPending`; 7 focused tests and post-merge browser acceptance |
| Completed context reads remain uncached | VERIFIED LOCALLY | Sequential-read regression test |
| Invalidation and identity changes reject stale reads | VERIFIED LOCALLY | Regression tests |
| Focused CP-14 regression | VERIFIED | 7/7 passed |
| Full frontend regression | VERIFIED | 2,292/2,292 passed |
| Shipped JavaScript syntax | VERIFIED | All frontend `.js` files passed `node --check` |
| GitHub Pages source guard | VERIFIED | `scripts/verify-pages-source.mjs` PASS |
| Git diff integrity | VERIFIED | `git diff --check` PASS |
| Production deployment | VERIFIED | PR #404 / commit `532dfe91`; Pages deployment run `43705464560` succeeded |
| Live asset integrity | VERIFIED | `frontend/data.js` SHA-256 matches deployed asset exactly |
| Live Pages smoke | VERIFIED | Expected-SHA smoke passed against `532dfe91` |
| Live workload reduction measurement | PENDING | Requires subsequent actual signed-user traffic; no CPU reduction claimed |

## 6. Explicit non-goals

- No database migration or production index creation/deletion.
- No change to Auth connection allocation strategy.
- No `max_connections`, `work_mem`, autovacuum, worker, or timeout tuning.
- No persistent cache, cross-window token sharing, or permission-result caching.
- No background process, polling, scheduled monitoring, or telemetry.
- No RLS/RBAC/role/grant/membership/workspace change.
- No removal of legacy `wm_get_board`; current 24-hour Edge logs did not show calls.

## 7. Decision

CP-DB-CPU-14 is VERIFIED AND DEPLOYED. It implements a narrow frontend-side reduction of overlapping signed workspace-context reads and records a reproducible read-only production resource baseline. It deliberately does not claim that historical sequential scans are currently occurring at the same rate, that all same-second events are duplicates, or that CPU utilization has been reduced. Further indexes, pool changes, and configuration tuning remain unjustified until a specific hot predicate or saturation event is reproduced with a comparable time-window measurement. No successor database optimization is justified by the current evidence.
