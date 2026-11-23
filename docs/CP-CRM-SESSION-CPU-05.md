# CP-CRM-SESSION-CPU-05 — Sustained CPU Benchmark, Database Report Diagnostics, and Session Rehydration Acceptance

**Date:** 2026-11-23  
**Project:** APSYNTRACRM  
**Production project ref:** `jtlusodorfnyzgyuewkz`  
**Region:** `ap-southeast-2`  
**Database:** PostgreSQL 17  
**Starting main commit:** `9cce99a`  
**Disposition:** **PARTIAL — diagnostics and regression verification completed; final acceptance blocked by unavailable authoritative telemetry and current-browser session evidence.**

## 1. Scope and change boundary

CP-05 continues only the four residual acceptance items documented in CP-04 section 14.4:

1. A comparable 30-minute CPU benchmark with exact percentiles.
2. Host/process attribution where provider telemetry supports it.
3. Isolation of unavailable Database report panels.
4. Genuine post-deployment signed-session and workspace-recovery acceptance.

No application runtime source, SQL migration, database configuration, role, permission, credential, Supabase project setting, or deployment configuration was changed. No production session was revoked. No attendance or business records were written.

No gradient descent, backpropagation, training, retraining, fine-tuning, iterative weight updates, or model-parameter optimization was introduced or executed.

## 2. Production health and workload evidence

### 2.1 Project health

The live Supabase project lookup returned:

- Status: `ACTIVE_HEALTHY`
- PostgreSQL: 17
- Region: `ap-southeast-2`

### 2.2 Workload window

**Window:** 2026-11-23 07:53–08:23 UTC (15:53–16:23 Asia/Manila).

| Evidence                                            |       Observed result |
| --------------------------------------------------- | --------------------: |
| API Gateway requests                                |                 2,101 |
| Mean gateway request rate                           | 70.03 requests/minute |
| HTTP 4xx/5xx responses in the sampled gateway query |                     0 |
| WebSocket upgrades                                  |                    25 |

These are project-wide aggregates. They are not tied to a specific browser identity and must not be interpreted as per-user session telemetry.

### 2.3 PostgreSQL snapshot

Read-only SQL snapshot:

| Measurement                           |               Result |
| ------------------------------------- | -------------------: |
| Current database connections          |              17 / 60 |
| Active                                |                    2 |
| Idle                                  |                   14 |
| Idle in transaction                   |                    0 |
| Active sessions waiting               |                    1 |
| Connection count / configured maximum |               28.33% |
| Database size                         | approximately 449 MB |

This snapshot does not indicate connection saturation. The PostgreSQL connection count is not interchangeable with the Dashboard's pooler-client connection series.

## 3. CPU benchmark — exploratory only, not accepted

The Supabase Database report was set to **Last 30 minutes**. The rendered CPU chart exposed 31 plotted points. A preliminary extraction from SVG chart coordinates produced the following estimates:

| Derived chart estimate              |                 Value |
| ----------------------------------- | --------------------: |
| Mean active CPU, excluding I/O wait |  approximately 3.161% |
| Median active CPU                   |  approximately 2.243% |
| p95 active CPU                      | approximately 11.111% |
| Maximum active CPU                  | approximately 11.738% |
| Mean I/O wait                       |  approximately 0.435% |

**Important measurement limitation:** these values were reconstructed from rendered chart geometry, not scraped from raw Prometheus samples. The plotted coordinates are quantized by chart dimensions and cannot be treated as exact metric samples. They are useful as an exploratory indication only and are **not accepted** as the authoritative 30-minute benchmark.

The earlier Dashboard-reported 3.17% average over 60 minutes remains a useful directional observation, but it does not provide the required 30-minute p50, p95, or maximum.

### 3.1 Authoritative Metrics API path

Supabase documents a Prometheus-compatible Metrics API at:

`https://<project-ref>.supabase.co/customer/v1/privileged/metrics`

It emits approximately 200 database performance/health series and is intended to be scraped once per minute. The documented endpoint uses HTTP Basic Auth with username `service_role` and a Secret API key.

Supabase also documents a Management API scrape route:

`GET /v1/projects/{ref}/analytics/endpoints/metrics`

The documented fine-grained OAuth scope is `analytics:read`, with the `analytics_logs_read` permission.

The connected Supabase toolset exposes project, SQL, logs, and advisor operations but no Metrics API scrape action. The local Supabase CLI access-token file was absent. No new token, Secret API key, or credential was created, revealed, copied, or rotated.

**Result:** authoritative raw metric sampling is blocked pending an already-authorized Management API token with the documented metrics scope, or an already-existing dedicated metrics key made available through an approved secret-safe runtime path. No credential should be printed into terminal output or committed to the repository.

### 3.2 Host/process attribution

The Dashboard CPU categories (User, System, IOWait, IRQs, Other, Idle) provide category-level attribution, not per-process CPU attribution. The documented Metrics API is a database performance/health feed; it must not be assumed to expose every Supabase host service process.

No process-level host attribution is claimed. If the provider does not expose the remaining process counters, record that as a provider telemetry limitation rather than infer the missing values.

## 4. Database report availability — corrected plan classification

The Supabase Reports documentation, updated 2026-11-18, distinguishes plan availability as follows:

| Database report              | Documented availability | CP-05 observation     |
| ---------------------------- | ----------------------- | --------------------- |
| CPU usage                    | Free, Pro               | Working               |
| Memory usage                 | Free, Pro               | Working               |
| Disk IOPS                    | Free, Pro               | Working               |
| Database connections         | Free, Pro               | Panel failed          |
| Disk usage                   | Free, Pro               | Panel failed          |
| Database size                | Free, Pro               | Working               |
| Dedicated Pooler connections | Team, Enterprise        | Not a Pro entitlement |
| Shared Pooler connections    | Team, Enterprise        | Not a Pro entitlement |
| Disk throughput              | Team, Enterprise        | Not a Pro entitlement |

This corrects the earlier CP-04 classification: Dedicated Pooler and Shared Pooler connection charts are not Pro-supported panels. Their absence on Pro is expected plan behavior, not a provider defect. Disk throughput is likewise plan-gated.

Only **Database connections** and **Disk usage** remain observed failures among the Free/Pro-supported Database charts. Database size is available and returned a value of approximately 449 MB, but that does not substitute for the full Disk usage breakdown.

The Database Connections panel's pooler series is not proven by a `pg_stat_activity` snapshot. The latter is an independent PostgreSQL check only.

No internal report-service HTTP error, trace ID, or request ID was captured for the two failing panels. Their exact provider-side root cause therefore remains unconfirmed.

## 5. Session and workspace evidence

### 5.1 Project-wide Auth/API logs

**Window:** 2026-11-23 08:45–09:05 UTC.

| Endpoint               | Requests | Status |
| ---------------------- | -------: | -----: |
| `/auth/v1/user`        |      169 |    200 |
| `/auth/v1/token`       |        4 |    200 |
| Auth API Gateway total |      177 |    200 |

Relevant workspace/board RPCs in the same window also returned HTTP 200:

| RPC                                | Requests | Status |
| ---------------------------------- | -------: | -----: |
| `wm_auth_access_context`           |      502 |    200 |
| `work_board_access`                |      359 |    200 |
| `native_application_board_context` |      156 |    200 |
| `wm_get_board_shell`               |       46 |    200 |
| `wm_list_boards`                   |       42 |    200 |

These are project-wide logs and cannot prove that the currently selected browser tab performed or received those requests.

One unrelated/unattributed `wm_board_group_view_read` route produced six HTTP 404 requests in the window. The user agent was a Windows Edge client; no evidence ties those requests to the selected Mac browser or to CP-04 session recovery. This is not classified as the cause of the current session indicator.

### 5.2 Current selected browser tab

The connected browser's current TradeLink tab reports:

- Secure session indicator visible.
- Sync state: **Sync issue**.
- Detail: **Signed refresh unavailable**.
- Last authoritative check: **Not yet verified**.
- Sign-out control remains visible.

This is a live client-side warning and cannot be accepted as successful session rehydration. The project-wide HTTP 200 aggregates do not override the browser's unverified state.

A separate local Chromium process/profile was inspected during the earlier attempt. Because it was not proven to be the same selected browser tab/session, its state is not accepted as production session-rehydration evidence. The earlier claimed browser PASS is therefore reclassified to **PENDING / NOT VERIFIED**.

No actual Auth session revocation, sign-out, attendance write, or production record mutation was performed.

## 6. Automated verification

Verification was rerun at main commit `9cce99a` after rebasing the CP-05 work branch onto the latest mainline.

| Check                    | Result                 |
| ------------------------ | ---------------------- |
| Full frontend test suite | **3,521 / 3,521 PASS** |
| `npm run check`          | PASS                   |
| `npm run lint`           | PASS                   |
| `npm run format:check`   | PASS                   |
| `npm run build`          | PASS                   |

The production build retains the existing Vite advisory for a main JavaScript chunk larger than 500 kB. This is not a CP-05 regression and was not changed under this scope.

No runtime source files were modified by CP-05.

## 7. Acceptance matrix

| Acceptance criterion                                           | Status                     | Evidence / remaining work                                                                   |
| -------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| Live project health and 30-minute workload baseline            | VERIFIED                   | Active/healthy project, log and SQL snapshots                                               |
| Exact 30-minute CPU mean, p50, p95, maximum, I/O wait          | PENDING                    | SVG estimates are not raw metrics; authorized Metrics API access required                   |
| Host process attribution                                       | PARTIAL                    | Dashboard categories available; provider process counters not exposed through current tools |
| Pro-supported Database Connections report                      | PENDING                    | Panel failure observed; no internal error/trace captured                                    |
| Pro-supported Disk Usage report                                | PENDING                    | Panel failure observed; no internal error/trace captured                                    |
| Pooler charts and Disk throughput classification               | VERIFIED                   | Team/Enterprise entitlement, not Pro failures                                               |
| Post-deployment current-browser session rehydration            | PENDING                    | Selected tab currently reports Sync issue / Signed refresh unavailable                      |
| Auth/workspace project-wide endpoint health                    | VERIFIED as aggregate only | Sampled endpoint responses were HTTP 200; not correlated to one browser identity            |
| Automated regression/build verification                        | VERIFIED                   | 3,521 tests and all listed checks pass                                                      |
| No database/role/permission/credential/project-setting changes | VERIFIED                   | Read-only diagnostics only                                                                  |
| No training or gradient-descent execution                      | VERIFIED                   | No related code, dependencies, or execution path introduced                                 |

## 8. CP-05 disposition

**PARTIAL — NOT CLOSED.**

CP-05 completed the read-only workload/database diagnostics, corrected Supabase report entitlement classification, and passed the repository regression/build suite. It did not satisfy the exact CPU benchmark, provider report trace, or current-browser session acceptance criteria.

No production code or configuration change is justified by the available evidence. In particular, do not tune SQL, add indexes, change polling intervals, alter session expiry behavior, or modify database settings based on the approximate chart extraction.

## 9. Next solid implementation recommendation

### CP-CRM-SESSION-CPU-06 — Authoritative Metrics Capture, Report-Service Failure Tracing, and Current-Browser Session Recovery Root-Cause Closure

**Objectives**

1. Obtain an authorized, secret-safe Metrics API path using an existing Management API token with `analytics:read` / `analytics_logs_read`, or an already-existing dedicated metrics key. Do not create, reveal, or rotate credentials without the required explicit approval.
2. Capture a foreground, finite 30-minute metrics series at the documented one-minute cadence. Store only sanitized metric names, timestamps, and numeric samples; never persist credentials.
3. Calculate exact mean, p50, p95, maximum, I/O wait, idle, and any available steal/process counters. Explicitly report any metrics the provider does not expose.
4. Capture the Database Connections and Disk Usage report failures at the HTTP/trace level through a supported authenticated dashboard path, or obtain a definitive provider-side classification. Do not change the project plan or settings.
5. Reproduce the selected browser's `Signed refresh unavailable` state in the same browser profile. Capture the failing client operation and exact RPC/HTTP response, then fix only a confirmed root cause.
6. Revalidate genuine Auth identity, workspace context, board catalog, page reload, and live synchronization without attendance or business-record writes.

**Acceptance criteria**

- At least 30 timestamped, authoritative metric samples covering 30 minutes.
- Exact CPU distribution statistics calculated from raw samples, not chart pixels.
- Workload-normalized comparison with request volume and database waits.
- Per-process attribution only where provider metrics actually support it.
- A captured error/trace or definitive entitlement/service classification for each failing Pro-supported report.
- The same browser profile transitions from the observed sync issue to a verified authoritative sync state after reload/recovery.
- Workspace-context 401/403/42501 preserves an independently valid Auth identity and exposes retry; genuine Auth identity 401/403 follows the existing sign-in path.
- Full regression, lint, format, build, and browser acceptance pass.
- No unrelated authorization, role, schema, project-setting, or architecture changes.

**CP-06 remains a recommendation; no CP-06 work has been started.**
