# CP-CRM-SESSION-CPU-02 — Production CPU Telemetry Recovery and Workload Benchmarking

## Status

**PARTIAL — Auth workload evidence and browser continuity are verified; production CPU telemetry and causal performance acceptance remain blocked.**

Investigation date: 2026-11-23 (UTC).

## Objective

Recover a trustworthy production CPU measurement source, attribute observed Auth traffic to the deployed application, compare equivalent production windows, and establish whether the CP-CRM-SESSION-CPU-01 deployment materially reduced database compute consumption.

## Scope and change boundary

This implementation performed read-only production investigation and controlled browser acceptance.

- No application source code changed.
- No database schema, functions, indexes, policies, or project settings changed.
- No credentials were created, rotated, copied into the repository, or printed.
- No monitoring collector, telemetry SDK, scheduled task, or background agent was installed.
- No new dependencies were introduced.
- No authorization or role behavior was changed.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, or parameter-update process was introduced or executed.

## Deployment anchor

CP-CRM-SESSION-CPU-01 was merged as PR #796:

- Merge commit: `eed84d89991569adf3396d8d76233c53d0cfd3f5`
- GitHub Pages deployment run: [45107372947](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45107372947)
- Deployment result: successful.

CP-CRM-SESSION-CPU-02 was based on the then-current `origin/main` commit `58f4770df6a9ebca20c5685584b552c67ba988de`, which includes the intervening mobile workspace-switch merge.

## 1. Production CPU telemetry

### Supabase Dashboard observation

The authenticated Supabase Dashboard was inspected at:

`Observability → Database`

Two time ranges were checked:

- Last 24 hours.
- Last 10 minutes, including a direct refresh of the report.

The dashboard displayed **Unable to load data** for all of these panels:

- CPU usage.
- Memory usage and memory commitment.
- Network throughput.
- Disk IOPS and disk throughput.
- Database connections.
- Dedicated and shared pooler client connections.
- Disk usage.

The Database Size panel still loaded. The Supabase project itself reported `ACTIVE_HEALTHY`.

This confirms a failure to obtain the requested resource metrics through the current Dashboard view. It does not establish why Supabase's metrics data source is failing.

### Metrics API access

Supabase's documented Metrics API endpoint for this project is:

`https://jtlusodorfnyzgyuewkz.supabase.co/customer/v1/privileged/metrics`

Official documentation: https://supabase.com/docs/guides/observability/metrics

The documented endpoint requires HTTP Basic authentication:

- Username: `service_role`
- Password: a Supabase Secret API key (`sb_secret_...`).

A request without credentials returned HTTP 401 with `No API key found in request`. This is the expected unauthenticated response; it does not prove that the authenticated metrics endpoint is unavailable.

No metrics Secret API key was present in the inspected shell environment or CP-01 repository environment files. No key was retrieved from Dashboard settings or any other secret store.

**Result: BLOCKED.** The authenticated Metrics API cannot be tested without an existing key made available through a secure local mechanism or explicit authorization to create a dedicated key. A key must not be pasted into chat or committed to the repository.

No collector or background process was introduced. A one-time authenticated scrape is sufficient for the next acceptance step.

## 2. Production Auth request comparison

The deployment completed at approximately 2026-11-23 03:40:57 UTC.

Two equal-duration 30-minute windows were compared using Supabase Auth and Edge logs:

- Before: 03:10:00–03:40:00 UTC.
- After: 03:45:00–04:15:00 UTC.

The five-minute deployment interval was excluded.

| Measurement | Before CP-01 | After CP-01 |
|---|---:|---:|
| Total Edge requests | 2,997 | 1,300 |
| Successful Auth `GET /user` requests | 473 | 199 |
| Auth `/user` requests per minute | 15.77 | 6.63 |
| Auth `/user` share of Edge requests | 15.78% | 15.31% |
| Auth `/user` errors | 0 | 0 |

Observed changes:

- Raw Auth `/user` request count decreased by approximately 57.9%.
- Total Edge request volume decreased by approximately 56.6%.
- Auth `/user` share of Edge traffic decreased by only 0.47 percentage points.

The request volume fell, but the normalized share remained almost unchanged. The two windows therefore do **not** demonstrate that CP-01 independently reduced Auth requests per unit of application traffic. Workload composition and user activity were not identical.

The five-minute p95 Auth `/user` latency samples ranged from 4.91–10.20 ms before deployment and 3.84–14.49 ms after deployment. These small samples do not establish a latency improvement.

The Auth log sample contained no `/user` failures in either comparison window. One separate Edge `401` occurred on `POST /rest/v1/rpc/wm_auth_access_context` in the post-deployment window; it was not an Auth `/user` failure.

**Result: VERIFIED request counts; causal CPU and normalized Auth reduction NOT VERIFIED.**

## 3. Production browser request attribution

A genuine signed-in production Chromium session was inspected without submitting or changing any business records.

### Cold application startup

The selected production tab recorded two successful `GET /auth/v1/user` fetches during the initial page load:

| Request | Start after navigation | Duration | Result |
|---|---:|---:|---|
| First | 2,063.1 ms | 243.3 ms | HTTP 200 |
| Second | 3,116.9 ms | 209.3 ms | HTTP 200 |

Both entries had `initiatorType=fetch`.

### In-app navigation

After startup, navigation to the existing TimeTracker route completed without increasing the page's `/auth/v1/user` request count. The signed-in TimeTracker view rendered its existing session information. No clock-in, clock-out, or other write action was performed.

### Subsequent reload

After the provider session had been hydrated and persisted, a browser reload produced one successful `GET /auth/v1/user` request:

| Request | Start after navigation | Duration | Result |
|---|---:|---:|---|
| Reload | 2,081.4 ms | 204.2 ms | HTTP 200 |

This supports a one-time cold-initialization duplicate rather than a recurring verification loop.

### Source-level attribution

Inspection identified two compatible request paths:

1. The pinned GoTrue SDK's initialization recovery path in `frontend/vendor/supabase-auth.js` can call its internal `_getUser(access_token)` when the stored session user is represented by its unavailable-user proxy. It then emits a `SIGNED_IN` event.
2. The application-level `AuthClient.restoreProvider()` in `frontend/session.js` explicitly calls `getVerifiedUser()`, which calls `provider.getUser(token)` and therefore performs another `GET /user`.

The application event handler invalidates its verified-user cache on `SIGNED_IN`. The two code paths are consistent with the two cold-start requests and the one-request subsequent reload.

The browser capture did not include JavaScript call stacks for the individual network entries. This is therefore a strongly supported source-level explanation, not a call-stack-certified mapping of each request.

**Result: PARTIAL.** The initial duplicate is observed and its likely source paths are identified. It is not a repeated loop, and no authentication verification behavior was weakened to remove it.

## 4. PostgreSQL workload samples

The following read-only PostgreSQL snapshots were taken four minutes apart:

- T0: 2026-11-23 04:22:00.964 UTC.
- T1: 2026-11-23 04:26:00.738 UTC.

| Counter | T0 | T1 | Delta |
|---|---:|---:|---:|
| Transaction commits | 3,072,813 | 3,073,264 | +451 |
| Shared-buffer reads | 530,935 | 530,936 | +1 |
| Shared-buffer hits | 2,229,724,023 | 2,229,840,743 | +116,720 |
| Shared-buffer hit ratio | 99.98% | 99.98% | — |
| Deadlocks | 0 | 0 | 0 |

Selected `pg_stat_statements` deltas during the same interval:

| Query pattern | Calls | Total execution time | Mean per observed call |
|---|---:|---:|---:|
| `apsyntra_crm_my_effective_access` | +10 | +345.16 ms | 34.52 ms |
| `wm_auth_access_context` | +23 | +258.56 ms | 11.24 ms |
| `select exists(select $1 from auth.users)` | +0 | +0 ms | — |

The `pg_stat_statements_info.stats_reset` value was 2026-10-20 05:09:04 UTC. Its cumulative counters therefore cover a long period and must not be treated as a current 24-hour CPU profile.

Only `pg_stat_statements` 1.11 was installed among the inspected statement-statistics extensions. `pg_stat_kcache` was not installed. Query execution time and shared-buffer counters are useful workload indicators, but they are not host CPU utilization or per-query CPU time.

**Result: VERIFIED database activity samples; CPU percentage NOT derivable from these counters.**

## 5. Acceptance matrix

| Acceptance area | Result | Evidence / limitation |
|---|---|---|
| Supabase project availability | VERIFIED | Project reports `ACTIVE_HEALTHY` |
| Auth request comparison | VERIFIED | Equal 30-minute windows from production logs |
| Auth workload normalization | PARTIAL | Traffic share nearly unchanged; workloads differ |
| Browser signed-session continuity | VERIFIED | Production route navigation and reload succeeded |
| Repeated verification-loop check | VERIFIED | No new `/user` call during route navigation |
| Cold-start Auth request attribution | PARTIAL | Two calls observed; source paths strongly supported, no call stacks |
| PostgreSQL workload sampling | VERIFIED | Four-minute counter deltas recorded |
| Supabase CPU telemetry | BLOCKED | Dashboard panels unavailable; authenticated Metrics API key not available |
| Sustained CPU acceptance | BLOCKED | No trustworthy CPU time series or percentage available |
| No training/optimization loops introduced | VERIFIED | No source, dependency, database, or runtime changes |

## 6. Conclusion

CP-CRM-SESSION-CPU-02 is **not complete**.

The production Auth and PostgreSQL workload evidence has been recovered, and genuine browser continuity was verified. The raw Auth request count decreased after CP-01, but total API traffic fell by a similar amount; a workload-normalized improvement has not been established.

The principal blocker is trustworthy CPU telemetry. Supabase Dashboard CPU and related resource panels remain unavailable, and the documented Metrics API requires a Secret API key that is not available through the current local environment. No credentials were created or changed.

No speculative code or database optimization was applied. The existing session, workspace, role, and permission behavior remains untouched.

## 7. Next logically necessary implementation

### CP-CRM-SESSION-CPU-03 — Authenticated Metrics API Access, Dashboard Telemetry Failure Diagnosis, and One-Time Production CPU Benchmark

Objectives:

1. Obtain access to the documented Supabase Metrics API using an existing key supplied through a secure local environment variable or a newly authorized dedicated metrics Secret API key.
2. Diagnose why the Supabase Dashboard resource panels are unavailable, using authenticated Metrics API results to separate a Dashboard reporting failure from a project metrics-source failure.
3. Capture a bounded, one-time CPU/IO/connection metric sample; do not install a collector, recurring job, or background agent.
4. Correlate CPU samples with Edge/Auth request counts and PostgreSQL statement deltas over explicitly recorded windows.
5. Recalculate Auth requests per total application/API request and report CPU independently from request volume.
6. Only recommend further code optimization if the measured workload identifies a reproducible bottleneck.
7. Preserve existing Auth verification, session refresh, workspace switching, role behavior, and all current application functionality.

Acceptance criteria:

- [ ] Authenticated Metrics API returns valid Prometheus-format metrics.
- [ ] CPU utilization is measured with a timestamp and documented sampling interval.
- [ ] Dashboard reporting failure is distinguished from metrics endpoint failure.
- [ ] Comparable workload windows are recorded with total requests and Auth request rates.
- [ ] Database statement deltas are aligned with the CPU sample window.
- [ ] No new background collector or telemetry SDK is introduced.
- [ ] No production credentials are created or rotated without explicit authorization.
- [ ] No authorization behavior, schema, or permissions are changed.
- [ ] No gradient descent, backpropagation, model training, or parameter-update process is introduced or executed.
- [ ] Results are reproducible and the CPU acceptance decision is evidence-based.

**Credential prerequisite:** The Metrics API requires a Secret API key. The key must remain local and must never be pasted into chat or committed. Explicit approval is required before creating a production credential; an existing key can instead be made available through a local `SUPABASE_METRICS_API_KEY` environment variable.
