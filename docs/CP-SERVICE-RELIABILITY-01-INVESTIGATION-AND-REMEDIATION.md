# CP-SERVICE-RELIABILITY-01 — Service Availability, Request Reliability, and Connection Recovery

**Date:** 2026-11-18 (Asia/Manila)  
**Status:** Implementation and automated regression VERIFIED; production rollout and signed-browser observation PENDING.  
**Repository:** `wass-psti/APSYNTRACRM`  
**Supabase project:** `jtlusodorfnyzgyuewkz`  
**Scope:** Frontend Supabase Auth/Data API request lifecycle, allowlisted read RPC management, PlatformSync reconnect concurrency, and synchronization revalidation workload.

## 1. Executive finding

The exact message `The service did not respond. Check your connection and retry.` was emitted by `AuthClient.call()` in `frontend/session.js` after a 12-second client-side deadline. The message did not distinguish a disconnected network, a stalled request, or a delayed response body. A timeout was therefore presented as proof of a connection failure even when the client could not know that.

The production diagnostics collected for 2026-11-17 08:55 UTC through 2026-11-18 08:55 UTC show an active, responding Supabase project and no HTTP 5xx or 504 responses in the sampled API gateway logs. The API origin-time P95 was 472 ms and the maximum observed origin time was 3,442 ms. A contemporaneous PostgreSQL snapshot showed 31 client backends against a configured maximum of 60, with one active client backend. These measurements do not demonstrate a current backend outage or connection-pool exhaustion. They do not exclude an intermittent client/network interruption or an unobserved request stall.

A concrete frontend request-amplification defect was also found in `reconcilePlatformSync()`: `sensitive` was true for every non-broadcast synchronization reason, including ordinary periodic polling. The condition `if(roleChanged||sensitive)` therefore caused both bootstrap and CRM-admin identity RPCs to execute on every poll, despite the adjacent cooldown comment. This was avoidable recurring work.

## 2. Diagnostic evidence and limits

### Current API and database snapshot

| Measurement | Observation |
|---|---:|
| Supabase project status | `ACTIVE_HEALTHY` |
| API gateway log entries | 67,538 in the 24-hour window |
| HTTP 5xx responses | 0 observed |
| HTTP 504 responses | 0 observed |
| API origin-time P95 | 472 ms |
| Maximum API origin time | 3,442 ms |
| PostgreSQL sessions at sample time | 40 |
| Client backends | 31 / 60 configured maximum |
| Active client backends | 1 |

These are sampled service-side observations. They are not a browser-side reproduction of the user's individual timeout and do not prove that no transient failures occurred outside the captured logs.

### Cumulative PostgreSQL statement statistics

`pg_stat_statements` was last reset on 2026-10-20 05:09 UTC. The following figures are cumulative since that reset, not 24-hour rates:

| RPC | Calls | Mean execution | Maximum execution |
|---|---:|---:|---:|
| `wm_list_boards` | 24,024 | 281.96 ms | 7,994.6 ms |
| `wm_get_board` | 16,770 | 80.67 ms | 5,127.7 ms |
| `apsyntra_crm_my_effective_access` | 7,258 | 247.42 ms | 2,827.6 ms |
| `wm_import_board_wizard_extended_atomic` | 1,399 | 1,384.03 ms | 7,774.3 ms |

The query history shows that some RPCs have had multi-second executions, especially board listing and atomic imports. None of the recorded maxima in this cumulative sample reaches the 12-second client deadline. These measurements justify retaining bounded request deadlines and optimizing redundant calls; they do not justify increasing the global timeout or attributing the reported message to a particular RPC.

A separate PostgreSQL log stream contained SQLSTATE `40001` stale-revision records associated with `fm1_update_ticket_v1`. Those are compare-and-swap conflicts, not proof of transport failure. The log count and `pg_stat_statements` call count do not reconcile cleanly, and corresponding FM1 requests were not present in the sampled gateway path aggregation. This anomaly is recorded separately rather than misrepresented as the root cause of the service timeout.

## 3. Root causes and corrections

### A. Timeout classification and response-body handling

**Verified source:** `frontend/session.js`, `AuthClient.call()`.

- The old 12-second deadline covered both the fetch and response-body read.
- The old body-read catch classified any failed successful response-body read as `INVALID_JSON_RESPONSE`, even when the stream had been interrupted by the network.
- An already-aborted caller signal was incorrectly reported as `REQUEST_TIMEOUT`.
- The generic timeout message did not warn that a POST mutation might have reached the server even if the client did not receive its receipt.

**Correction:** retain the existing 12-second default and per-operation bounded read timeout; record whether the deadline occurred during request or response-body handling; classify response stream interruption as `NETWORK_UNAVAILABLE`; classify caller cancellation as `REQUEST_ABORTED`; and attach `mayHaveCommitted` to uncertain POST transport/timeout failures. Mutation-facing messages now instruct the user to verify the resulting record before retrying.

### B. Request retries and idempotency

**Verified source:** `AuthClient.authorized()` and `DomainApi.rpc()`.

The client previously handled one 401 refresh retry but did not provide a general bounded retry for normal transient read failures.

**Correction:** only an explicit allowlist of verified read-only RPCs receives one automatic retry for network failures, request timeouts, HTTP 408, 429, 502, 503, 504, and 520. Retry uses bounded exponential backoff with jitter; 429 honors a bounded `Retry-After` value (maximum five seconds, with a one-second fallback). HTTP 409 revision conflicts, authorization failures, validation failures, and other application errors are not retried. The retry budget is configurable but defaults to one retry.

Mutations and unknown RPCs are never automatically retried by this policy. The existing 401 refresh behavior is retained. Startup recovery checks `retryAttempts` so it does not stack a second retry on top of a request-layer retry.

### C. Concurrent duplicate read requests

**Verified source:** `frontend/data.js`, `DomainApi.rpc()`.

Existing coalescing covered selected board/context/effective-access operations, but not all allowlisted read RPCs.

**Correction:** identical overlapping allowlisted read RPCs are coalesced by signed user, access-token generation, cache generation, RPC name, normalized arguments, timeout, and 401 policy. Results are not cached after completion. Requests carrying caller-specific AbortSignals are not shared. Mutations and unknown RPCs are not deduplicated.

### D. Realtime reconnect concurrency

**Verified source:** `frontend/platform-sync.js`, `PlatformSync.connect()`.

Concurrent online/visibility/reconnect events could enter connection authorization at the same time before a socket existed, causing overlapping signed-user and workspace-context reads.

**Correction:** concurrent connection attempts for the same sync generation share one pending authentication/connect operation. An existing connecting/open socket is reused. A socket that remains in `CONNECTING` is closed after a 12-second handshake deadline; a socket that opens but does not acknowledge its channel joins is closed after a separate 12-second join deadline. Both paths re-enter the existing exponential reconnect backoff. Generation checks and stop/session-scope invalidation remain in place.

### E. Repeated role RPCs during ordinary polling

**Verified source:** `frontend/app.js`, `reconcilePlatformSync()`.

The `sensitive` flag represented every non-broadcast event and was incorrectly used as an unconditional trigger for bootstrap/admin RPCs.

**Correction:** role identity RPCs now run only after a detected inherited role change or a cooled-down focus, visibility, cross-tab, or online/reconnect event (10-second minimum interval). The two independent signed checks run in parallel. Existing effective CRM role refresh remains bounded by its existing 60-second cooldown. Periodic board polling no longer runs both role identity RPCs on every cycle.

## 4. Preserved invariants

- No database schema or migration changes.
- No production data, credentials, roles, permissions, RLS policies, or session authority changed.
- No mutation retry or automatic replay of an uncertain write.
- HTTP 409 compare-and-swap conflicts remain terminal and visible.
- No completed permission decision or read result is cached by the new in-flight coalescer.
- Existing board cache invalidation, signed authorization checks, Realtime protocol, cross-window invalidation, and same-page startup recovery remain in place.
- No telemetry, background agent, new dependency, or periodic diagnostic task added.

## 5. Automated regression coverage

`frontend/tests/service-reliability.test.mjs` covers:

1. One transient network retry for a safe signed read.
2. One retry for transient gateway responses; no retry for HTTP 409.
3. `Retry-After` handling for HTTP 429.
4. No automatic replay for mutations after network failure or timeout.
5. One bounded retry for a timed-out read; no retry storm after the second failure.
6. Network stream interruption distinguished from malformed JSON.
7. Caller abort distinguished from timeout and excluded from retries.
8. Single-flight signed-user verification.
9. Identical in-flight read RPC coalescing without completed-result caching.
10. Read dedupe separation across token generations and no write deduplication.
11. Single-flight Realtime connection authentication/socket creation.
12. A WebSocket stuck in `CONNECTING` is closed at the deadline and reconnects with backoff.
13. A WebSocket that opens but never acknowledges channel joins is closed at the join deadline.
14. No stacked startup retry after a request-layer retry.
15. Role recheck cooldown and polling exclusion.
16. Integration assertion that role checks are gated and parallelized.

Existing tests for session persistence, startup recovery, TimeTracker non-replayable commits, board cache invalidation, multi-window synchronization, and Realtime lifecycle were updated only where the expected behavior changed.

## 6. Verification and acceptance status

- **VERIFIED:** production Supabase project responds during the captured diagnostic window; no 5xx/504 or connection-pool exhaustion observed in the sample.
- **VERIFIED:** source-level timeout classification, body-stream handling, polling role-check amplification, and reconnect concurrency defects reproduced by code inspection and regression tests.
- **VERIFIED:** full `npm test` — **2,710/2,710 PASS**.
- **VERIFIED:** `npm run check` — PASS.
- **VERIFIED:** `npm run build` — PASS. Existing Vite warnings remain for the non-module `startup-guard.js` script and bundles above 500 kB; neither was introduced by this change.
- **IMPLEMENTED-UNVERIFIED:** bounded safe-read retry, in-flight read coalescing, connection single-flight and handshake timeout, role-check cooldown correction, and improved ambiguous-write feedback.
- **PENDING:** GitHub CI, production Pages deployment, and signed-browser observation after rollout.
- **PENDING:** capture a real occurrence of the user's original 12-second timeout with browser request timing and a matching server request ID. The captured service logs did not reproduce an actual 12-second timeout.

No production deployment or live network interruption was performed during this investigation.
