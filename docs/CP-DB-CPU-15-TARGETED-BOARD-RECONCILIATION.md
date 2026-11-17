# CP-DB-CPU-15 — Targeted Board Reconciliation and Workload Reduction

**Project:** APSYNTRA CRM  
**Repository:** `wass-psti/APSYNTRACRM`  
**Supabase project:** `jtlusodorfnyzgyuewkz`  
**Date:** 2026-11-17  
**Status:** IMPLEMENTED — production workload impact pending deployment and comparable post-deployment measurement

## Objective

Reduce avoidable Supabase work during multi-window board synchronization without changing database contracts, board persistence, business workflows, or existing authorization behavior.

## Diagnostic window and limitations

The API-log sample covers approximately 24 hours: 2026-11-16 06:05:05 UTC through 2026-11-17 06:05:05 UTC.

The PostgreSQL statistics below are cumulative counters from the active statistics epoch, not a normalized 24-hour CPU sample:

- `work_board_items`: 1,007,367 sequential scans and approximately 14.33 billion tuples read.
- `profiles`: approximately 148.42 million sequentially scanned tuples.
- `workspace_members`: approximately 48.98 million sequentially scanned tuples.
- `private.ws01_lifecycle_flags`: approximately 46.72 million sequentially scanned tuples.
- Database transaction rollbacks: approximately 45.59 million.
- Temporary data written: approximately 70 GB.
- Deadlocks in the inspected database snapshot: 0.

These counters identify investigation targets; they do not establish that the corresponding work occurred within the 24-hour log window or directly consumed the reported CPU percentage.

## API workload observations

| Endpoint | Requests in sampled window | Mean origin latency | P95 origin latency |
|---|---:|---:|---:|
| `wm_get_board_shell` | 3,211 | 212 ms | 346.5 ms |
| `wm_get_board_items_page` | 3,156 | 272.1 ms | 404 ms |
| `wm_list_boards` | 2,701 | 423.9 ms | 692 ms |
| Legacy `wm_get_board` | 210 | 684.4 ms | 1,152 ms |
| `wm_import_board_wizard_extended_atomic` | 216 | 503.5 ms | 714.5 ms |
| `wm_import_extended_refs_read` | 497 | 146.5 ms | 187.2 ms |

The legacy `wm_get_board` calls were concentrated in a roughly ten-minute period and associated with one actor. The logs did not expose a useful referrer or user-agent value, so the originating client remains unattributed. No caller was removed on this evidence alone.

A controlled read-only `wm_list_boards` execution-plan probe completed in 116.069 ms with 615 shared-buffer hits, zero physical shared-buffer reads, and an index-only scan for active-board item counts over 40,304 items. This supports retaining the current index strategy rather than adding an unproven index.

Three active Feedmill scheduled jobs were also inspected. They run every 30 seconds, with observed mean execution durations in the approximate 6–9 ms range and no failures in the inspected 24-hour period. They were not demonstrated to be a major CPU contributor and were left unchanged.

## Verified application inefficiency

The signed reconciliation path previously performed a complete `wm_list_boards` read after every targeted board broadcast, including when the current view was already an individual board.

For an open board, the subsequent signed board snapshot already returns the authoritative board row, including its active status and refreshed item counts. The workspace-wide catalog request was therefore redundant for that event.

The optimization does not remove signed identity checks, workspace-context reads, `work_board_access` checks, edit/manage checks, board-structure reads, or authoritative board snapshot retrieval.

## Implementation

Changed files:

- `frontend/platform-sync.js`
  - Added the explicit `shouldRefreshWorkspaceBoardList` reconciliation policy.
- `frontend/app.js`
  - Skip the workspace board-list RPC only for a targeted broadcast while viewing an individual board.
  - Continue refreshing the catalog for all non-broadcast reconciliation and broadcasts received outside an individual board view.
  - Patch the current board's catalog entry from the signed authoritative board snapshot, including refreshed board metadata and item counts.
  - If the signed snapshot shows the board is no longer active, refresh the active catalog and route back to the boards view.
  - Preserve existing signed user/workspace checks, view authorization, role verification, unsaved-editor protection, and cross-window invalidation behavior.
- `frontend/tests/board-cache-channel.test.mjs`
  - Updated the overview/catalog assertion to reflect the conditional catalog refresh.
- `frontend/tests/cp-db-cpu-15-targeted-board-reconciliation.test.mjs`
  - Added policy and application-integration regression coverage.

No SQL migration, schema change, index change, RPC contract change, production data write, or scheduled-job change was made.

## Verification

- Targeted synchronization/cache/session/frontend tests: 55 passed, 0 failed.
- Full frontend test suite: 2,574 passed, 0 failed.
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Production browser/session acceptance: pending deployment.
- Comparable post-deployment Supabase API and CPU measurement: pending deployment and observation window.

The build emits existing non-blocking notices for the non-module startup guard script and large application chunks. They did not fail the build.

## Acceptance and remaining limitations

The implementation is verified locally but its production performance effect is not yet verified. A CPU percentage cannot be derived from `pg_stat_statements.total_exec_time`, API origin latency, or cumulative sequential-scan counters.

After deployment, compare an equivalent workload window using Supabase's resource metrics and API logs. At minimum, measure:

1. `wm_list_boards` request rate, latency, and error rate.
2. `wm_get_board_shell` and `wm_get_board_items_page` request rates.
3. Database CPU utilization and query workload under comparable active-window counts.
4. Multi-window propagation after board item, metadata, archive, and restore changes.
5. Behavior when the viewed board becomes archived, trashed, deleted, or inaccessible.
6. Session/workspace changes and unsaved editor preservation.

Do not claim a CPU percentage reduction until the production before/after measurements are available. The remaining cumulative scan counters, rollback attribution, legacy full-board caller, import workload, and any resource-specific CPU pressure require separate attribution if they remain material after this change.
