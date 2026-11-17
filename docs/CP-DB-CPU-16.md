# CP-DB-CPU-16 — Realtime Heartbeat Reconciliation and Redundant Board-Read Reduction

**Project:** APSYNTRA CRM  
**Repository:** `wass-psti/APSYNTRACRM`  
**Supabase project:** `jtlusodorfnyzgyuewkz`  
**Base:** `main` at `092a7a30a49cbc55caeb9133a9e397b78c505931`

## 1. Objective

Reduce avoidable database work from periodic board reconciliation while preserving signed identity, workspace, board status, and capability checks. Do not change database schemas, RPC contracts, business logic, RLS, or role semantics.

## 2. Diagnostic evidence

The 24-hour Supabase API-log sample recorded:

| RPC | Requests | Mean origin latency |
|---|---:|---:|
| `wm_get_board_shell` | 3,211 | 212 ms |
| `wm_get_board_items_page` | 3,156 | 272.1 ms |
| `wm_list_boards` | 2,701 | 423.9 ms |

Code inspection confirmed that a healthy Realtime connection still caused `PlatformSync.pollTick()` to request a full reconciliation every 90 seconds. The application invalidated the board cache and repeated board-shell, paginated-item, and board-structure reads even when no board-change broadcast had arrived.

The 30-second full polling fallback is used when Realtime is unavailable. Module-owned TimeTracker, Fund Release Tracker, FuelTrack+, and TradeLink views require their existing periodic data refreshes and are excluded from the lightweight path.

A controlled signed-context query-plan test for `wm_list_boards` completed in 116.069 ms with 615 shared-buffer hits, zero physical shared-buffer reads, and an index-only scan for active item counts. The existing item-count index strategy was therefore retained.

The three FM1 scheduled jobs measured approximately 6–9 ms average runtime in the inspected 24-hour run history. They are not currently demonstrated to be a major CPU contributor.

The cumulative table-scan and `pg_stat_statements` counters cover a longer interval and are not treated as current CPU attribution. Supabase host CPU time-series metrics were not exposed by the connected Supabase tools during this pass. No numerical CPU reduction is claimed.

## 3. Implementation

1. Keep the 90-second signed heartbeat while Realtime is healthy.
2. Introduce a five-minute maximum interval between full board snapshots for eligible generic board item views while Realtime is healthy; other views retain their existing refresh cadence.
3. Use a lightweight `heartbeat-check` reason between full sweeps.
4. Preserve the active-board list read and signed view/edit/manage capability checks during the heartbeat.
5. For generic board `items` views, skip board-shell, paginated-item, and board-structure reads during an unchanged Realtime heartbeat.
6. Do not invalidate the board snapshot cache for a lightweight heartbeat.
7. Continue full refreshes on board-change broadcasts, focus/visibility restoration, reconnect, and the bounded full-snapshot sweep.
8. Keep module-owned TimeTracker, Fund Release Tracker, FuelTrack+, and TradeLink views on their existing full-refresh cadence.
9. Keep the 30-second full signed polling fallback when Realtime is unavailable.

No production database migration or RPC change is included.

## 4. Verification

- Added platform-sync tests for the 90-second heartbeat and five-minute full-reconciliation bound.
- Added integration assertions that lightweight heartbeats retain signed edit/manage checks and do not hydrate the board snapshot or board structure.
- Existing Realtime broadcast, focus, visibility, reconnect, and polling-fallback tests remain in the suite.
- GitHub CI, full regression suite, and Pages build are pending PR checks.

## 5. Production acceptance

After merge and Pages deployment, compare equivalent windows and comparable active-user/tab counts:

- `wm_get_board_shell` calls per active board session.
- `wm_get_board_items_page` calls per active board session.
- `wm_list_boards` calls per active board session.
- Database query execution/buffer deltas.
- Supabase host CPU utilization from the Supabase Metrics API or Dashboard.

The expected functional result is immediate board updates from Realtime broadcasts, 90-second signed capability/session checks, and a full generic-board snapshot within five minutes when Realtime remains connected. When Realtime is unavailable, the existing 30-second full polling fallback remains.

A lower RPC count alone does not establish a CPU reduction. Keep CPU acceptance pending until comparable host CPU metrics are available.
