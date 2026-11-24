# CP-CRM-SESSION-CPU-06 — Authoritative Metrics Capture, Supabase Report-Service Failure Tracing, and Current-Browser Session Recovery

## Status

**PARTIAL — collector and analysis tooling are implemented and tested; production metrics capture and report-service request/trace correlation remain blocked by the unavailable secret-safe credential path. Same-tab signed-session recovery is verified.**

Initial investigation: 2026-11-23 UTC. Resumed verification: 2026-11-24 UTC.

## 1. Scope and execution boundaries

This implementation continues the CP-CRM-SESSION-CPU series from the latest `main` commit (`71e5cc49d6563d5986aeb9e769b028a1a1798f86`). The working branch is `cp-crm-session-cpu-06`.

Three workstreams were handled independently:

1. Authoritative host/service metrics capture and workload normalization.
2. Supabase Database report-panel failure isolation and request-trace investigation.
3. Same-tab browser session restoration and synchronization acceptance.

The separate Board Group Preferences defect (`pg_catalog.coalesce(jsonb, jsonb)`) was not modified in this branch.

- No CRM production frontend session or synchronization code was changed.
- No database schema, function, table, index, RLS policy, role, or permission was changed.
- No production project setting, compute size, plan, or credential was changed.
- No Secret API key was revealed, copied, exported, rotated, or written to a file.
- No background collector, scheduled job, telemetry SDK, Grafana instance, or monitoring service was installed.
- The metrics collector is a finite foreground process and adds no dependencies.
- No attendance clock-in, clock-out, correction, or other business-record mutation was performed during browser acceptance.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, iterative weight update, or model-parameter optimization was introduced or executed.

## 2. Workstream A — authoritative metrics tooling

### 2.1 Source and authentication contract

The official [Supabase Metrics API documentation](https://supabase.com/docs/guides/observability/metrics) specifies the Prometheus-compatible endpoint. The published [Supabase Grafana metrics catalog](https://github.com/supabase/supabase-grafana/blob/main/metrics.md) was also checked to verify the actual metric family names and labels before finalizing the analyzer:

`https://<project-ref>.supabase.co/customer/v1/privileged/metrics`

The endpoint is scraped over HTTPS with HTTP Basic authentication:

- Username: `service_role`
- Password: an existing Supabase Secret API key (`sb_secret_...`)
- Recommended scrape interval: 60 seconds

The project API Keys page shows an existing Secret API key, but its value remains masked. The available tool path did not provide a secret-safe way to use that key without revealing or copying it. No key was revealed, copied, rotated, or newly created.

A direct unauthenticated Management API probe returned HTTP 401 (`No access token provided`). The Metrics API collector's preflight correctly exits with code 2 when `SUPABASE_METRICS_SECRET_KEY` is not supplied. It does not make a request or write an evidence file in that case.

### 2.2 Implemented files

- `scripts/cp06/metrics-parser.mjs`
  - Parses Prometheus text exposition samples.
  - Supports comments, metric names, labels, escaped values, finite numbers, `NaN`, and infinities.
  - Reports malformed lines with their line number.
- `scripts/cp06/metrics-analysis.mjs`
  - Calculates CPU counter deltas by stable CPU/mode series identity.
  - Uses `node_cpu_seconds_total` from the database host (`service_type="db"`).
  - Reports non-idle CPU, active execution excluding I/O wait and steal, I/O wait, and steal separately.
  - Does not add the separate `node_cpu_guest_seconds_total` series to the CPU denominator because it is a subset of user/nice time.
  - Calculates process CPU per documented `service_type` (for example `postgresql` and `gotrue`) as percent of one core.
  - Omits process CPU attribution for an interval if any process counter resets or process series appear/disappear, preventing process churn from creating under-attributed values.
  - Does not subtract process counters from host CPU or claim an unattributed residual because the published process series are not an exhaustive host-process inventory.
  - Uses the published PostgreSQL counter names (`*_total`), database backend gauge (`pg_stat_database_num_backends`), and PgBouncer client/server gauges.
  - Detects counter resets and series churn instead of reporting negative or misleading deltas.
  - Calculates interval mean, p50, p95, and maximum values.
  - Tracks metric names and label-key availability without copying label values into a separate inventory.
- `scripts/cp06/metrics-capture.mjs`
  - Runs finite, scheduled Prometheus requests with injected fetch/time dependencies for deterministic tests.
  - Records request-start timestamps for HTTP and network failures.
  - Keeps failure evidence sanitized and never stores response bodies or exception messages.
- `scripts/cp06/capture-metrics.mjs`
  - Defaults to 31 samples at 60-second intervals (30 minutes between first and last samples).
  - Uses Node.js built-in `fetch`; no new package dependency.
  - Reads the existing Secret API key only from `SUPABASE_METRICS_SECRET_KEY`.
  - Never logs the key or the Authorization header.
  - Uses bounded request timeouts and records only sanitized HTTP status/error categories.
  - Writes local evidence with file mode `0600` to `/tmp/cp06-metrics-samples.json` by default.
  - Runs in the foreground and exits after the finite sample count.
- `frontend/tests/cp-crm-session-cpu-06.test.mjs`
  - Covers Prometheus parsing, malformed input, CPU calculations, service labels, PostgreSQL/PgBouncer metric names, counter deltas, counter resets, 31-sample aggregation, series churn, HTTP failures, successful response handling, and sanitized exceptions.

### 2.3 Verification

| Check                       | Result                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Parser syntax               | PASS                                                                                          |
| Analysis syntax             | PASS                                                                                          |
| Collector syntax            | PASS                                                                                          |
| Focused CP-06 tests         | 11/11 PASS                                                                                    |
| Missing-key preflight       | PASS — exits 2 without network access                                                         |
| New runtime dependencies    | None                                                                                          |
| 31-sample production scrape | NOT RUN — existing Secret API key was not made available through a secret-safe execution path |

The collector can be run locally without placing the secret in shell history or source code. From an interactive Terminal window, run the CP-07 Node.js prompt wrapper to enter the existing key without echo:

```sh
node scripts/cp07/run-metrics-capture.mjs
```

The prompt suppresses terminal echo. The variable exists only in the child shell for the capture process; no key value is written to the repository or evidence file. The run takes approximately 30 minutes. Do not create or rotate a key solely to bypass this prerequisite.

## 3. Workstream B — Supabase Database report isolation

### 3.1 Authenticated Dashboard observation

The Pro project's Database Observability report was loaded at:

`/dashboard/project/jtlusodorfnyzgyuewkz/observability/database`

Selected time range: Last 60 minutes (November 23, 2026, approximately 5:30–6:30 PM Philippine Time).

Working panels at the time of inspection:

- Memory usage: 863.13 MB.
- Memory commitment: approximately 1.4 GB, with the Dashboard showing a WARNING indicator.
- CPU usage: 2.27% (point-in-time/report display; not a 30-minute CPU average).
- Network throughput: 79.8 KB/s.
- Database Size: approximately 0.45 GB used of 2 GB provisioned.

The following six panels displayed `Unable to load data` during the November 23 baseline observation:

1. Disk Input/Output operations per second (IOPS).
2. Disk throughput.
3. Database Connections.
4. Dedicated Pooler Client Connections.
5. Shared Pooler (Supavisor) Client Connections.
6. Disk Usage.

### 3.2 Plan entitlement interpretation

The current [Supabase Reports documentation](https://supabase.com/docs/guides/observability/reports) explicitly lists Disk IOPS, Database Connections, Disk Usage, and Database Size as available on Free and Pro. Its table lists Dedicated and Shared Pooler connections as available to all plans. The same page contains a separate Advanced Telemetry section stating that advanced charts are Team, Enterprise, and Platform only, and includes an editorial note that this section is confusing/contradictory.

Accordingly:

- The failures of Disk IOPS, Database Connections, and Disk Usage are not explained by the documented Pro entitlement table.
- The pooler charts are listed as available to all plans in the summary table, despite the contradictory advanced-telemetry section.
- Disk throughput is not listed among the explicit Free/Pro core charts.
- No panel is classified as a confirmed plan restriction solely from the conflicting documentation.

### 3.3 Request and trace correlation result

The Dashboard shell and report page rendered, but the browser-exposed resource timing data did not reveal individual report-service data requests or their response payloads. The report UI exposed chart-level failure messages but not the underlying HTTP status, provider error code, request ID, or trace ID.

### 3.4 Resumed observation — November 24, 2026

A fresh authenticated visit and same-page reload were performed against the same production Database Observability route at approximately 02:53–02:55 UTC.

- The Dashboard displayed the global notice **“We are investigating a technical issue”** with a link to the Supabase status page.
- All ten Database metric panels displayed `Unable to load data`: Memory usage, Memory commitment, CPU usage, Network throughput, Disk IOPS, Disk throughput, Database Connections, Dedicated Pooler Client Connections, Shared Pooler Client Connections, and Disk Usage.
- The Database Size panel remained available and showed 0.45 GB used of 2 GB provisioned.
- The same ten-panel failure state remained after a controlled page reload.
- Before reload, the page's Performance Resource Timing entries showed only authentication refresh, ConfigCat configuration, and Dashboard profile/permission requests; no report-specific fetch/XHR request was present.
- After reload, the Performance Resource Timing API showed zero fetch/XHR entries while the same ten chart errors remained visible.

This is stronger evidence of a Dashboard/report request-dispatch or upstream observability-page problem than the prior six-panel observation. It still does not expose the HTTP status or request/trace ID of a report backend call because no report-specific fetch/XHR request was visible in the page's Resource Timing data. Resource Timing is not a complete browser network trace, so this does not prove that no request was sent by every possible transport or worker.

The project-side unified logs for 01:45–02:55 UTC contained 4,965 Edge events and 1,076 PostgreSQL events, among other sources. The targeted query returned no PostgreSQL error/fatal events and no Edge HTTP 4xx/5xx events in that window. Project logs do not expose Supabase Dashboard control-plane/report-service traces, so they cannot identify the failing upstream component.

The Dashboard notice itself is direct evidence of a platform-reported technical issue, but it does not name the affected service or provide a correlation ID. No claim is made that the project database, Postgres, or API Gateway caused the report failures.

**Result: PARTIAL.** The failure is reproducible across a reload, affects all ten report charts, and is accompanied by a Supabase Dashboard technical-issue notice. Provider-side request/trace correlation remains outstanding.

### 3.5 Later partial recovery — November 24, 03:22 UTC (11:22 AM Philippine Time)

A subsequent authenticated browser inspection of the same Database Observability route showed partial recovery:

- Memory usage, Memory commitment, CPU usage, and Network throughput rendered values and charts.
- Six panels still displayed `Unable to load data`: Disk IOPS, Disk throughput, Database Connections, Dedicated Pooler Client Connections, Shared Pooler Client Connections, and Disk Usage.
- The page still displayed the global Supabase Dashboard technical-issue notice.
- The visible CPU card showed 3.65% for its selected 60-minute window. This is a Dashboard UI value, not an independently captured Metrics API host sample.
- The visible memory usage was approximately 869.95 MB, memory commitment approximately 1.46 GB, and database size remained 0.45 GB of 2 GB provisioned.
- No report-specific request status or provider trace identifier was obtained from this later view.

This later observation supersedes the earlier ten-panel count as the most recent visible UI state, but it does not invalidate the timestamped 02:55 UTC observation. The failure is intermittent/partially recovered rather than a continuously identical ten-panel failure. The six remaining failures still require request-level correlation.

## 4. Workload-normalized Supabase evidence

Read-only production snapshots were taken at approximately 10:16:24 UTC and 10:34:25 UTC (about 18 minutes apart). These are cumulative PostgreSQL counters; the deltas below measure statement activity during the interval and are not direct host CPU attribution.

| Statement                          | Calls delta | Total execution delta |
| ---------------------------------- | ----------: | --------------------: |
| `wm_list_boards`                   |         +13 |            +181.50 ms |
| `apsyntra_crm_my_effective_access` |         +77 |          +2,660.56 ms |
| `wm_get_board_items_page`          |         +18 |             +94.74 ms |
| `wm_auth_access_context`           |        +551 |          +1,600.75 ms |
| `wm_get_board_shell`               |         +27 |            +116.79 ms |
| `work_board_access`                |        +295 |            +359.98 ms |
| `realtime.authorize`               |        +334 |            +759.93 ms |

The `wm_auth_access_context` call count increased by 551 over approximately 18 minutes. Its cumulative execution-time delta was approximately 1.60 seconds, or approximately 2.9 ms per additional call. This is not evidence of a CPU spike by itself.

The November 23 `pg_stat_activity` snapshot showed 23 total sessions, including 13 idle client-read sessions and two active sessions. There were no idle-in-transaction sessions. One active session was waiting for WAL sender activity. No connection saturation conclusion is supported by this snapshot.

### 4.1 Resumed workload window — November 24, 02:57:05–03:03:44 UTC

A second read-only `pg_stat_statements` snapshot was taken 399.666 seconds after the first resumed snapshot. The values below are counter deltas over that measured interval, not cumulative lifetime totals:

| Statement                          | Calls delta | Execution delta | Mean per call | Calls/min |
| ---------------------------------- | ----------: | --------------: | ------------: | --------: |
| `wm_list_boards`                   |         +14 |       153.94 ms |      11.00 ms |      2.10 |
| `apsyntra_crm_my_effective_access` |         +31 |     1,144.28 ms |      36.91 ms |      4.65 |
| `wm_get_board_items_page`          |          +9 |        39.46 ms |       4.38 ms |      1.35 |
| `wm_auth_access_context`           |        +271 |       991.91 ms |       3.66 ms |     40.68 |
| `wm_get_board_shell`               |         +18 |        62.30 ms |       3.46 ms |      2.70 |
| `work_board_access`                |        +128 |       182.34 ms |       1.42 ms |     19.22 |
| `realtime.authorize`               |        +193 |       291.64 ms |       1.51 ms |     28.97 |

The `apsyntra_crm_my_effective_access` calls were the largest execution-time contributor in this short window at 1.14 seconds total, averaging 36.91 ms across 31 calls. `wm_auth_access_context` ran 271 times at an average of 3.66 ms. These are database statement measurements and must not be represented as host CPU percentages.

The November 24 activity snapshot showed 21 idle `ClientRead` sessions, one active session with no wait event, and one active session waiting for WAL sender activity. No idle-in-transaction session or connection saturation was established.

Project-side unified logs from 01:45–02:55 UTC contained 4,965 Edge events and 1,076 PostgreSQL events. The targeted queries returned no PostgreSQL error/fatal matches and no Edge HTTP 4xx/5xx matches. These project logs do not expose Supabase Dashboard control-plane/report-service traces.

Unified logs in the observation window included Edge, PostgreSQL, Auth, Supavisor, PgBouncer, and function sources. The grouped Edge status result contained HTTP 200 and WebSocket 101 outcomes; no 4xx/5xx bucket was returned. The log explorer produced slightly different aggregate counts between separate queries, so no single exact total is asserted.

No PostgreSQL error log matching the earlier `pg_catalog.coalesce` failure was returned in the 10:16–10:34 UTC error query. That earlier defect remains a separate Board Group Preferences follow-up and is not changed by CP-06.

## 5. Workstream C — current-browser session recovery

### 5.1 Same-tab test

The selected production CRM browser tab remained on:

`https://wass-psti.github.io/APSYNTRACRM/#/time-tracker`

Before reload, it showed `Live synced · Authorized Realtime connected`.

A controlled reload was performed in the same tab. No attendance write or clock action was submitted.

Immediately after reload, the application displayed its existing startup/verification screen. While the tab was in the background, the sync indicator showed `Suspended in background`. The browser tab was then brought to the foreground. The application restored the signed workspace and briefly used its existing authorized polling fallback before returning to Live Realtime synchronization.

### 5.2 Post-reload evidence

The same tab returned to:

- The same TimeTracker route.
- Signed workspace verified.
- Signed Clock writes active.
- No sign-in form displayed.
- `Live synced · Authorized Realtime connected`.

Browser resource timing recorded these successful requests after the reload:

| Request                                         | HTTP status | Duration |
| ----------------------------------------------- | ----------: | -------: |
| `/auth/v1/user`                                 |         200 |   268 ms |
| `/rest/v1/rpc/wm_auth_access_context`           |         200 |   210 ms |
| `/rest/v1/rpc/wm_list_boards`                   |         200 |   266 ms |
| `/rest/v1/rpc/apsyntra_role_is_bootstrap`       |         200 |   207 ms |
| `/rest/v1/rpc/apsyntra_role_is_admin`           |         200 |   220 ms |
| `/rest/v1/rpc/apsyntra_crm_my_effective_access` |         200 |   308 ms |
| `/rest/v1/rpc/native_application_board_context` |         200 |   262 ms |

No failed Auth or workspace RPC request was present in the captured resource list.

**Result: VERIFIED for same-tab session restoration, signed workspace context, and eventual Live Realtime recovery.** The recovery path required the tab to be foregrounded; background suspension was expected and resolved by the existing synchronization architecture. No session or platform-sync code was modified.

## 6. Separate functional defect — not part of CP-06

The production `wm_board_group_view_read(uuid)` and `wm_board_group_view_set_all(uuid,boolean)` functions in migration `20261120194000_cp_board_group_view_01_user_prefs` contain invalid schema-qualified `pg_catalog.coalesce(...)` calls. Earlier logs showed SQLSTATE `42883` (`function pg_catalog.coalesce(jsonb, jsonb) does not exist`) in `wm_board_group_view_read`.

This defect is deliberately excluded from CP-06. Recommended separate work item:

**CP-BOARD-GROUP-VIEW-01B — COALESCE RPC Failure Remediation and Live Read/Set-All Acceptance.**

## 7. Acceptance matrix

| Acceptance area                                              | Status                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Metrics parser and analysis implementation                   | VERIFIED                                                                                                |
| CPU counter math, guest accounting, resets, and series churn | VERIFIED by focused tests                                                                               |
| Finite 31-sample/30-minute Metrics API capture               | PENDING — credential must be supplied locally without exposing it                                       |
| Authoritative CPU mean, p50, p95, max, I/O wait, and steal   | PENDING — requires completed Metrics API capture                                                        |
| Service CPU attribution                                      | PENDING — requires actual Metrics API series and labels                                                 |
| PostgreSQL workload deltas                                   | VERIFIED for the documented 18-minute and 6m40s intervals                                               |
| Database report failed panels identified                     | VERIFIED — six on Nov 23; ten at 02:55 UTC, six at 03:22 UTC Nov 24                                     |
| Plan-entitlement discrepancy documented                      | VERIFIED from current Supabase documentation                                                            |
| Report-service HTTP status/request ID/trace ID               | NOT CAPTURED — no report-specific fetch/XHR surfaced in Resource Timing; full network trace unavailable |
| Same-tab signed session restored                             | VERIFIED                                                                                                |
| Auth/workspace RPC responses after reload                    | VERIFIED — all captured requests HTTP 200                                                               |
| Live Realtime synchronization restored                       | VERIFIED                                                                                                |
| Existing session architecture unchanged                      | VERIFIED                                                                                                |
| Board Group Preferences defect kept separate                 | VERIFIED                                                                                                |
| No database/permission/project-setting changes               | VERIFIED                                                                                                |
| No training/gradient-descent execution path                  | VERIFIED                                                                                                |

## 8. Conclusion

CP-CRM-SESSION-CPU-06 is **PARTIAL — NOT CLOSED**.

The finite Metrics API collector, Prometheus parser, CPU/service analysis, and regression tests are implemented. Focused tests pass 11/11. The full frontend suite passes 3,564/3,564; repository check, lint, formatting, and production build also pass. Production database activity has been normalized using approximately 18-minute and 6m40s `pg_stat_statements` deltas. Ten report metric panels failed at 02:55 UTC; a later 03:22 UTC observation showed partial recovery with six remaining failures. The Dashboard did not expose a report-specific request in Resource Timing, so internal HTTP status and trace identifiers remain unavailable.

The current production CRM browser successfully recovered its signed session after a same-tab reload, restored workspace context, and returned to Live Realtime synchronization. The existing session architecture was not modified.

The 30-minute authoritative host metrics sample remains outstanding because `SUPABASE_METRICS_SECRET_KEY` is not set in the connected Mac environment. The collector was corrected to record HTTP and request failures using a defined request-start timestamp, and its error handling is now covered by tests. The existing Secret API key was not revealed, copied, exported, or rotated. The collector is ready to run locally with the key entered through a silent terminal prompt; no key should be pasted into chat, source code, command-line arguments, or evidence files.

The latest same-tab CRM check on November 24 at 11:03:26 AM Philippine Time still showed a secure session, signed workspace verification, signed Clock writes active, and `Live synced · Authorized Realtime connected`. No sign-in screen appeared.

No production deployment or Supabase mutation is part of this diagnostic change.

## 9. Recommended next solid implementation

# CP-CRM-SESSION-CPU-07 — Secret-Safe Metrics Execution, Supabase Report Request Correlation, and Final CPU Attribution

### Objectives

1. Complete 31 successful Metrics API samples over 30 minutes using the existing Secret API key supplied locally through a silent prompt.
2. Produce CPU active execution mean, p50, p95, maximum, I/O wait, and steal from actual counter deltas.
3. Report process CPU per actual `service_type` series. Keep it separate from database-host CPU and explicitly state that the published process series are not a complete host-process inventory; do not manufacture an unattributed-host residual.
4. Capture individual Dashboard report-service requests, status codes, error payloads, and request/trace IDs using an authenticated browser network trace or provider support evidence.
5. Reconcile the ten failing panels against the documented Pro/all-plan entitlements and the Dashboard's technical-issue notice.
6. Preserve the verified same-tab session recovery without changing the existing session architecture.

### Acceptance criteria

- [ ] 31/31 successful Metrics API samples at 60-second intervals.
- [ ] Actual CPU mean, p50, p95, maximum, I/O wait, and steal reported.
- [ ] Host CPU metrics calculated only from `node_cpu_seconds_total` with `service_type="db"`.
- [ ] Process CPU reported separately by the actual `service_type` labels; no false claim of complete host-process coverage.
- [ ] Each of the ten failed Database report panels has a captured HTTP status or a documented provider-side limitation with evidence.
- [ ] Request/trace identifiers captured where exposed by the provider.
- [x] Same-tab signed-session and Live Realtime recovery remain verified.
- [ ] No session architecture, database, permission, role, or project-setting change is made without a separate requirement.
- [ ] No new credential, persistent collector, telemetry service, or model-training path is introduced.
