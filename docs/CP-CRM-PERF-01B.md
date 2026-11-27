# CP-CRM-PERF-01B — partial signed baseline expansion and bottleneck attribution

Source: GitHub Actions run 45969692580, commit 996c7430cfe5bf52a2257bd3764c9f0054f119ab. Three completed successful jobs, 21 unit tests and 81 signed HTTP/SQL checks per job. Retained artifacts: smoke 15184382008, single 15185379149, dual 15185603476.

| Cohort | Duration | Snapshot requests | Response bytes | Filter interactions | Interaction p95 |
|---|---:|---:|---:|---:|---:|
| Single | 30m | 59 | 379016 | 40 | 30.8ms |
| Dual | 30m | 97 | 623225 | 80 | 2031.1ms |

Both preserved OT request/audit integrity, with zero request errors. Dual interaction timing confounds background animation frame scheduling. Commit 4edbb069eb39540299d8949bd883e9ac42cbba0c introduces foreground visibility checks; follow-up run 45976010253 must be inspected separately. Do not compare fixture runner CPU with production CPU or imply a causal reduction from different runners.

## FuelTrans fixture

Reuse existing disposable GoTrue and PostgREST environment and actual native module, with explicitly emulated CRM host handshake. Thirty dashboard-to-queue and queue-to-dashboard cycles per desktop/mobile viewport. Automatic refresh off only inside the test. Count and list read calls, response body bytes and navigation ready time. Validate actual destination DOM, block write requests during the benchmark, compare ticket contents before/after. Report numeric-only evidence; no real production account or data. Source dashboard issues six independent count requests plus one list request; queue issues one list request.

## Full-host environment remains unverified

Do not label app-specific fixtures as platform-wide signed acceptance. Material Sourcing integration is evolving concurrently; re-read the canonical inventory at certification. Existing prior nonproduction branches lack registered production migration parity; do not modify them or copy private records without approval. Full signed startup, sidebar navigation, all other app flows and genuine Realtime require a verified representative environment with synthetic records and actual installed migration contracts. No production app, authorization, training or model changes.

## Verified foreground-controlled rerun

Run 45976010253, commit 4edbb069eb39540299d8949bd883e9ac42cbba0c, all three jobs passed. 22 measurement/regression tests per job. Artifacts: smoke 15187885184, single 15189121351, dual 15188194957. Source commit changed fixture timing, not application behavior; results do not establish a production speedup.

| Cohort | Duration | Snapshot requests | Response bytes | Filter interactions | Foreground checks | Interaction p95 |
|---|---:|---:|---:|---:|---:|---:|
| Single | 30m | 60 | 385500 | 40 | 40/40 | 31.0ms |
| Dual | 30m | 120 | 771120 | 80 | 80/80 | 30.7ms |

Zero request failures and unchanged OT/audit content. Per-window request counts were 60 in both dual pages. Each phase had ten container samples. CI host CPU is not production CPU, and separate runners do not establish a causal CPU change. Actual Realtime transport was not tested; these are deliberately polling-eligible fixture pages.

## Verified FuelTrans results

Run 45980273857, commit ba9da295afb9258b31181212aa5d6e60d298ce98, artifact 15188394067. 120 successful transitions, 30 per direction/profile, zero browser errors, ticket content integrity pass, 75 signed lifecycle HTTP checks. Count/list request accounting is from actual native application links and actual PostgREST traffic inside the established emulated-host fixture.

| View | Desktop p95 | Mobile viewport p95 | Signed reads / visit | Count requests | Response body bytes / visit |
|---|---:|---:|---:|---:|---:|
| Dashboard | 100.20ms | 116.81ms | 7 | 6 | 14373 |
| Ticket queue | 100.14ms | 100.03ms | 1 | 0 | 49568 |

480 ticket read requests in 120 transitions, of which 360 were count calls. Source `frontend/fueltrans/app.js` runs stats (one total and five per-status counts) alongside a recent-ticket list. The measured count fan-out supports evaluating a single equivalent scoped aggregate, with exact parity for archived/client visibility and counts. It does not prove that changing SQL will improve wall-clock latency, because the calls are parallel. Queue payload width also merits projection measurement. Frontend validation run 45980273925 passed 4,025/4,025 tests plus 57/57 auth/backend tests; all jobs passed. Pages deployment run 45980273476 passed.

## Production workload attribution, 2026-11-27 09:30–10:00 UTC

Read-only aggregate edge log window: 5,010 rows, of which 3,962 non-OPTIONS requests matched selected REST/Auth/Realtime paths. 29 HTTP 404 responses, zero 5xx among these selected requests. Aggregate origin duration is not SQL time, CPU utilization, browser wall-clock latency or a per-user workload.

| Endpoint | Requests | Origin p95 ms | Total origin ms |
|---|---:|---:|---:|
| wm_auth_access_context | 960 | 266.05 | 208438 |
| work_board_access | 518 | 252 | 113390 |
| native_application_board_context | 244 | 281.55 | 55110 |
| auth user | 221 | 409 | 52164 |
| list_module_state | 96 | 818 | 50988 |
| list_module_directory | 96 | 395 | 35566 |
| apsyntra_crm_my_effective_access | 129 | 371 | 33584 |
| timetracker_ot_snapshot | 96 | 304.5 | 26024 |
| wm_list_boards | 54 | 481.35 | 20100 |
| wm_board_group_view_read | 29 | 258.8 | 5628 |

The highest-volume shared path is signed context resolution. `frontend/data.js` already shares overlapping context reads but does not reuse completed results; native resolution calls context and native RPC concurrently. TimeTracker independently rechecks identity/context and full snapshots fan out into unrelated view data. Investigate same-operation reuse and view-scoped retrieval while preserving all existing authorization and post-read checks. The 29 group-view RPC responses were 404; the current catalog contains public.wm_board_group_view_read(uuid). This proves the observed failure but not its exact cause or whether it persists; investigate request signature/schema-cache/response code before proposing a fix.

## Migration parity and environment blocker

Repository at ba9da295: 349 replay-directory migration versions; production ledger 348, all present in replay directory; the sole repo-only version at inspection was 20261127120000 (TradeLink template render snapshots). Both nonproduction branches returned zero registered migration versions, so neither has proven parity. The earliest repo migration, 20260917142647_stage_g_m46_boards_backend_data_contract_recovery.sql, explicitly assumes an existing certified M45 schema; the next migration updates existing work_board_groups/work_board_items tables. There is no root supabase/config.toml in this snapshot. A complete blank-database replay cannot be assumed from version matching alone. Minimum prerequisite: obtain an approved, protected schema-only foundational M45 bootstrap (or verified current schema-only baseline), replay/verify in a disposable full Supabase stack including Auth/Realtime/Storage, seed synthetic fixtures, and verify current contracts before signed host benchmarking. No private production rows or privileged secrets should be committed. Do not create a paid project or repurpose existing branches without separate approval.

## Certification boundary and next action

Verified: two app-specific signed performance paths (TimeTracker OT and FuelTrans dashboard/queue), 120 minutes of prior and corrected sustained OT cohorts, 16 registered routes in prior isolated shell baseline, current aggregate production request attribution. No full-host signed timing matrix, true Realtime transport benchmark or representative platform-wide sustained resource run. Prioritize the missing baseline environment, and only then certify remaining paths and select targeted optimization; existing evidence identifies shared context/directory/state reads, startup assets and FuelTrans count fan-out as candidates. No production performance changes in this checkpoint.
