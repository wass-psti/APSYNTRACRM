# CP-CRM-PERF-01 — baseline protocol

This checkpoint introduces test-only measurement, not production application changes. Existing runtime authorization, database contracts, application workflows and deployments are unchanged. No model training or external telemetry is used.

## Reproducible automated baseline

Run the CP-CRM-PERF-01 Platform Baseline GitHub Actions workflow on the target commit. It reports 30 samples per profile and scenario, nearest-rank P50/P95, mean, minimum and maximum. The JSON summary is printed in the job log and retained as the crm-performance-baseline GitHub Actions artifact for 30 days.

- Actual repository index and frontend assets on a loopback HTTP origin, signed-out startup to visible login form and two animation frames.
- Fresh browser context for cold runs; revisit with HTTP-cache eligibility for warm runs. Compare measured decoded and transferred script/style bytes, not assumed cache hits.
- Desktop and emulated mobile viewport. Same synthetic 25-row content per registered application for isolated shell update and two-frame timing; actual production shell helper and sidebar route resolver.
- Actual board table renderer at 100 and 1,000 synthetic rows; preserve bounded virtualization. Finite existing frame sample.
- Every application is inventoried from the canonical workspace ownership manifest; no claim of signed app runtime coverage is made.
- No production credentials, writes, browser storage inspection, request bodies or external network are required.
- The startup resource timing buffer is enlarged before navigation; overflow invalidates the sample. Chromium CDP reports numeric renderer durations, heap/node/listener snapshots and a five-second synthetic idle interval; these are not host CPU or memory-leak certification.

## Production database baseline (read-only, 2026-11-27 08:46:08 UTC)

Statistics reset: 2026-10-20 05:09:04 UTC. Database connections: 21, active: 2 (including diagnostic). Selected cumulative execution totals, not CPU or matched workload:

| Operation | Calls | Total ms |
|---|---:|---:|
| wm_list_boards | 40759 | 7001737.19 |
| apsyntra_crm_my_effective_access | 27448 | 2540180.34 |
| wm_auth_access_context | 162129 | 1112000.52 |
| list_module_directory | 10564 | 973997.98 |
| wm_get_board_items_page | 22076 | 935420.20 |
| native_application_board_context | 29348 | 324724.29 |
| timetracker_clock_snapshot | 2483 | 46436.32 |

## Short production workload observation (not a controlled benchmark)

A repeat of the same read-only snapshot at 08:49:07 UTC gave a 178.75-second observation window. The stats reset timestamp and deallocation counter (24) did not change. The 13 selected operations accumulated 251 calls and 3,430.31 ms of SQL execution time. These are shared production counters across all concurrent activity, not attributed to one user, route or workload.

| Operation | New calls | Execution delta ms |
|---|---:|---:|
| list_module_directory | 16 | 1034.71 |
| apsyntra_crm_my_effective_access | 18 | 767.80 |
| list_module_state | 15 | 664.02 |
| timetracker_ot_snapshot | 15 | 301.55 |
| wm_auth_access_context | 117 | 225.42 |
| wm_list_boards | 16 | 188.55 |
| native_application_board_context | 26 | 115.59 |
| timetracker_clock_snapshot | 7 | 62.32 |
| wm_get_board_items_page | 10 | 37.12 |
| wm_get_board_shell | 10 | 23.73 |
| frt_board_dashboard_safe | 1 | 9.50 |
| tl03_documents_page / fueltrack_v3_read | 0 | 0 |

Live index metadata confirms work_board_items_active_board_count_idx already covers board_id WHERE archived_at IS NULL. The table has about 32,495 estimated live rows; work_boards about 330. Do not add an equivalent index. Reduce unnecessary catalog calls before attempting a query rewrite. A low-volume observation is not proof that historical long-tail latency has been resolved.

## Outstanding acceptance

Do not equate isolated shell/renderer timings or signed-out startup with signed application readiness. Use a disposable signed environment with representative datasets, fresh and warm application routes, actual sidebar/tab interaction, response metadata, scoped refresh, foreground/idle and two-window comparisons. Capture matched 30-minute host/process metrics and statement counter deltas without resetting shared statistics. Track failed samples separately, preserve original workloads, and report real-device limitations. Never exercise automatic attendance transitions against a production employee merely to benchmark navigation.

Proposed next gate: certify full signed application timings and matched resource workload, then rank optimization by measured user impact. No runtime or SQL optimization should be claimed from this benchmark alone.
