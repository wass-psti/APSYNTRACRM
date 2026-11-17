# CP-DB-CPU-16 — Cooperative Cross-Window Poll Audits and Attribution

**Repository:** wass-psti/APSYNTRACRM
**Existing database:** jtlusodorfnyzgyuewkz
**Date:** November 17, 2026
**Scope:** Browser periodic synchronization + read-only production workload attribution.

## Confirmed issue

On the previous main baseline, every visible signed window performed a complete database-backed reconciliation every 90 seconds even when its private Realtime socket was healthy. These duplicate audits independently retrieved authenticated context, workspace board catalogs, and role information.

The optimization addresses the 90-second *periodic* audit only. Realtime broadcasts, on-focus reconciliation, visibility restoration, network recovery, and reconnect verification retain independent server-authoritative reads.

## Bounded implementation

- Use origin-scoped Web Locks with `mode:'exclusive'` and `ifAvailable:true`; one tab performs the signed periodic audit at a time for a specific signed user/workspace.
- Share only the timestamp of a successful audit in browser-local storage, keyed by authenticated user/workspace identifiers. **No JWT, board items, roles, personal records, or credentials are stored in the marker.**
- Peers skip recently completed periodic audits when their own fail-safe audit is not due.
- Regardless of peer activity, each active Realtime tab performs its own periodic authoritative recovery audit within a nominal 270-second deadline (subject to the existing serialized in-flight reconciliation and browser scheduling).
- Failed signed audits never publish success. A failed lock/storage operation falls back to the pre-existing individual signed poll.
- In polling fallback (Realtime unavailable), all tabs retain their own 30-second signed polling. No coordination applies.
- The browser releases Web Locks on tab closure or navigation. A new tab can acquire the lock on its next scheduled tick, without a persistent leader or background agent.
- No network telemetry, database changes, authorization-policy changes, permanent agent, additional runtime dependency, or new Supabase project.

**Limitations:** This is bounded cooperative deduplication, not an active distributed state cache. Follower tabs do not accept another tab's data as authorization or source of truth. Some periodic audits remain deliberately redundant to protect missed-event recovery. Browser throttling can delay scheduled ticks, as it does with the original implementation.

## Supabase read-only attribution

The following are cumulative `pg_stat_statements` counters since the database statistics epoch beginning October 20, 2026, **not CPU seconds and not a 24-hour workload:**

| RPC | Calls | Cumulative execution ms | Average ms |
|---|---:|---:|---:|
| wm_list_boards | 21,807 | 6,724,079 | 308.34 |
| wm_import_board_wizard_extended_atomic | 1,326 | 1,897,612 | 1,431.08 |
| apsyntra_crm_my_effective_access | 5,644 | 1,761,312 | 312.07 |
| legacy wm_get_board | 16,770 | 1,352,798 | 80.67 |

For the predeployment API-log interval **2026-11-17 06:30:00Z–07:25:00Z**, observed POST request counts were:

| RPC | Calls | Mean origin time ms |
|---|---:|---:|
| wm_auth_access_context | 924 | 180.6 |
| work_board_access | 765 | 190.0 |
| wm_list_boards | 322 | 351.2 |
| apsyntra_crm_my_effective_access | 181 | 202.3 |

These endpoints have other callers, so the browser coordination cannot eliminate all their requests. Query elapsed time does not measure CPU directly. The observed Supabase dashboard reading of ~40% CPU is not a clean before/after measurement for this change.

**Outstanding attribution**: identify the caller of legacy `wm_get_board`, measure importer activity independently, and investigate `work_board_items` sequential scans using query plans before considering index or RPC changes. All database investigations here were read-only.

## Verification

- Unit tests cover two tabs, concurrent contenders, failure recovery, workspace isolation, expired/stopped scopes, local auditing after missed broadcasts, unavailable storage and locks, and unchanged focus/broadcast behavior.
- Real synthetic Chromium two-tab acceptance uses Web Locks and same-origin localStorage without production authentication.
- Full frontend `npm test`, `npm run check`, `npm run build`, and `git diff --check` required.
- Production acceptance requires deployed source readback, GitHub CI, signed browser behavior, and comparable production CPU/API counts. **No CPU reduction or final production performance acceptance is claimed before those measurements exist.**

## Follow-up acceptance metric

Observe equivalent workloads before/after deployment with number of tabs and active signed users held approximately constant. Compare:
- 90-second periodic audit rate per user/workspace under two and three visible Realtime-connected windows.
- `wm_list_boards`, `wm_auth_access_context`, role RPCs, and board-read requests/minute.
- Database CPU (Supabase Metrics API/Database Reports), latency/error rates and user-visible missed-event recovery.
- Rollback rates, sequential scans, import workloads, and number of active application sessions.

The CPU target is **measurable and sustainable improvement** without functional regressions, not an assumed fixed percentage.
