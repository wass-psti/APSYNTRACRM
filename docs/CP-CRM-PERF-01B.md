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

Zero request failures and unchanged OT/audit content. Per-window request counts were 60 in both dual pages. Each phase had ten container samples. CI host CPU is not production CPU, and separate runners do not establish a causal CPU change. These fixture pages deliberately did not exercise Realtime. A later live production observation confirms actual WebSocket and Realtime event traffic, but it is not a controlled per-session subscription or reconnect benchmark.

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


## Live signed production route observation — 2026-11-27 11:40:53–11:41:29 UTC

A read-only route smoke was executed in a temporary tab using an already authenticated production browser session. The test restored the original tab and closed the temporary tab. It navigated the canonical routes only; no forms or mutation controls were used. No clock-in/clock-out mutation endpoint was requested; TimeTracker issued snapshot/capability reads only.

- 16 route hashes exercised; 15 distinct screen roots loaded.
- The legacy Toolbox Issues board URL intentionally redirects to the native TalkBox route in `frontend/app.js`; it is an alias, not a separate screen.
- 0 page errors; 0 unhandled promise rejections.
- One browser long task, 118 ms maximum.
- Per-page JavaScript heap observed: 14.66–17.72 MB.
- DOM node count observed: 1,138–2,558.
- All 15 distinct screen samples remained foreground-visible.
- These are single-pass readiness measurements, not statistically meaningful P95s or a sustained load test.

| Screen | Heading readiness | Supabase API requests | HTTP results |
|---|---:|---:|---:|
| FM1 Ticketing | 1,717 ms | 4 | 4 × 200 |
| TimeTracker | 1,869 ms | 11 | 11 × 200 |
| Fund Tracker | 2,069 ms | 11 | 11 × 200 |
| FuelTrack+ | 1,572 ms | 8 | 8 × 200 |
| TradeLink | 1,027 ms | 6 | 6 × 200 |
| Paseo de Lomboy | 3,981 ms | 5 | 5 × 200 |
| TalkBox | 2,015 ms | 8 | 8 × 200 |
| FuelTrans | 1,867 ms | 11 | 11 × 200 |
| Tool Traceability | 695 ms | 13 | 12 × 200, 1 × 404 |
| Order Intake | 6,608 ms | 10 | 10 × 200 |
| Employee Evaluation | 677 ms | 8 | 7 × 200, 1 × 404 |
| Charter Navigator | 654 ms | 9 | 8 × 200, 1 × 404 |
| APS AIMS | 657 ms | 8 | 7 × 200, 1 × 404 |
| Material Request Hub | 673 ms | 8 | 7 × 200, 1 × 404 |
| Daily Department Activity | 1,864 ms | 2 | 2 × 200 |

The five failed responses were all `/rest/v1/rpc/wm_board_group_view_read`. Follow-up correlation against PostgreSQL logs confirmed five SQLSTATE `42883` errors: `function pg_catalog.coalesce(jsonb, jsonb) does not exist`. Both deployed `wm_board_group_view_read(uuid)` and `wm_board_group_view_set_all(uuid,boolean)` contained the invalid schema-qualified expression. The function signatures, `SECURITY DEFINER`, empty `search_path`, authenticated EXECUTE grants and anonymous denials are intact. A forward-only function-body correction and disposable regression are now staged; production application and live API verification remain pending.

### Route-level bottleneck attribution

**Order Intake:** the dashboard issued ten sequential reads to `order_intake_operational_registry`. `frontend/order-intake-read-state.js` uses an awaited page loop with a page size of 100 and continues until the full collection is retrieved. During this route observation, browser resource duration P95 was 784.3 ms across those ten requests; the matching edge-log origin P95 was 661.4 ms. The current `pg_stat_statements` cumulative sample showed 27 calls, 4,165.85 ms total and 154.29 ms mean database execution. The dashboard's 6.61-second heading readiness is a single observation, not a population P95.

**Paseo de Lomboy:** the live route's browser resource timings included 1,404.8 ms for the admin reservations page and 816.2 ms for admin courts. Matching Edge Function logs recorded approximately 1,490 ms for admin session, 1,209 ms for reservations page and 668 ms for courts. Source inspection shows `authenticate()` sequentially calls `/auth/v1/user` and `admin_check` before the route-specific database RPC. Database function execution alone does not account for the full Edge Function duration. No authorization behavior was changed.

### Production service and workload observation — 2026-11-27 10:55–11:25 UTC

Read-only aggregate logs, not isolated to the benchmark account:

- 2,215 edge-log records.
- 1,857 HTTP 200 responses and 30 WebSocket 101 handshakes among non-OPTIONS requests.
- No 4xx or 5xx responses in this selected 30-minute window.
- 30 Realtime WebSocket handshakes; 21 `realtime_logs` `handle_event/4` info events.
- Browser context for the active signed CRM session also showed Realtime connected. This confirms live production Realtime activity, not controlled reconnect or cross-tab event-delivery acceptance.

| Shared endpoint | Requests | Origin P95 |
|---|---:|---:|
| `wm_auth_access_context` | 456 | 287 ms |
| `work_board_access` | 295 | 304 ms |
| `native_application_board_context` | 139 | 305 ms |
| `auth/v1/user` | 115 | 321 ms |
| `apsyntra_crm_my_effective_access` | 70 | 580 ms |
| `wm_get_board_shell` | 59 | 305 ms |
| `list_module_directory` | 24 | 432 ms |
| `list_module_state` | 22 | 792 ms |
| `realtime/v1/websocket` | 30 | 186 ms |

Origin P95 is Supabase edge origin time, not browser wall-clock time, SQL time, or CPU utilization.

### PostgreSQL workload delta

Two read-only `pg_stat_statements` snapshots, 11m16s apart, show the following aggregate production counter deltas. These include all users and workloads during the interval, not only the browser test.

| Operation | Calls added | Total execution added | Mean for interval delta |
|---|---:|---:|---:|
| `wm_auth_access_context` | 256 | 1,295 ms | 5.06 ms |
| `apsyntra_crm_my_effective_access` | 33 | 947 ms | 28.68 ms |
| `list_module_directory` | 8 | 1,189 ms | 148.60 ms |
| `list_module_state` | 8 | 607 ms | 75.90 ms |
| `timetracker_clock_snapshot` | 38 | 604 ms | 15.89 ms |
| `timetracker_ot_snapshot` | 7 | 479 ms | 68.36 ms |
| `native_application_board_context` | 75 | 429 ms | 5.73 ms |
| `wm_get_board_shell` | 39 | 214 ms | 5.49 ms |
| `wm_get_board_items_page` | 12 | 121 ms | 10.09 ms |
| `wm_list_boards` | 7 | 110 ms | 15.74 ms |

These deltas support shared context/module directory/state retrieval as investigation targets. They do not establish a per-user CPU attribution or justify a code change by themselves.

## Historical schema parity snapshot — 2026-11-27 11:50 UTC

The current production project is healthy and has 191 application tables and 747 application routines. Existing nonproduction branches do not provide a full CRM backend: invitation staging has 14 application tables and 13 routines; the OJT branch has zero application tables and routines. Neither has verified production migration parity.

At this historical 11:50 UTC inspection, the repository contained 351 `supabase/migrations` versions and production had 349 registered versions. That discrepancy was subsequently resolved; see the current 352/352 parity verification below.

The first CRM migration remains `20260917142647_stage_g_m46_boards_backend_data_contract_recovery.sql`, which assumes a certified M45 schema. No root `supabase/config.toml` exists. The certified M45 schema-only bootstrap is not available in the current repository, searchable Project/Library files, or the checked project-download directories. No production schema export was performed; no paid Supabase branch was created.

## CP-CRM-PERF-01B acceptance status

**Passed:** TimeTracker foreground-controlled single/dual 30-minute cohorts; FuelTrans signed fixture with 120 transitions; 15 distinct live signed production screens plus the documented legacy alias; aggregate production edge/PostgreSQL attribution; live Realtime activity observation.

**Still pending:** a full disposable Supabase stack with the certified M45 baseline, synthetic records, Auth/Realtime/Storage parity; controlled full-platform signed single/dual-window sustained resource measurement; host CPU/RAM/network attribution; controlled Realtime event/reconnect acceptance; and production application plus live API verification of the group-view RPC correction.

CP-CRM-PERF-01B remains **OPEN / BLOCKED**, not complete. The next step remains inside this milestone: obtain an approved protected schema-only M45 bootstrap (or approve a billable isolated schema-only Supabase environment), replay and verify the complete runtime contracts, then run the remaining controlled acceptance. No subsequent CRM performance initiative is opened.


## Current-main FuelTrans rerun — 2026-11-27

The FuelTrans signed fixture was rerun after the subsequent application-shell, session and TimeTracker changes, using the current main checkpoint. The workflow is now also configured to rerun when relevant FuelTrans, application-shell, session, workspace-routing or native-application source paths change.

- Workflow: [45996002315](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45996002315) — success.
- Commit: `6bf859627f6f72b2906f000549de7828f521a864`.
- Retained artifact: `15195772599`.
- Signed lifecycle checks: 75 passed.
- Read benchmark: 60 cycles and 120 route transitions across desktop and mobile viewport.
- Ticket integrity hash before/after read benchmark: pass.
- Disposable GoTrue/PostgREST containers: removed on exit.
- Test contract: 1/1 passed.

| Profile | View | Ready P95 | Reads / visit | Count reads | Response bytes / visit | Max read P95 |
|---|---|---:|---:|---:|---:|---:|
| Desktop | Dashboard | 100.49 ms | 7 | 6 | 14,368 | 20.57 ms |
| Desktop | Ticket queue | 100.39 ms | 1 | 0 | 49,558 | 13.66 ms |
| Mobile viewport | Dashboard | 100.54 ms | 7 | 6 | 14,368 | 18.22 ms |
| Mobile viewport | Ticket queue | 100.08 ms | 1 | 0 | 49,558 | 14.89 ms |

This confirms the existing dashboard count fan-out remains six requests per visit, while the ticket queue uses one list request. The timings are warm fixture navigation measurements against real signed PostgREST reads with an emulated CRM host handshake; they do not certify full CRM startup, production network latency, or production host CPU/RAM. The fixture disables automatic refresh only inside its disposable browser.



## Current-main verification refresh — 2026-11-27 13:07 UTC

### FuelTrans signed benchmark follow-up

- Workflow: [46000281137](https://github.com/wass-psti/APSYNTRACRM/actions/runs/46000281137) — success.
- Tested commit: `a1ccbed2f15d874d5764720570c9ffd097e44c26`.
- Retained artifact: `15197294446`.
- Signed lifecycle HTTP checks: 75 passed.
- Warm navigation: 60 cycles and 120 route transitions across desktop and mobile viewport profiles.
- Benchmark contract: 1/1 passed; ticket integrity unchanged.
- Desktop readiness P95: dashboard 100.49 ms; ticket queue 100.39 ms.
- Mobile readiness P95: dashboard 100.54 ms; ticket queue 100.08 ms.
- The fixture still uses an emulated CRM host handshake and warm navigation; it does not certify full CRM startup or production host CPU/RAM.

### Current migration parity

The latest main repository and production migration ledger now both contain **352 versions**, with zero repository-only versions, zero production-only versions and no duplicate repository versions. This supersedes the historical 349/348 and 351/349 snapshots above. It establishes version parity only; it does not supply the missing M45 baseline or prove full schema replay.

### Board group-view RPC root cause and correction

The read-only production log window from 2026-11-27 11:40–11:42 UTC contained 10 requests to `/rest/v1/rpc/wm_board_group_view_read`: five HTTP 200 and five HTTP 404. PostgreSQL recorded exactly five corresponding errors with SQLSTATE `42883` and message `function pg_catalog.coalesce(jsonb, jsonb) does not exist`.

The additive migration `20261127130720_cp_board_group_view_coalesce_fix.sql` replaces only the read and bulk-update function bodies, using native `COALESCE(...)` syntax. It preserves function signatures, owner, `SECURITY DEFINER`, empty `search_path`, and existing function ACLs. No table/data, role, grant, RLS, session-guard or application authorization changes are included.

A disposable PostgreSQL 17 regression job now reproduces the original SQLSTATE 42883 before applying the fix, then checks first-read defaults, repeated reads, individual preference revisions, bulk collapse/expand, empty-board results, new-group defaults and the existing authenticated/anonymous execution contract. Production application is intentionally pending until this disposable gate passes.

### Remaining certification status

The latest-main TimeTracker single/dual rerun [46000280981](https://github.com/wass-psti/APSYNTRACRM/actions/runs/46000280981) was still in progress at this evidence capture and is not counted as a pass.

CP-CRM-PERF-01B remains **OPEN / BLOCKED** until the full-host M45-baseline workload, resource attribution, controlled Realtime event/reconnect checks, and production verification are complete. No subsequent CRM performance initiative is opened.
