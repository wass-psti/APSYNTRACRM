# CP-DB-CPU-17C — Production PostgREST Failure-Origin Investigation

**APSYNTRA CRM** · `wass-psti/APSYNTRACRM` · **Existing Supabase project only** `jtlusodorfnyzgyuewkz`
**Evidence date:** November 17, 2026 (UTC); Philippine time = UTC+8
**Disposition:** Origin **UNATTRIBUTED**; CPU recovery **NOT VERIFIED**; incident **OPEN**

## Verified facts

1. Database conflict stream: `public.fm1_update_ticket_v1` -> `private.fm1_update_ticket_impl` raised `40001`, `FM1 ticket revision changed; refresh before retrying`, about **one per second**. The first observed error in the 24-hour inspection was at 04:24:33.687 UTC. The event volume was **12,785** by 07:57:38 UTC.
2. In the 08:00–08:12 UTC log query window, PostgreSQL returned **529** conflicts, last at 08:08:48 UTC (logs may ingest with delay). API Gateway returned **zero** `/rest/v1/rpc/fm1_update_ticket_v1` requests in the same selected time window, while **758** other gateway requests were present.
3. The PostgreSQL server reported the **one observed backend** serving that error as `PostgREST 14.5` with `authenticator` role, `::1` as its local client address and backend PID `2884269`. That backend began at 04:22:51 UTC. **This identifies the pooled database connection, not the originating browser/user/IP.** A Postgres backend PID/session alone cannot identify an HTTP requester.
4. At 08:07:10.036 UTC, `pg_stat_database.xact_rollback` = **49,301,570**; at 08:08:45.800 UTC, **49,351,698**: approximately **523 transactions rolled back per second** during that ~96-second interval. The separate FM1 error stream, ~one per second, does **not** account for this volume.
5. More than 49 million cumulative PostgREST `set_config` calls have been recorded since the historical `pg_stat_statements` reset, with large recent increments. These describe PostgREST transaction setup but **do not identify the upstream request path, whether rollbacks were intentional, or which workloads consumed CPU**.
6. The Supabase dashboard displayed **70% CPU** on Micro. This was a dashboard observation, not a controlled before/after CPU series. As of this milestone, a causal allocation of CPU by request source is unavailable.
7. Existing FM1 `api-client.js` revision suppression (CP-DB-CPU-17B) is deployed. FM1 browser acceptance and CI passed. The 40001 stream persisted afterward.
8. Sampled FM1 scheduled notification/SLA processors executed successfully in about 10–14 ms on average; there is no evidence to disable those jobs.
9. Realtime rate-limit errors were visible in earlier logs, but no evidence links them to the high-frequency PostgREST rollback stream.

## Root-cause confidence

**CONFIRMED:** stale expected-revision updates execute through an authenticated PostgREST database backend and fail at the existing optimistic-concurrency guard.

**UNDETERMINED:** the actual HTTP client, host, user, upstream route, automatic retry policy, and other sources of `xact_rollback`. Zero gateway matches do **not** prove deliberate bypass or abuse: log ingestion gaps, gateway sampling, internal routing or different network paths remain possible.

The FM1 client change cannot stop an unidentified external/independent caller. Do **not** change the canonical revision guard, globally disable access, revoke user sessions, restart production, kill PostgREST backends, add unconditional retries, or disable legitimate scheduled workflows to mask this signal.

## Reproducible read-only diagnostics

Use the connected Supabase project's SQL and Log Explorer, preserving a matching UTC time interval. Do not share access tokens, raw Authorization headers, user records or IP addresses in GitHub.

**PostgreSQL read-only snapshot** (run twice, at least 30 seconds apart, as independent calls):

```sql
SELECT clock_timestamp() observed_at, xact_commit, xact_rollback,
       numbackends, deadlocks
FROM pg_stat_database
WHERE datname = current_database();

SELECT queryid, calls, round(total_exec_time::numeric,2) elapsed_ms
FROM pg_stat_statements
WHERE query LIKE 'select set_config(%'
ORDER BY calls DESC LIMIT 1;
```

**Log Explorer / ClickHouse** — select the *same* UTC interval for both:

```sql
SELECT count() conflicts, min(timestamp) first_at, max(timestamp) last_at,
       uniqExact(log_attributes['parsed.session_id']) database_sessions
FROM logs
WHERE source='postgres_logs'
  AND event_message='FM1 ticket revision changed; refresh before retrying';
```

```sql
SELECT log_attributes['request.path'] path,
       log_attributes['response.status_code'] status,
       count() request_count
FROM logs
WHERE source='edge_logs'
  AND log_attributes['request.path'] LIKE '%fm1_update_ticket%'
GROUP BY path,status
ORDER BY request_count DESC LIMIT 20;
```

```sql
SELECT log_attributes['request.path'] path, count() request_count
FROM logs
WHERE source='edge_logs'
GROUP BY path ORDER BY request_count DESC LIMIT 20;
```

Use **separate** PostgreSQL queries for interval deltas: `pg_stat_database` statistics are transaction-snapshot cached and an in-transaction sleep is **not** a valid before/after sample.

Operator-run offline analyzer:

```bash
node scripts/cp-db-cpu17c-origin-evidence.mjs /path/to/redacted-interval-evidence.json
```

JSON fields: `window_start`, `window_end`, `fm1_revision_conflicts`, `gateway_fm1_update_requests`, `gateway_total_requests`, `pg_rollbacks_start`, `pg_rollbacks_end`. Values must correspond to the **same time window**. The CLI explicitly returns `originating_client: UNATTRIBUTED` and `cpu_recovery: UNVERIFIED` until stronger sources are available; it is not a network probe or monitoring daemon. For genuinely comparable CPU time series use the existing `scripts/cp-db-cpu17-acceptance.mjs`.

## Required escalation / root-caller containment

If the FM1 conflicts continue, use Supabase provider diagnostics to obtain **PostgREST ingress/access logs (request path, timestamp, source/Forwarded headers, user agent, trace ID)** corresponding to the database session that began at 04:22:51 UTC, and explain why the gateway contains no matching FM1 records. **Do not expose request credentials.** Once the caller is identified, correct its stale-revision retry or request deduplication **at that caller** and verify it with denied, concurrent, and successful request tests.

Separately request correlation of the ~523/sec PostgreSQL rollback rate with request origins; do not assume FM1 causes all rollbacks or that all rollbacks are errors.

Final production acceptance: repeated FM1 40001 rate ceases or is explained by legitimate concurrent user edits; excessive rollback workload is attributed and remediated where appropriate; no regression in signed FM1/CRM operation or data integrity; representative interval CPU samples show sustained recovery under comparable signed-user/window/workflow load.

## Changes in this milestone

- **Read-only** database/log and repository inspections.
- Added offline evidence evaluator and regression tests; no runtime application edits or new background agents.
- **No** production database mutation, credentials, permission change, RLS change, cron modification, rate-limit activation, or new Supabase project.

**Decision:** no unsafe production toggle or unproven CPU optimization. Continue root-source attribution with provider/network ingress evidence before changes to external clients.
