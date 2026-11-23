# CP-CRM-SESSION-CPU-03 — Authenticated Metrics API, Production CPU Benchmark, and Workload Attribution

## Status

**PARTIAL — Metrics API access and a bounded production benchmark are verified. The approximately 3% CPU target is not yet sustained, Supabase Database resource panels remain unavailable, and the production CRM browser did not retain its signed-in UI after a read-only refresh.**

Investigation date: 2026-11-23 (UTC).

## Objective

Recover authenticated production CPU telemetry without creating a new credential, diagnose Supabase Dashboard resource-panel failures, measure CPU from Prometheus counter deltas, correlate the measurements with PostgreSQL and Auth workloads, and perform genuine browser acceptance.

## Implementation boundary

This was a bounded, read-only production investigation plus evidence documentation.

- Used the existing Supabase Secret API key already registered for the project.
- The key was retrieved into process memory only for HTTP Basic authentication. Its value was never written to a file, printed in the report, or committed.
- No new key was created, no key was rotated, and no new Supabase project was created.
- No database schema, function, index, policy, role, or project setting was changed.
- No application source code or runtime behavior was changed.
- No monitoring agent, recurring collector, telemetry SDK, scheduled job, or background service was installed.
- No new dependencies were added.
- No attendance write, clock-in, clock-out, or business-record mutation was performed.
- No authorization restrictions were added or changed.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, or parameter-update process was introduced or executed.

## 1. Authenticated Metrics API recovery

Project:

- Name: APSYNTRACRM
- Project reference: `jtlusodorfnyzgyuewkz`
- Region: `ap-southeast-2`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1

The documented endpoint was successfully authenticated:

`https://jtlusodorfnyzgyuewkz.supabase.co/customer/v1/privileged/metrics`

Official documentation: https://supabase.com/docs/guides/observability/metrics

The endpoint returned Prometheus text exposition successfully.

| Metric | Result |
|---|---:|
| Successful one-time scrapes | 5 of 5 |
| HTTP status | 200 for every sample |
| First sample series | 1,694 |
| First response size | 654,767 bytes |
| First response duration | 0.885 seconds |
| Credential created or rotated | No |

The endpoint exposed database-host CPU counters, PostgreSQL and GoTrue process CPU counters, memory, disk I/O, PgBouncer pools, and connection statistics.

**Result: VERIFIED.** The CP-02 authenticated CPU telemetry blocker is resolved without creating or rotating credentials.

## 2. Production CPU benchmark

Five passive Prometheus snapshots were collected between 05:21:42.000 and 05:35:12.348 UTC on 2026-11-23.

- Total elapsed observation: 810.348 seconds (13 minutes, 30 seconds).
- Database CPU cores reported: 2.
- No synthetic workload was generated.
- No background collector was installed.
- Actual elapsed time between samples varied; CPU rates were calculated from counter deltas divided by each interval's elapsed seconds.

CPU calculation:

`CPU busy % = 100 × (1 − Δidle / Δall CPU modes)`

This is the common Prometheus-style expression in which I/O wait is included as non-idle time. A second figure subtracts I/O wait to show active CPU excluding I/O wait.

### Interval results

| UTC interval | Duration | CPU incl. I/O wait | CPU excl. I/O wait |
|---|---:|---:|---:|
| 05:21:42–05:26:23 | 281.795 s | 5.26% | 4.59% |
| 05:26:23–05:30:17 | 234.061 s | 2.75% | 2.61% |
| 05:30:17–05:33:31 | 193.165 s | 6.02% | 5.15% |
| 05:33:31–05:35:12 | 101.327 s | 2.08% | 1.99% |

### Overall counter-delta result

| Measurement | Result |
|---|---:|
| Time-weighted host CPU, including I/O wait | 4.32% |
| Host CPU excluding I/O wait | 3.82% |
| I/O wait contribution | 0.50% |
| PostgreSQL process CPU | 0.019% of one core |
| GoTrue process CPU | 0.180% of one core |

The host CPU result is not the same as the CPU percentage attributable to the PostgreSQL or GoTrue processes. Their measured process CPU counters were very low. The host-level busy time therefore cannot be attributed solely to SQL or Auth execution from this sample.

The established target is approximately 3%. The 13.5-minute time-weighted average of 4.32% does not meet that target, and the interval range of 2.08–6.02% shows variability. This is a short diagnostic sample, not a 24-hour or full-shift sustained benchmark.

**Result: VERIFIED CPU measurement; target NOT YET ACCEPTED.**

### Memory, disk, and connection observations

- Database host memory total: 978,493,440 bytes (approximately 933 MiB).
- Available memory ranged from approximately 443.6 MiB to 475.9 MiB during the snapshots (47.5%–51.0%).
- First measured disk interval: approximately 0.59 MiB/s read and 0.25 MiB/s written.
- Initial PgBouncer sample: zero waiting clients, two server connections in use, one active client connection.
- Direct PostgreSQL connection counter: zero.
- Connection statistics reported 17 connections across the reported role groups in the initial sample.

These are low observed I/O and connection levels; they do not indicate connection-pool saturation in the sampled instant.

## 3. PostgreSQL workload attribution

Read-only PostgreSQL counters were sampled from 05:22:55.526 to 05:31:09.821 UTC.

| Measurement | Delta / result |
|---|---:|
| Transaction commits | +820 |
| Transaction rollbacks | 0 |
| Shared-buffer reads | 0 |
| Shared-buffer hits | +198,386 |
| Shared-buffer hit ratio | 99.976% |
| Deadlocks | 0 |

Selected `pg_stat_statements` deltas:

| Query | Calls | Total execution time | Mean for delta calls |
|---|---:|---:|---:|
| `apsyntra_crm_my_effective_access` | +4 | +167.36 ms | 41.84 ms |
| `wm_auth_access_context` | +12 | +198.25 ms | 16.52 ms |
| `select exists(select $1 from auth.users)` | +0 | +0 ms | — |

These are statement execution-time measurements, not host CPU measurements. No SQL rewrite, index change, or database tuning was justified by this short sample.

## 4. Workload-normalized Auth request comparison

Equal-duration 30-minute windows were compared using Supabase Auth and Edge logs.

| Window | Total Edge requests | Auth `GET /user` | Auth share |
|---|---:|---:|---:|
| Before CP-01, 03:10–03:40 UTC | 2,997 | 473 | 15.78% |
| After CP-01, 03:45–04:15 UTC | 1,300 | 199 | 15.31% |
| Current, 05:00–05:30 UTC | 914 | 69 | 7.55% |

Current 30-minute Auth details:

- 65 `GET /user` responses were HTTP 200.
- 4 `GET /user` responses were HTTP 403.
- 5 Auth `/token` requests were HTTP 200.
- No Auth or Edge HTTP 5xx errors were observed.
- Successful `GET /user` p95 was 17.61 ms.
- `/token` p95 was 105.14 ms.

The current normalized `/user` share is approximately 50.7% lower than the post-CP-01 30-minute sample. Total Edge request volume is also approximately 29.7% lower than that earlier sample.

This is a directionally positive observation, not causal proof of CP-01 impact: the workload mix and request volume differ between windows. The four HTTP 403 responses are denials, not server-side 5xx failures. No authorization behavior was changed.

A narrower 05:21:42–05:30:18 UTC sample contained nine successful `GET /user` requests across 159 Edge requests (5.66%), with no errors.

**Result: VERIFIED current request attribution; causal improvement NOT PROVEN.**

## 5. Supabase Dashboard telemetry diagnosis

The authenticated Supabase Dashboard Database report was refreshed with a current 10-minute time window.

The following resource panels continued to show `Unable to load data`:

- CPU usage.
- Memory usage and memory commitment.
- Network throughput.
- Disk IOPS and disk throughput.
- Database connections.
- Dedicated and shared pooler client connections.
- Disk usage.

The Database Size panel remained available.

The separate Supabase Query Performance report loaded successfully and displayed:

- 141 slow queries.
- 99.99% cache hit rate.
- 11.6 average rows per call.

This distinguishes the failure from a complete Supabase Dashboard outage. The authenticated Metrics API is healthy, and Query Performance is available; the failure is isolated to the Database resource-report panels or their internal reporting path. The Dashboard did not expose a request failure code sufficient to identify the exact internal component.

**Result: PARTIAL.** The affected Dashboard surface is isolated, but its internal failure root cause is not exposed. The Metrics API is a working diagnostic source and fallback.

## 6. Genuine production browser acceptance

The existing Chromium CRM tab was inspected at:

`https://wass-psti.github.io/APSYNTRACRM/#/time-tracker`

Observed sequence:

1. The production TimeTracker route initially rendered with the existing active attendance session.
2. The app's sync indicator later displayed `Offline · Not connected`, although `navigator.onLine` was true.
3. A read-only `Refresh TimeTracker attendance` action was used; no attendance write or clock action was invoked.
4. The CRM UI then displayed the sign-in screen.
5. The same tab recorded a successful `GET /auth/v1/user` response (HTTP 200).
6. Auth logs for the transition window recorded two successful `GET /user` requests and no HTTP 403 or token-refresh request.

This is a client-side session/UI state mismatch that remains unexplained: the Auth user endpoint returned HTTP 200, but the CRM UI did not remain in the signed-in TimeTracker state.

No login attempt was made, no credentials were entered, and no attendance session was ended or modified.

**Result: NOT ACCEPTED.** Genuine browser session continuity is not proven.

## 7. Acceptance matrix

| Acceptance area | Result | Evidence |
|---|---|---|
| Existing credential reuse | VERIFIED | Existing Secret API key used; no create or rotate |
| Authenticated Metrics API | VERIFIED | Five HTTP 200 Prometheus responses |
| CPU counter calculation | VERIFIED | Five snapshots and four elapsed-time intervals |
| Memory / disk / connection sampling | VERIFIED | Metric counters and connection snapshot |
| PostgreSQL workload correlation | VERIFIED | Database and statement deltas |
| Workload-normalized Auth attribution | VERIFIED | Three equal-duration comparison windows |
| Causal CP-01 performance improvement | NOT PROVEN | Different workload volume and mix |
| Dashboard Database resource panels | PARTIAL | Panels fail while Metrics API and Query Performance work |
| Approximately 3% CPU target | NOT ACCEPTED | 4.32% average over 13.5 minutes; variable intervals |
| Production browser session continuity | NOT ACCEPTED | Sign-in UI despite HTTP 200 from `/auth/v1/user` |
| No source/schema/permission changes | VERIFIED | Documentation and evidence only |
| No training/gradient-descent execution | VERIFIED | No code, dependency, or runtime training path introduced |

## 8. Conclusion

CP-CRM-SESSION-CPU-03 is **PARTIAL — NOT COMPLETE**.

The primary CP-02 blocker is resolved: authenticated production CPU metrics are now available using an existing credential, without creating or rotating a production key. Five snapshots provided a real CPU measurement, and the workload was correlated with PostgreSQL and Auth activity.

However:

1. The measured 13.5-minute CPU average is 4.32%, above the approximately 3% target, with interval variation up to 6.02%.
2. PostgreSQL and GoTrue process CPU counters are very low; host-level CPU activity is not yet fully attributed.
3. Supabase Database resource panels remain unavailable even though the Metrics API and Query Performance report work.
4. The production CRM browser transitioned to the sign-in UI after a read-only refresh despite a successful Auth `GET /user` response.

No speculative optimization was applied. No security, role, authorization, database, or production configuration changes were made.

## 9. Next logically necessary implementation

# CP-CRM-SESSION-CPU-04

**Remaining Host CPU Attribution, Workload-Normalized Optimization, Dashboard Resource-Report Failure Isolation, and CRM Browser Session Rehydration Closure.**

### Objectives

1. Attribute host CPU counters across all available process and service metrics, including CPU steal, system, user, and I/O wait.
2. Run a longer bounded passive benchmark with equivalent workload windows and explicit elapsed-time normalization; do not install a collector.
3. Determine whether the remaining CPU usage is attributable to application processes, database work, or host-level activity before changing SQL or application code.
4. Reconcile the current Auth request share against comparable 30-minute windows and identify the source of the four `GET /user` HTTP 403 responses without weakening authorization.
5. Diagnose the CRM browser state mismatch where `GET /auth/v1/user` returns HTTP 200 but the UI displays sign-in.
6. Restore and verify signed-in TimeTracker UI continuity without touching the active attendance record.
7. Continue to use the authenticated Metrics API as a temporary evidence source while documenting the Supabase Dashboard Database report failure.
8. Apply only small, evidence-supported optimizations after the actual CPU contributor is established.

### Acceptance criteria

- [ ] A comparable 30-minute passive CPU benchmark is recorded.
- [ ] Average CPU reaches the approximately 3% target or remaining non-application/host contribution is conclusively attributed.
- [ ] CPU p50, p95, maximum, I/O wait, and steal are reported.
- [ ] PostgreSQL and Auth process CPU are separated from host CPU.
- [ ] Auth request rates are normalized against total Edge requests and workload activity.
- [ ] The four HTTP 403 requests are attributed without changing authorization policy.
- [ ] A production CRM browser refresh preserves the signed-in TimeTracker UI when Auth returns HTTP 200.
- [ ] No attendance writes or unintended business-record mutations occur during acceptance.
- [ ] Dashboard failure is isolated to an actionable cause or explicitly classified as an external Supabase reporting issue.
- [ ] No unnecessary security, permission, or architecture restrictions are introduced.
- [ ] No new credentials are created or rotated without explicit approval.
- [ ] No background collector, telemetry SDK, gradient descent, backpropagation, or model-training process is introduced.

## 10. Evidence files

- `docs/CP-CRM-SESSION-CPU-03.md` — this implementation report.
- `docs/evidence/cp03-production-metrics-samples.json` — sanitized five-sample production metrics and derived counter calculations.

No credential value is present in either file.
