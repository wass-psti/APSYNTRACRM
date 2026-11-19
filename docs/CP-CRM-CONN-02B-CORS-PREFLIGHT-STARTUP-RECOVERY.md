# CP-CRM-CONN-02B — CORS Preflight Tail-Latency Attribution and Startup Recovery Resolution

**Date:** 2026-11-19
**Status:** IMPLEMENTED — local verification PASS; PR and production acceptance pending
**Repository:** wass-psti/APSYNTRACRM
**Base commit:** 6211bae6ea02863d6b38b9f4090a10aa97c50924
**Supabase project:** jtlusodorfnyzgyuewkz

## Milestone identity

The identifier CP-CRM-CONN-02 was already used by PR #374 for session preservation when optional browser-storage writes fail. This distinct CORS work is tracked as CP-CRM-CONN-02B. The existing CP-CRM-CONN-02 behavior is retained.

## Production evidence

Read-only Supabase gateway inspection for the 24-hour period ending 2026-11-19 showed:

| Endpoint                               | OPTIONS requests |
| -------------------------------------- | ---------------: |
| `/auth/v1/user`                        |            4,582 |
| `/rest/v1/rpc/work_board_access`       |            5,135 |
| `/rest/v1/rpc/wm_get_board_shell`      |            3,655 |
| `/rest/v1/rpc/wm_get_board_items_page` |            3,057 |

The normal preflight P95 was approximately 5–8 ms, while the worst observed P99 was 3,178 ms and the maximum `response.origin_time` was 64,894 ms. The extreme observations were concentrated at Cloudflare CEB, with a smaller number at HKG. Both successful and HTTP 400 outliers were present.

The managed API gateway returned HTTP 200 for direct preflight probes with:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: apikey,authorization,content-type`
- `Access-Control-Max-Age: 3600`

The slow request IDs/trace IDs were present in edge logs only; no matching Auth, PostgREST or PostgreSQL log records were found. This points to an intermittent edge/gateway path issue, not a broken application CORS allowlist or a database RPC execution delay. The exact provider-side cause of the 64.9-second tail remains unproven and requires Supabase/Cloudflare trace-level attribution.

## Confirmed application root cause

`AuthClient.call()` forced `cache: 'no-store'` for every request. Chromium's real CORS preflight cache is separate from the HTTP response cache, but this fetch cache mode prevented reuse of a successful preflight even though the server returned `Access-Control-Max-Age: 3600`.

A disposable Chromium reproduction against the deployed app origin confirmed:

| Fetch cache mode | First identical read-only RPC POST | Second identical read-only RPC POST |
| ---------------- | ---------------------------------: | ----------------------------------: |
| `no-store`       |                            OPTIONS |                       OPTIONS again |
| `default`        |                            OPTIONS |                    Preflight reused |

Both POST requests still reached the API. The test used an intentionally malformed JWT against the read-only `wm_auth_access_context` RPC and received HTTP 401 before RPC execution; it did not read or change business data.

## Implementation

### Request cache classification

`frontend/session.js` now uses the default fetch cache mode only when all three conditions hold:

1. HTTP method is POST.
2. The caller explicitly classifies the operation as `requestKind: 'read'`.
3. The path is a REST RPC path under `/rest/v1/rpc/`.

This uses the existing `BOARD_READ_RPC` allowlist in `frontend/data.js`; it does not create a second RPC allowlist.

All authenticated GET requests, Auth token operations, unknown RPCs, and mutations retain `cache: 'no-store'`. No completed RPC result is cached by the application. Existing in-flight deduplication, read retry limits, mutation behavior, session validation, permissions and RLS are unchanged.

### Startup recovery

The existing CP-CRM-CONN-01 recovery policy is preserved:

- At most one retry for explicitly transient startup read failures.
- No retry for revoked/invalid sessions, permission denials, conflicts or semantic errors.
- No automatic replay of mutations.
- Existing session state is preserved on indeterminate network failures.
- Existing user-triggered retry and online-event recovery remain in place.

Workspace startup context and board bootstrap reads are allowlisted read-only POST RPCs, so after a successful preflight their bounded retry can reuse the browser preflight cache. Authenticated `GET /auth/v1/user` deliberately remains `no-store`; this milestone does not relax authenticated GET response caching without a verified server-side no-store contract.

## Files changed

- `frontend/session.js`
- `frontend/tests/cp-crm-conn02b-cors-preflight.test.mjs`
- `scripts/cp-crm-conn02b-cors-preflight-acceptance.mjs`
- `package.json`

## Acceptance

- [x] Focused unit and startup-recovery tests pass (30/30).
- [x] Disposable Chromium acceptance passes: 2 OPTIONS under `no-store`, 1 OPTIONS under `default`, and both POSTs reach the API.
- [x] Full frontend regression passes (2,744/2,744).
- [x] Build, syntax, lint and format checks pass.
- [ ] PR checks and merge complete.
- [ ] Deployed signed-user acceptance confirms startup, workspace loading and board reads.
- [ ] Post-deployment gateway sample confirms a reduced OPTIONS-to-read-RPC ratio.
- [ ] Provider-side CEB/HKG tail latency is separately attributed or escalated with request IDs and Cloudflare Ray IDs.

## Scope boundaries

No Supabase CORS configuration, database schema, migration, credentials, roles, permissions, workspace policy, or production data were changed. No new Supabase project was created. The application-side preflight amplification is addressed; the external CEB/HKG edge tail is not claimed resolved by a frontend change.
