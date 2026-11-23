# CP-CRM-SESSION-CPU-04 — Host CPU Attribution, Auth Workload Reconciliation, Dashboard Report Isolation, and Session Rehydration

## Status

**PARTIAL — implementation and local verification pass; the sustained 30-minute CPU benchmark and the Supabase Database report's internal failure code remain outstanding.**

Investigation date: 2026-11-23 (UTC).

## 1. Scope and safeguards

This implementation continues the CP-CRM-SESSION-CPU-01/02/03 work.

The work was limited to read-only production diagnostics, a focused client-side session-recovery correction, regression tests, and evidence documentation.

- No Supabase database schema, table, function, index, RLS policy, role, or permission was changed.
- No production project setting was changed.
- No new project or credential was created.
- No existing credential was rotated.
- No credential value was written to evidence or displayed.
- No attendance write, clock-in, clock-out, or business-record mutation was performed.
- No background collector, scheduled job, telemetry SDK, or monitoring service was installed.
- No new dependency was added.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, or model-parameter update mechanism was introduced or executed.

## 2. Host CPU attribution — correction to CP-03 accounting

The existing CP-03 Prometheus snapshots were reprocessed using the actual CPU counter deltas. This is a correction of the previous sample, not a new benchmark.

Observation window: 05:21:42.000–05:35:12.348 UTC (810.348 seconds), with two logical CPUs.

| CPU accounting                                       |    Result |
| ---------------------------------------------------- | --------: |
| Non-idle time, including I/O wait and steal          |     4.32% |
| Non-idle time excluding I/O wait but including steal |     3.82% |
| Active execution excluding both I/O wait and steal   | **3.25%** |
| I/O wait contribution                                |     0.50% |
| Hypervisor steal contribution                        |     0.57% |

The earlier 4.32% figure counted I/O wait and hypervisor steal as non-idle time. For estimating active guest execution, excluding both produces approximately 3.25%, which is close to the approximately 3% target.

The process counters showed:

- PostgreSQL: approximately 0.019% of one core.
- GoTrue: approximately 0.180% of one core.

The authenticated Metrics API exposed host CPU counters for the database host and process CPU counters for PostgreSQL and GoTrue. It did not expose process CPU series for the remaining host services. Therefore, the remaining approximately 3.25% active host execution cannot be attributed to PostgreSQL or GoTrue from the available metric set.

The current Supabase Project Overview separately displayed CPU 4%, RAM 53%, disk 47%, and 19/60 database connections, with project status Healthy. This is a rounded point-in-time overview value, not a 30-minute average.

**Result: PARTIAL.** The corrected historical sample is near the target, but a comparable sustained benchmark and complete host process attribution are not yet available.

## 3. Auth request attribution and workload normalization

Read-only Supabase unified logs were queried for the 30-minute window 06:13:00–06:43:00 UTC.

### Edge gateway

| Measurement                     |    Result |
| ------------------------------- | --------: |
| Total Edge requests             |     2,473 |
| OPTIONS preflights              |       360 |
| Non-preflight requests          |     2,113 |
| Auth GET /user                  |       142 |
| Auth POST /token                |        15 |
| Combined Auth requests          |       157 |
| Auth share of all Edge requests |     6.35% |
| Auth share excluding preflights |     7.43% |
| HTTP 401 / 403 / 5xx            | 0 / 0 / 0 |

The Auth GET /user share was 5.74% of all Edge traffic. In the CP-03 comparison window, it was 7.55%. The current share is directionally lower, but the total workload and route mix differ; this is not proof of a causal CP-01 improvement.

### Auth service logs

| Endpoint    | Requests |   Successful | Mean duration | p95 duration |
| ----------- | -------: | -----------: | ------------: | -----------: |
| GET /user   |      125 | 125 HTTP 200 |      3.815 ms |     7.544 ms |
| POST /token |        8 |   8 HTTP 200 |     41.215 ms |   121.621 ms |

The Edge gateway and Auth service logs returned different counts for the same nominal window (142 versus 125 GET /user; 15 versus 8 POST /token). The cause of this log-stream discrepancy was not established. All Auth service request rows observed were HTTP 200.

**Result: VERIFIED request attribution with a log-source reconciliation limitation.** No authorization behavior or token-refresh policy was changed.

## 4. PostgreSQL workload and connection evidence

Read-only PostgreSQL counters and activity were inspected at 06:46:52.701 UTC.

Selected cumulative pg_stat_statements values:

| Function                         |  Calls | Mean execution |
| -------------------------------- | -----: | -------------: |
| wm_list_boards                   | 36,643 |      189.38 ms |
| apsyntra_crm_my_effective_access | 17,012 |      123.36 ms |
| wm_get_board_items_page          | 20,342 |       44.39 ms |
| wm_get_board_shell               | 20,392 |       27.91 ms |
| wm_auth_access_context           | 94,721 |        6.59 ms |

These are cumulative statistics, not 30-minute deltas and not direct host CPU attribution. They were not used to justify speculative SQL or index changes.

The sampled activity showed eight idle PostgREST connections, two idle Realtime connections, one active Realtime replication connection, and one active management API connection. Most reported client connections were idle.

Across the 06:13–06:43 UTC PostgreSQL log window, 484 log rows were observed with zero error rows, zero deadlock rows, and zero canceled-statement rows.

**Result: VERIFIED database workload snapshot.** No database optimization or migration was justified by this evidence.

## 5. Supabase Database report failure isolation

The Database Observability report continued to show `Unable to load data` for multiple resource panels, while the project remained healthy and the Project Overview summary loaded.

The organization is on the Pro plan. Supabase's current [Reports documentation](https://supabase.com/docs/guides/observability/reports) states that CPU usage, memory usage, Disk IOPS, database connections, disk usage, and database size are available on Pro. Memory commitment, network throughput, and disk throughput are listed under advanced telemetry for Team, Enterprise, and Platform plans.

Therefore, plan availability can explain some advanced panels, but it does not explain the failures of the core Pro Database charts. The Database Size panel and Project Overview summary were available.

The Dashboard did not expose the internal request's HTTP status, trace ID, or report-service error code. A fresh report navigation did not provide a stable diagnostic response; the project Overview remained accessible.

**Result: PARTIAL.** The failure is isolated to the detailed Database report data path rather than general project health, but its internal root cause is not exposed.

## 6. CRM session rehydration correction

### Root cause boundary

CP-03 observed a production transition where the CRM displayed sign-in even though the same tab had received HTTP 200 from `/auth/v1/user`. The exact failing workspace RPC response was not captured, so the original incident's precise root cause cannot be claimed as proven.

The code path did, however, conflate two separate outcomes:

1. An invalid or expired Auth identity.
2. A workspace-context read denial or temporary mismatch while the Auth session remained signed in.

### Implemented correction

**Files changed:**

- `frontend/app.js`
- `frontend/platform-sync.js`
- `frontend/tests/cp-crm-session-cpu-04.test.mjs`

The platform reconciliation flow now:

1. Verifies the Auth identity separately from the workspace-context RPC.
2. Retains the existing sign-in recovery behavior when the Auth identity endpoint itself returns 401/403.
3. When a signed-in session encounters a workspace-context 401/403 or SQLSTATE 42501, clears stale workspace/board data and presents the existing bounded Retry connection UI without discarding the Auth session.
4. Uses the same retry surface for a verified user/workspace-context mismatch.
5. Stops platform synchronization once per recovery path and avoids duplicate board-cache invalidation.

This does not bypass server-side workspace checks or grant additional access. The workspace remains unavailable until the existing server context can be restored. No roles, policies, RLS, or permissions were modified.

### Production browser refresh

The existing production Chromium tab was reloaded at the TimeTracker route.

After refresh:

- The CRM remained signed in as the existing LM session.
- The Secure session indicator remained visible.
- TimeTracker Attendance rendered.
- The existing active attendance session remained present.
- No sign-in form appeared.
- No attendance write or clock action was performed.
- The sync indicator showed `Checked · Authorized polling fallback`; Live Realtime sync was not confirmed.

**Result: VERIFIED production refresh persistence on the currently deployed application.** The CP-04 code correction is not yet deployed, so the production browser result does not prove that the new code is running in production.

## 7. Automated verification

| Check                               | Result           |
| ----------------------------------- | ---------------- |
| Focused Auth/session regression set | 31/31 PASS       |
| New CP-04 regression tests          | 6/6 PASS         |
| Full frontend test suite            | 3,494/3,494 PASS |
| `npm run check`                     | PASS             |
| Repository ESLint                   | PASS             |
| ESLint on all CP-04 changed files   | PASS             |
| Repository Prettier check           | PASS             |
| CP-04 test Prettier check           | PASS             |
| Production Vite build               | PASS             |

The production build emitted two existing warnings: the classic `startup-guard.js` script is not bundled without a module type, and the main application chunks exceed the 500 kB advisory threshold. The build completed successfully; neither warning was changed as part of this scope.

## 8. Acceptance matrix

| Acceptance area                                      | Status                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Corrected CPU counter accounting                     | VERIFIED                                              |
| CPU close to 3% on existing sample                   | VERIFIED at 3.25% active execution                    |
| Comparable sustained 30-minute CPU benchmark         | NOT RUN                                               |
| Full host process attribution                        | PARTIAL — metric series do not expose all processes   |
| Auth workload normalization                          | VERIFIED with log-source count discrepancy            |
| PostgreSQL workload correlation                      | VERIFIED snapshot; no current-window statement deltas |
| Database report failure isolated from project health | VERIFIED                                              |
| Detailed Database report internal failure cause      | NOT RESOLVED                                          |
| Production browser refresh retains signed-in session | VERIFIED                                              |
| Active attendance session preserved                  | VERIFIED                                              |
| CP-04 session-recovery code and regression tests     | IMPLEMENTED AND TESTED                                |
| CP-04 code deployed to production                    | NOT DEPLOYED                                          |
| No database, permission, or project-setting changes  | VERIFIED                                              |
| No credential creation or rotation                   | VERIFIED                                              |
| No training or gradient-descent execution            | VERIFIED                                              |

## 9. Outstanding work

A one-time 31-sample/30-minute Metrics API sampler was prepared. Its invocation was held by the client safety review because it asks the Supabase CLI to reveal the existing Secret API key. The review panel is awaiting the user's Run/Cancel choice. The key was not displayed, written to disk, or rotated. No background collector was installed.

The following items remain open:

1. Complete the bounded 30-minute CPU sample and calculate p50, p95, maximum, I/O wait, and steal.
2. Reconcile the Edge gateway and Auth service log-count difference using request-level correlation.
3. Capture the detailed Database report's internal failing request status/trace ID or classify it as a Supabase reporting-service issue.
4. Integrate the CP-04 branch with the current `origin/main`, which advanced 26 commits beyond the CP-03 branch base, before opening a PR.
5. After CI and deployment, verify the new recovery behavior in a genuine production browser session.

## 10. Conclusion

CP-CRM-SESSION-CPU-04 is **PARTIAL — NOT CLOSED**.

The focused session-recovery correction is implemented and tested. The full 3,494-test suite, lint, format, syntax checks, and production build pass. A genuine production page refresh preserved the signed-in TimeTracker session and its active attendance record.

The CPU accounting correction places active execution near the requested target (3.25%) and avoids misclassifying I/O wait and hypervisor steal as active guest execution. However, the required sustained 30-minute sample is still pending. The Dashboard's detailed Database report remains unavailable for core Pro charts, and its internal failure code is not exposed.

No speculative SQL changes, permission changes, project-setting changes, or production deployment were made.

## 11. Recommended next move

# CP-CRM-SESSION-CPU-05 — Sustained CPU Benchmark Closure, Auth Log Correlation, and Supabase Database Report Failure Root-Cause Resolution

### Objectives

- Complete the 30-minute passive CPU benchmark using the existing credential only after the pending review action.
- Reconcile Auth service and Edge gateway counts at request level.
- Determine whether the detailed Database report failure is a Supabase reporting-service issue or a project-specific report query failure.
- Rebase CP-04 onto the latest `origin/main`, pass CI, and deploy the narrowly scoped session-recovery correction.
- Repeat genuine production refresh acceptance after deployment.

### Acceptance criteria

- [ ] 31 authenticated Metrics API samples complete successfully across 30 minutes.
- [ ] CPU average, p50, p95, maximum, I/O wait, and steal are calculated from elapsed-time counter deltas.
- [ ] CPU remains approximately 3% active execution or all remaining host contributors are attributed.
- [ ] Auth/Edge request counts reconcile or their telemetry gap is documented with evidence.
- [ ] Detailed Database report failure has a captured status/trace ID or an evidence-based external-service classification.
- [ ] CP-04 is rebased onto current main and all required CI checks pass.
- [ ] Deployed CRM preserves signed-in state on refresh while genuine Auth invalidation still returns to sign-in.
- [ ] No attendance write occurs during acceptance.
- [ ] No database, permission, role, or project-setting changes are introduced without a separate requirement.
- [ ] No background collector, credential rotation, gradient descent, backpropagation, or model-training path is introduced.

## Evidence

- `docs/evidence/cp04-production-attribution.json` — sanitized production metrics, log attribution, database counters, dashboard state, and browser acceptance.
- `docs/CP-CRM-SESSION-CPU-04.md` — this implementation report.

## 12. Follow-up verification — 2026-11-23

This section supersedes the earlier provisional observations where the newer evidence below is more specific.

### 12.1 Current Database report and plan entitlements

The authenticated Supabase Dashboard Database report was opened again at:

`/dashboard/project/jtlusodorfnyzgyuewkz/observability/database`

The project is on the Pro plan. With the Dashboard set to **Last 60 minutes**, it displayed:

| Panel                                   | Current result |
| --------------------------------------- | -------------: |
| CPU usage (average for selected window) |      **3.17%** |
| Memory usage                            |      875.37 MB |
| Network throughput                      |     127.1 KB/s |
| Disk IOPS                               |              4 |
| Database size                           |        0.45 GB |

The following panels still displayed `Unable to load data`:

- Disk throughput
- Database Connections
- Dedicated Pooler Client Connections
- Shared Pooler (Supavisor) client connections
- Disk Usage

The current official [Supabase Reports documentation](https://supabase.com/docs/guides/observability/reports) classifies Disk throughput as Team/Enterprise-only. Its absence is expected for this Pro project. The same documentation lists Database Connections and Disk Usage as Free/Pro, and Dedicated/Shared Pooler connections as available on all plans. Their continued failure is therefore not explained by the current plan.

**Updated diagnosis:** The Database report is partially operational. One missing panel is plan-gated; four missing panels should be available on this Pro project. The Dashboard still exposes no internal failing request status, trace ID, or report-service error code.

The 3.17% CPU value is the Dashboard's average for its selected 60-minute window. It is close to the approximately 3% target, but it is not a 30-minute counter-delta benchmark and does not provide p50, p95, or maximum values.

### 12.2 Auth service and Edge gateway request-ID reconciliation

A new equal-duration 30-minute read-only log window was examined: **06:45:00–07:15:00 UTC**.

| Measurement                           | Auth service | Edge gateway |
| ------------------------------------- | -----------: | -----------: |
| `GET /user` / `GET /auth/v1/user`     | 151 HTTP 200 | 151 HTTP 200 |
| `POST /token` / `POST /auth/v1/token` |   3 HTTP 200 |   3 HTTP 200 |
| Total matching Auth requests          |          154 |          154 |

The request-ID join returned:

- Auth rows: 154
- Distinct Auth request IDs: 154
- Matched Edge request IDs: 154
- Unmatched Auth rows: 0

The full Edge window contained 2,529 requests, including 253 OPTIONS preflights, six client errors, and zero server errors. The Auth requests represented 6.09% of all Edge requests (6.77% excluding OPTIONS).

The six non-Auth client errors were five 403 responses from `/rest/v1/rpc/charter_dispatch` and one 404 from `/rest/v1/rpc/apsyntra_teams_snapshot`. No Auth `/user` or `/token` errors occurred in this window.

**Result: VERIFIED.** The Auth and Edge log streams reconcile exactly by request ID in this window. The earlier CP-04 count discrepancy did not recur.

### 12.3 Genuine production TimeTracker refresh

A separate Chromium tab was opened at:

`https://wass-psti.github.io/APSYNTRACRM/#/time-tracker`

The tab was refreshed once. Both before and after refresh:

- The signed-in CRM UI remained visible.
- The Secure session indicator remained visible.
- The sign-in form did not appear.
- The TimeTracker route remained selected.
- The existing active attendance session remained visible after the page finished loading.

No attendance action, clock-in, clock-out, or attendance write was performed.

**Result: VERIFIED for the currently deployed production baseline.** This confirms that the observed CP-03 sign-in transition did not recur during this follow-up. It does not yet prove the CP-04 code change is deployed; the CP-04 branch remains separate at this point.

### 12.4 Re-run verification

The CP-04 worktree was re-verified:

| Check                                |               Result |
| ------------------------------------ | -------------------: |
| CP-04 focused tests                  |             6/6 PASS |
| Auth/session/workspace focused tests |           42/42 PASS |
| Full frontend test suite             | **3,501/3,501 PASS** |
| JavaScript syntax checks             |                 PASS |
| Repository ESLint                    |                 PASS |
| Repository Prettier                  |                 PASS |
| Production Vite build                |                 PASS |

The build completed with the existing startup-guard classic-script and main-chunk-size advisories. No new dependency was introduced.

### 12.5 Updated acceptance status

| Acceptance area                                                       | Updated status                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Corrected historical CPU counter accounting                           | VERIFIED                                                              |
| Current Dashboard CPU average near 3%                                 | VERIFIED — 3.17% over Last 60 minutes                                 |
| Comparable 30-minute CPU counter benchmark and percentiles            | PENDING                                                               |
| Full host process attribution                                         | PARTIAL — remaining service process counters are not exposed          |
| Auth/Edge request-ID reconciliation                                   | VERIFIED — 154/154 matched                                            |
| PostgreSQL workload evidence                                          | VERIFIED as a read-only snapshot; no speculative SQL tuning justified |
| Dashboard Disk throughput on Pro                                      | EXPECTED UNAVAILABLE — Team/Enterprise entitlement                    |
| Pro/all-plan Database Connections, Pooler Connections, and Disk Usage | PARTIAL — panels still fail without internal trace/error detail       |
| Production TimeTracker signed-in refresh baseline                     | VERIFIED                                                              |
| CP-04 recovery code                                                   | IMPLEMENTED AND TESTED                                                |
| CP-04 code deployed to production                                     | PENDING                                                               |
| No schema, role, permission, project-setting, or credential changes   | VERIFIED                                                              |
| No attendance writes or training/gradient-descent execution           | VERIFIED                                                              |

The sanitized follow-up evidence is stored in `docs/evidence/cp04-followup-20261123.json`. No access token, refresh token, Secret API key, request-ID value, or user record was written to it.
