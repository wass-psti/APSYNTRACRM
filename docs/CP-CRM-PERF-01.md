# CP-CRM-PERF-01 — baseline protocol

This checkpoint introduces test-only measurement, not production application changes. Existing runtime authorization, database contracts, application workflows and deployments are unchanged. No model training or external telemetry is used.

## Reproducible automated baseline

Run the CP-CRM-PERF-01 Platform Baseline GitHub Actions workflow on the target commit. It reports 30 samples per profile and scenario, nearest-rank P50/P95, mean, minimum and maximum. The JSON summary is printed in the job log. The runner also writes artifacts/crm-performance-baseline.json (ephemeral runner file).

- Actual repository index and frontend assets on a loopback HTTP origin, signed-out startup to visible login form and two animation frames.
- Fresh browser context for cold runs; revisit with HTTP-cache eligibility for warm runs. Compare measured decoded and transferred script/style bytes, not assumed cache hits.
- Desktop and emulated mobile viewport. Same synthetic 25-row content per registered application for isolated shell update and two-frame timing; actual production shell helper and sidebar route resolver.
- Actual board table renderer at 100 and 1,000 synthetic rows; preserve bounded virtualization. Finite existing frame sample.
- Every application is inventoried from the canonical workspace ownership manifest; no claim of signed app runtime coverage is made.
- No production credentials, writes, browser storage inspection, request bodies or external network are required.

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

## Outstanding acceptance

Do not equate isolated shell/renderer timings or signed-out startup with signed application readiness. Use a disposable signed environment with representative datasets, fresh and warm application routes, actual sidebar/tab interaction, response metadata, scoped refresh, foreground/idle and two-window comparisons. Capture matched 30-minute host/process metrics and statement counter deltas without resetting shared statistics. Track failed samples separately, preserve original workloads, and report real-device limitations. Never exercise automatic attendance transitions against a production employee merely to benchmark navigation.

Proposed next gate: certify full signed application timings and matched resource workload, then rank optimization by measured user impact. No runtime or SQL optimization should be claimed from this benchmark alone.
