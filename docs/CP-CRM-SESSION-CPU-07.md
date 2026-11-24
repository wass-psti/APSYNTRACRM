# CP-CRM-SESSION-CPU-07 — Secret-Safe Metrics Execution and Dashboard Report Trace Capture

## Status

**IMPLEMENTED — UNVERIFIED against live metrics and a real Dashboard HAR.** The secret-safe local runner and sanitized HAR analyzer are implemented and tested. Live production capture remains pending because the existing Metrics API key is not present in the connected Mac environment and a full Dashboard HAR has not yet been exported.

Working branch: `cp-crm-session-cpu-07`.

Parent implementation: CP-06 commit `6e5d814` on branch `cp-crm-session-cpu-06` (draft PR #828).

## 1. Scope

CP-07 continues the three independent CP-CRM-SESSION-CPU workstreams:

1. Complete authoritative host/service metrics capture using the existing Supabase Metrics API key entered locally without echo.
2. Capture the full browser request trace for the Supabase Database Observability report and correlate report requests, status codes, safe error codes, and trace identifiers.
3. Preserve the currently verified CRM browser session and Realtime synchronization without modifying the working session architecture.

No database schema, function, index, role, permission, RLS policy, project setting, compute configuration, or production frontend code is changed. No credential is created, rotated, revealed, copied into source, or committed. No background agent or persistent telemetry service is introduced. No training, gradient descent, backpropagation, fine-tuning, or model-parameter update process is introduced or executed.

## 2. Secret-safe Metrics API execution

### 2.1 Implemented runner

`scripts/cp07/run-metrics-capture.mjs`:

- Prompts for the existing Supabase Secret API key using Node.js terminal raw mode, which suppresses terminal echo.
- Does not accept the key as a command-line argument.
- Passes the key only through the child capture process environment; it is not written to source, shell history, or evidence files.
- Clears the parent variable and temporary child-environment object immediately after process launch.
- Invokes the CP-06 finite 31-sample collector.
- Does not write the key to the repository or metrics evidence file.

Run it from the repository root in a local Terminal window:

```zsh
node scripts/cp07/run-metrics-capture.mjs
```

Enter the existing `sb_secret_...` key only at the silent local prompt. Do not paste it into ChatGPT, source files, shell command arguments, screenshots, or HAR exports. The run takes approximately 30 minutes and writes sanitized metric samples to `/tmp/cp06-metrics-samples.json` with file mode `0600`.

### 2.2 Metrics calculation contract

The analyzer uses the published Supabase Grafana metric catalog:

- Database-host CPU: `node_cpu_seconds_total` with `service_type="db"`.
- Service process CPU: `process_cpu_seconds_total`, grouped by actual `service_type` values such as `postgresql` and `gotrue`.
- PostgreSQL counters: the documented `pg_stat_database_*_total` names.
- Database connections: `pg_stat_database_num_backends`.
- PgBouncer pool connections: `pgbouncer_pools_client_active_connections` and `pgbouncer_pools_server_active_connections`.

The report separates non-idle CPU from active execution excluding I/O wait and steal. It reports I/O wait and steal independently. Service process CPU remains separate from host CPU; no unsupported host residual is inferred from an incomplete process-series inventory.

## 3. Supabase Dashboard HAR analysis

### 3.1 Implemented analyzer

`scripts/cp07/analyze-dashboard-har.mjs` reads a local HAR file and produces a sanitized request summary.

It retains only:

- Supabase-owned request host and normalized path.
- HTTP method, status, status text, duration, MIME type, and response byte count.
- A safe provider error code when a JSON error response contains a simple code field.
- Allowlisted trace headers: `x-request-id`, `x-correlation-id`, `x-supabase-request-id`, `traceparent`, `cf-ray`, and `x-amzn-trace-id`.

It does not retain:

- Authorization headers, cookies, request bodies, response bodies, or query strings.
- Arbitrary response headers or arbitrary error messages.
- Raw project UUIDs, long opaque identifiers in URL paths, or project references in project API hostnames.

The output file is created with mode `0600`.

### 3.2 Browser capture procedure

1. Open the Supabase project Dashboard and navigate to **Observability → Database**.
2. Open Chromium/Brave Developer Tools and select **Network**.
3. Enable **Preserve log**.
4. Reload the Database Observability page and wait for the metric panels to finish rendering their success/failure state.
5. Export the Network log as a HAR file to a local path such as `/tmp/cp07-dashboard.har`.
6. Run the local sanitizer:

```zsh
node scripts/cp07/analyze-dashboard-har.mjs \
  /tmp/cp07-dashboard.har \
  /tmp/cp07-dashboard-har-summary.json
```

Do not upload or share the raw HAR. HAR files can contain authentication headers, cookies, query parameters, and response bodies. Only the sanitized summary should be considered for evidence review.

If the HAR contains no report-related requests, the result will explicitly report `reportRequestsFound: 0`. If requests are present, the summary will expose status codes, safe error codes, and allowlisted trace identifiers without exposing credentials or payload contents. A zero client-side report-request count does not prove a browser dispatch defect: the Dashboard may obtain report data through server-side control-plane calls that are not visible in the browser HAR. In that case, provider-side trace correlation is required.

### 3.3 Synthetic verification

A synthetic HAR fixture with a 503 response, a report endpoint, an `x-request-id`, an authorization header, cookies, query token, and private response message was analyzed locally.

Verified behavior:

- Report request detected.
- HTTP 503 retained.
- Safe `REPORTS_UNAVAILABLE` code retained.
- `x-request-id` retained.
- Query token, authorization, cookies, response body, and private message omitted.
- Output file mode `0600`.

This verifies the sanitizer implementation only. It is not evidence that the production Supabase Dashboard returned HTTP 503.

The runner was tested without an interactive TTY and exited with code 2 before making a request. Terminal input behavior, backspace, cancellation cleanup, and key-format validation are covered by deterministic tests.

## 4. Current production observations

The November 24 authenticated Dashboard inspection showed intermittent report availability:

- At approximately 11:19 AM Philippine Time, one page instance displayed five metric panels: Memory usage (813.39 MB), Memory commitment (1.42 GB), CPU usage (2.92%), Network throughput (81.2 KB/s), and Disk IOPS (4).
- In that same instance, Disk throughput, Database Connections, Dedicated Pooler Connections, Shared Pooler Connections, and Disk Usage displayed `Unable to load data`.
- Database Size remained available at approximately 0.45 GB of 2 GB provisioned.
- After a controlled reload, all ten metric panels returned to `Unable to load data` while the global notice **“We are investigating a technical issue”** remained visible.
- At approximately 11:22 AM, a subsequent page instance displayed four panels: Memory usage (869.95 MB), Memory commitment (1.46 GB), CPU usage (3.65%), and Network throughput (133.4 KB/s). Disk IOPS, Disk throughput, Database Connections, Dedicated Pooler Connections, Shared Pooler Connections, and Disk Usage failed (six panels).

This is intermittent partial availability, not a stable recovery. Resource Timing after the controlled reload showed 250 resource entries (3 `link`, 247 `other`), zero fetch/XHR entries, and no request to `api.supabase.com` or the project `supabase.co` host. The only report-related resource was the Dashboard's static observability JavaScript bundle. This suggests the report data may be fetched server-side or may fail before a browser-visible request is issued; it does not establish a browser dispatch defect.

A full HAR export has not yet been captured, so no production report HTTP status, provider error code, or request/trace ID is claimed. Even a HAR with no report API call will need to be reconciled with the possibility of server-side Dashboard service calls through Supabase provider traces.

Project-side unified logs from 01:45–02:55 UTC showed no PostgreSQL error/fatal matches and no Edge HTTP 4xx/5xx matches in the targeted queries. These project logs do not expose the Dashboard control-plane/report-service trace.

The CRM browser remained signed in at `#/time-tracker`. At 11:23:09 AM Philippine Time, the browser reported `navigator.onLine === true`, secure session, signed workspace verification, signed Clock writes active, and `Live synced · Authorized Realtime connected`; no failed Auth refresh resource was present in the current resource timing list. A preceding console view briefly showed `ERR_INTERNET_DISCONNECTED` refresh-token requests, but the subsequent authoritative sync check recovered without a code change or forced sign-out. No session code was changed.

## 5. Verification matrix

| Acceptance area                                                   | Status                                          |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| Silent local key prompt implemented                               | VERIFIED by terminal-input tests                |
| Invalid/empty key exits without a metrics request                 | VERIFIED by key validation and non-TTY tests    |
| Secret omitted from command arguments and source                  | VERIFIED                                        |
| Metrics capture 31/31 successful samples                          | PENDING — key must be entered locally           |
| Authoritative CPU mean/p50/p95/max, I/O wait, steal               | PENDING — requires live metrics samples         |
| Service process CPU grouped by `service_type`                     | VERIFIED by CP-06 tests; live values pending    |
| HAR parser and sanitizer                                          | VERIFIED — 6/6 focused tests                    |
| Silent terminal prompt and key validation                         | VERIFIED — 6/6 focused tests                    |
| CP-07 focused tests                                               | VERIFIED — 12/12 PASS                           |
| Full frontend test suite                                          | VERIFIED — 3,566/3,566 PASS                     |
| HAR output excludes secrets, cookies, query strings, and payloads | VERIFIED by synthetic fixture                   |
| Real Dashboard HAR captured                                       | PENDING — browser export not yet available      |
| Report HTTP status/error code/trace IDs                           | PENDING — requires real HAR/provider trace      |
| Intermittent Database report failure and technical-issue notice   | VERIFIED on November 24 across multiple reloads |
| Same-tab CRM session and Live Realtime state                      | VERIFIED on November 24                         |
| Production frontend/session architecture unchanged                | VERIFIED                                        |
| Database/project/permission mutations                             | NONE                                            |
| Model-training or gradient-descent paths                          | NONE                                            |

## 6. Next acceptance actions

1. Enter the existing Secret API key at the local silent Terminal prompt and allow the 31-sample capture to finish.
2. Export the Supabase Dashboard Network HAR locally with Preserve log enabled.
3. Run the HAR sanitizer and inspect only its sanitized output.
4. Reconcile actual request status/error codes and trace identifiers with the ten failing report panels.
5. If the HAR contains no report-specific request, document the absence of client-visible calls and seek the provider's server-side control-plane trace through the documented support channel; do not infer a browser dispatch defect or a project database fault.
6. Preserve the verified CRM session architecture and rerun the full suite before delivery.
