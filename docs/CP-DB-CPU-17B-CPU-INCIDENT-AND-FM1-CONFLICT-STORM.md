# CP-DB-CPU-17B — 70% CPU Incident, FM1 Revision-Conflict Storm, and Acceptance

**Project:** APSYNTRA CRM
**Repository:** `wass-psti/APSYNTRACRM`
**Existing database:** `jtlusodorfnyzgyuewkz`
**Incident date:** 2026-11-17
**Status:** ROOT-CAUSE PARTIALLY ATTRIBUTED; FINAL CPU ACCEPTANCE PENDING

## Observed resource state

The Supabase overview displayed **70% CPU** for the existing Micro instance. The project still reported Healthy. A prior dashboard observation of 3% was a single point in time, not a sustained baseline. No statistically controlled CPU improvement can be claimed.

## Verified database incident

Read-only PostgreSQL and Supabase log observations:

- At least **7,370** `ERROR` records from 05:45 to 07:47 UTC matched `FM1 ticket revision changed; refresh before retrying` / SQLSTATE `40001`.
- The error stream was regularly **60 errors/minute** (300 per five-minute bucket), approximately one stale update per second.
- The failing function was `private.fm1_update_ticket_impl`, exposed through `public.fm1_update_ticket_v1`. PostgreSQL rejects a client-supplied stale `p_expected_revision`; this is the existing optimistic-concurrency contract.
- The repeated failures were observed on a PostgREST session. Gateway logs for the investigated window did **not** show corresponding FM1 update requests, so the originating caller, client host, and user agent have **not** been established. A PostgreSQL backend PID is not the client identity.
- The `pg_stat_statements` entry for `fm1_update_ticket_v1` reported only four **successful tracked calls** in the inspected cumulative statistics. Failed statements do not provide reliable function CPU attribution through that count.
- Transaction rollbacks increased from **48,686,014** at 07:47:45 UTC to **48,768,268** at 07:50:15 UTC, approximately **548 rollbacks/second** over 150 seconds. The much larger rollback stream is **not explained** by the one-per-second FM1 log stream alone; its independent source requires investigation.
- Realtime logs also contained `UnableToBroadcastChanges: :too_many_requests` and a message-per-second rate-limit error. The relationship to the rollback surge is not established.
- Three FM1 SLA/outbox scheduled jobs ran successfully in the inspected four-hour window, each with average execution times below 14 ms. No schedule change was justified.

These findings establish a real database failure storm, but they do **not** establish a causal breakdown of the observed 70% CPU by workload.

## Targeted, functionality-preserving mitigation

`frontend/fm1/api-client.js` now records, in **bounded in-memory state only**, a ticket revision rejected by `fm1_update_ticket_v1` with the *specific* `40001` stale-revision message. Repeated attempts to submit that same rejected revision through the same client instance fail locally rather than issuing additional known-invalid database transactions.

- New authoritative ticket revisions remain fully editable.
- Unrelated serialization errors and transient network failures continue to follow the original retry path.
- The existing FM1 UI already reloads the authoritative ticket after a concurrency conflict.
- No database RPC contract, authorization policy, login behavior, operational cron, persistence data, or production credentials were changed.
- This mitigation applies **only to the shipped first-party browser client instance**. It cannot stop an external caller that is making requests directly, which remains a leading unresolved investigation target.

### Verification requirements

- FM1 API test: first stale write causes SQL conflict; repeat same revision produces no second RPC.
- FM1 API test: refreshed revision is accepted normally.
- FM1 API test: transient network failures retain same-key retry.
- Full frontend tests and build.
- FM1 Chromium browser workflow regression, including revision conflict refresh.
- The existing default FM1 browser script can accidentally connect to an unrelated Vite server already listening on `127.0.0.1:5173`. A baseline test showed the same stale-revision fixture timeout without this change. Running the exact same FM1 browser acceptance against a dedicated port `5186` with `FM1_TEST_URL` completed `FM1_BROWSER_ACCEPTANCE_PASS`; no existing developer Vite server was stopped or modified.
- Locally verified after changes: 2,608 complete frontend tests passed, focused lint and format checks passed, static build passed, and dedicated-port FM1 Chromium acceptance passed.
- Production deployed source readback and contemporaneous PostgreSQL error/rollback-rate comparison.
- Representative CPU metrics before/after under comparable activity, and relevant signed runtime/integrity tests.

## Acceptance decision

**Final performance closure is blocked.** Stale-revision suppression can reduce redundant calls from compliant first-party clients, but the origin of ongoing production requests and the large rollback surge remains unattributed. Do not claim the observed CPU has fallen, invent an improvement percentage, disable FM1 workflows, downgrade conflict checking, or introduce speculative production indexes.

**Next focused milestone if the storm persists:** `CP-DB-CPU-17C — High-Frequency PostgREST Failure-Origin Attribution, Rollback-Storm Containment, and Measured Production CPU Recovery`. Correlate PostgREST ingress/requests and authenticated session identities at the server/API-gateway level (without exposing secrets or broadening permissions), separate genuine FM1 conflicts from other aborted transactions, stop the verified failing caller at its source, and confirm the CPU response under comparable load. Any change affecting external callers or service-wide rate limits requires a separate operational-risk review.
