# CP-CRM-CONN-02D — Cloudflare CEB/HKG Edge Trace Attribution and Signed-User Acceptance

**Date:** 2026-11-19
**Repository:** `wass-psti/APSYNTRACRM`
**Base commit:** `3143799161bdfc327569621c4b80929287e4946d`
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Status:** Initial administrator-session and CORS acceptance PASS; follow-up production logs show the historical edge tail was not reproduced; employee native-application acceptance FAILS because its signed workspace returns an empty board catalog; provider-internal root-cause attribution remains PENDING.

## Objective

Establish a reproducible production CORS preflight trace, attribute the historical CEB/HKG OPTIONS latency to the layer supported by available evidence, verify the deployed browser preflight-cache behavior, and verify real signed-user startup/workspace/board reads without changing the authorization model.

## Starting implementation and deployment

- CP-CRM-CONN-02B and CP-CRM-CONN-02C are merged into `main`.
- CP-CRM-CONN-02C PR #558 merged as `3143799161bdfc327569621c4b80929287e4946d`.
- The `pages-build-deployment` workflow for that merge completed successfully (run `44430162234`).
- The merged CP-02C full regression/build/browser workflow completed successfully (run `44429181682`); the focused CP-02C suite was 48/48 and full frontend regression was 2,752/2,752.

## Production preflight verification

### Direct HTTPS OPTIONS probes

Twelve credential-free production OPTIONS requests were sent from the authorized MacBook to the existing Supabase API host:

- 8 REST RPC POST preflights.
- 4 Auth GET preflights.
- 12/12 returned HTTP 200.
- 12/12 returned `Access-Control-Max-Age: 3600`.
- All 12 responses identified Cloudflare POP HKG in the `CF-RAY` response header.
- HTTP/2 was negotiated for every probe.
- DNS lookup: 2–9 ms; TLS establishment: 72–120 ms; TTFB: 115–192 ms; total: 116–192 ms.

Representative response Ray IDs:

- `a5cba537bedddda2-HKG`
- `a5cba53ebc409949-HKG`
- `a5cba54899381fa9-HKG`
- `a5cba54accf51fb6-HKG`

This confirms a healthy HKG route for the sampled client and time window. The client route did not select CEB during these direct probes; CEB behavior is independently represented in the production gateway logs below.

### Real Chromium preflight-cache acceptance

The existing production-origin Chromium acceptance was rerun after deployment:

- `cache: 'no-store'`: two identical read-only RPC POSTs generated two OPTIONS requests; both POSTs reached the API and were rejected with HTTP 401 by the deliberately invalid synthetic JWT.
- `cache: 'default'`: the same two POSTs generated one OPTIONS request; both POSTs still reached the API and were rejected with HTTP 401.
- Both preflights returned HTTP 200 with a 3,600-second max age.
- No valid credential, business data read, or mutation was used.

Result: `CP_CRM_CONN_02B_BROWSER_CORS_PREFLIGHT_PASS`.

## Supabase production edge-log attribution

### 24-hour distribution

The 24-hour edge-log review found normal preflight latency in the P95 range but a severe, highly skewed tail concentrated in CEB, with additional Auth-path outliers in HKG.

| POP | Endpoint                               | Requests | P95 origin ms | P99 origin ms | Maximum origin ms | HTTP 200 / 400 |
| --- | -------------------------------------- | -------: | ------------: | ------------: | ----------------: | -------------: |
| CEB | `/rest/v1/rpc/wm_get_board_shell`      |    4,252 |             5 |         1,694 |            64,894 |      4,252 / 0 |
| CEB | `/rest/v1/rpc/work_board_access`       |    5,953 |             5 |         1,200 |            64,860 |      5,950 / 3 |
| CEB | `/rest/v1/rpc/wm_get_board_items_page` |    3,554 |             7 |         3,124 |            64,859 |      3,551 / 3 |
| CEB | `/rest/v1/rpc/has_module_access`       |    3,388 |             7 |         3,158 |            64,859 |      3,386 / 2 |
| CEB | `/auth/v1/user`                        |    5,392 |           242 |         1,078 |            60,698 |      5,391 / 1 |
| CEB | `/rest/v1/rpc/wm_auth_access_context`  |    2,839 |             4 |            27 |             7,500 |      2,836 / 3 |
| HKG | `/auth/v1/user`                        |    6,177 |            32 |           246 |            28,436 |      6,177 / 0 |
| HKG | `/rest/v1/rpc/wm_auth_access_context`  |    3,171 |             5 |            25 |               415 |      3,171 / 0 |
| HKG | `/rest/v1/rpc/wm_get_board_shell`      |    3,873 |             4 |            14 |               106 |      3,873 / 0 |
| HKG | `/rest/v1/rpc/wm_get_board_items_page` |    3,403 |             4 |            15 |                59 |      3,403 / 0 |
| HKG | `/rest/v1/rpc/work_board_access`       |    5,420 |             4 |            14 |               128 |      5,420 / 0 |
| HKG | `/rest/v1/rpc/wm_list_boards`          |    1,408 |             6 |            20 |                51 |      1,408 / 0 |

The P95 values are generally low while selected CEB P99 values and maximums are extreme. This is a tail-latency problem, not a uniformly slow endpoint.

### Representative trace evidence

The following are representative gateway events from the CEB/HKG outlier cluster. The `cf_ray` values below are the raw request-side Ray tokens recorded by the Supabase log export; the POP is a separate recorded field. The response-side `cf_ray` field was not populated for these OPTIONS rows.

| UTC timestamp           | POP | Method / endpoint                              | Status | `response.origin_time` | Request ID                             | Trace ID                           | Request Ray token  |
| ----------------------- | --- | ---------------------------------------------- | -----: | ---------------------: | -------------------------------------- | ---------------------------------- | ------------------ |
| 2026-11-18 18:12:15.658 | CEB | OPTIONS `/rest/v1/rpc/wm_get_board_shell`      |    200 |              64,894 ms | `01a1efdc-02aa-7bc9-b1d8-54139d4794ab` | `01a1efdc02aa7bc9b1d854139d4794ab` | `a5c8f13ddd1fbdab` |
| 2026-11-18 18:12:15.698 | CEB | OPTIONS `/rest/v1/rpc/work_board_access`       |    200 |              64,860 ms | `01a1efdc-02d2-7288-a8a7-5c6c93379d45` | `01a1efdc02d27288a8a75c6c93379d45` | `a5c8f13e1d6abdab` |
| 2026-11-18 18:12:15.694 | CEB | OPTIONS `/rest/v1/rpc/has_module_access`       |    200 |              64,859 ms | `01a1efdc-02ce-7b61-9ac0-57b1c0817dc6` | `01a1efdc02ce7b619ac057b1c0817dc6` | `a5c8f13e1d5fbdab` |
| 2026-11-18 18:12:15.696 | CEB | OPTIONS `/rest/v1/rpc/wm_get_board_items_page` |    200 |              64,859 ms | `01a1efdc-02d0-7f10-8776-c8f6851327b9` | `01a1efdc02d07f108776c8f6851327b9` | `a5c8f13e1d64bdab` |
| 2026-11-18 18:12:15.697 | CEB | OPTIONS `/rest/v1/rpc/wm_get_board_items_page` |    400 |              44,017 ms | `01a1efdc-02d1-7922-b96d-d70871cb6e4e` | `01a1efdc02d17922b96dd70871cb6e4e` | `a5c8f13e1d6cbdab` |
| 2026-11-18 18:12:19.856 | CEB | OPTIONS `/auth/v1/user`                        |    200 |              60,698 ms | `01a1efdc-1310-753b-b5a3-d8f7a91af6ba` | `01a1efdc1310753bb5a3d8f7a91af6ba` | `a5c8f158191b1ff9` |
| 2026-11-18 18:12:52.114 | HKG | OPTIONS `/auth/v1/user`                        |    200 |              28,436 ms | `01a1efdc-9112-72e9-a5b5-b4b9e764235b` | `01a1efdc911272e9a5b5b4b9e764235b` | `a5c8f221aea5095c` |
| 2026-11-18 18:12:54.376 | HKG | OPTIONS `/auth/v1/user`                        |    200 |              26,174 ms | `01a1efdc-99e8-7d93-a06d-0dd9b74e5d42` | `01a1efdc99e87d93a06d0dd9b74e5d42` | `a5c8f22fdba9095c` |

A second CEB cluster at 2026-11-18 22:17:15 UTC recorded Auth OPTIONS requests around 25.7 seconds. The outliers therefore are not limited to one RPC endpoint or one single request.

### Downstream correlation result

The 13 representative slow trace IDs were queried across all available Supabase log sources. All 13 matched `edge_logs`; none matched `auth_logs`, `postgrest_logs`, or `postgres_logs`. The slow OPTIONS rows also had no recorded `response.headers.x_envoy_upstream_service_time`.

This is strong evidence that the measured delay occurred in the Cloudflare/Supabase API gateway edge path before a normal Auth, PostgREST, or PostgreSQL request was recorded. It is not enough to identify the exact internal queue, worker, connection, or Cloudflare routing component.

### Log-field limitations

The available `edge_logs` export did not include the following request-header keys for the inspected OPTIONS rows:

- `request.headers.origin`
- `request.headers.access_control_request_method`
- `request.headers.access_control_request_headers`

The response-side `response.headers.cf_ray` was also absent on these OPTIONS rows, although the request-side Ray token and `request.cf.colo` were available. Consequently, the HTTP 400 outliers cannot be conclusively classified as malformed browser preflights from this export alone. The provider needs to inspect raw request headers and internal edge traces using the supplied request IDs, trace IDs, Ray tokens, timestamps, and POPs.

## Genuine signed-user production acceptance

The separate administrator production session displayed an active secure session, verified workspace context, live synchronization, and the existing workspace overview with its board list rendered. The administrator view is distinct from the employee session tested in the follow-up below.

The corresponding recent production gateway window (2026-11-19 01:52–02:09:59 UTC) independently showed successful authenticated traffic from the application origin:

| POP | Endpoint                                    | Authenticated users | Successful requests | P95 origin ms | Maximum origin ms |
| --- | ------------------------------------------- | ------------------: | ------------------: | ------------: | ----------------: |
| HKG | `GET /auth/v1/user`                         |                  17 |                 456 |           196 |               471 |
| HKG | `POST /rest/v1/rpc/wm_auth_access_context`  |                  17 |                 348 |           210 |               525 |
| HKG | `POST /rest/v1/rpc/wm_list_boards`          |                  17 |                 237 |           332 |               357 |
| HKG | `POST /rest/v1/rpc/wm_get_board_shell`      |                   4 |                 199 |           478 |               530 |
| HKG | `POST /rest/v1/rpc/wm_get_board_items_page` |                   4 |                 171 |           491 |               544 |
| CEB | `GET /auth/v1/user`                         |                   3 |                  26 |           435 |               524 |
| CEB | `POST /rest/v1/rpc/wm_auth_access_context`  |                   3 |                  25 |           302 |               338 |
| CEB | `POST /rest/v1/rpc/wm_list_boards`          |                   3 |                  19 |           518 |               528 |

The browser acceptance was performed against the already-authenticated production session; no logout, credential reset, token extraction, or forced session replacement was performed. This verifies the genuine signed-session runtime and existing workspace/board read path without disrupting the active user session.

## Reproducible diagnostic

The new script `scripts/cp-crm-conn02d-edge-trace-acceptance.mjs` sends a bounded sequence of production OPTIONS requests only. It captures:

- Cloudflare `CF-RAY` and POP suffix.
- HTTP status and CORS allow-origin/method/header values.
- `Access-Control-Max-Age`.
- DNS, TCP, TLS, TTFB, and total elapsed time.

It does not send API keys or bearer tokens, invoke RPCs, perform sign-in, read business data, or write production state.

Run four sequential samples per endpoint (12 requests total):

```sh
npm run test:conn02d:edge -- --samples=4
```

The sample count is bounded to 1–10 per endpoint. The script reports each Ray ID and a POP-specific latency summary; it does not run continuously or install monitoring.

## Acceptance matrix

- [x] CP-02C merged to `main`; GitHub Pages deployment succeeded.
- [x] Production Chromium preflight cache behavior verified: 2 OPTIONS under `no-store`, 1 under `default`, both POSTs still reached the API.
- [x] Direct credential-free production preflight: 12/12 HTTP 200, 12/12 max-age 3600, HKG Ray IDs captured.
- [x] New CP-02D diagnostic utility: 12/12 PASS; TTFB P50 160 ms, P95 191 ms, maximum total 192 ms.
- [x] New CP-02D unit tests: 3/3 PASS; full frontend regression: 2,755/2,755 PASS; module check, ESLint, Prettier, and production build PASS.
- [x] Historical CEB/HKG edge tail identified in production logs, with representative trace/request/Ray evidence.
- [x] Thirteen representative slow trace IDs correlated; no matching Auth, PostgREST, or PostgreSQL records.
- [x] Administrator signed-session production runtime, workspace context, board list, board shell, and board item reads observed.
- [ ] Employee signed-session acceptance for TimeTracker, Fund Tracker, FuelTrack+, and TradeLink; follow-up testing below found an empty workspace board catalog.
- [x] No application authentication, authorization, role, permission, workspace policy, database schema, migration, credential, or business-data changes.
- [ ] Provider-internal Cloudflare/Supabase trace identifies the precise edge queue/worker/connection/root cause.
- [ ] Provider classifies the historical OPTIONS HTTP 400 events using raw request-header metadata.
- [ ] Provider confirms remediation or documents an upstream incident/workaround.

## Follow-up verification — 2026-11-19 02:00–02:20 UTC

### Edge-tail regression comparison

A follow-up aggregate of production `edge_logs` compared OPTIONS traffic before and after the CP02B Pages deployment, which completed at **2026-11-19 00:17:27 UTC** (workflow run `44427721726`). The after-deployment rows below cover 103 minutes through 02:00 UTC. The historical 64.9-second CEB and 28.4-second HKG outliers occurred in the pre-deployment portion. They were not reproduced in the post-deployment samples:

| Window / Cloudflare POP | OPTIONS requests |  P50 |    P95 |      P99 |   Maximum | Over 1 s | Over 10 s |
| ----------------------- | ---------------: | ---: | -----: | -------: | --------: | -------: | --------: |
| Before CP02B — CEB      |           28,631 | 0 ms |   7 ms | 1,692 ms | 64,894 ms |      334 |        33 |
| Before CP02B — HKG      |           30,275 | 0 ms |   6 ms |   203 ms | 28,436 ms |        3 |         3 |
| After CP02B — CEB       |            1,864 | 0 ms |   7 ms |   149 ms |    357 ms |        0 |         0 |
| After CP02B — HKG       |            3,967 | 0 ms |   4 ms |    20 ms |    314 ms |        0 |         0 |
| After CP02B — MNL       |               68 | 2 ms | 210 ms |   301 ms |    452 ms |        0 |         0 |

The additional 20-minute window from 2026-11-19 02:00–02:20 UTC contained 1,644 HKG OPTIONS (P95 5 ms, P99 17 ms, max 41 ms), 19 MNL OPTIONS (P95 223 ms, max 226 ms), and 17 CEB OPTIONS (P95 238 ms, max 247 ms). No request in those three POP groups exceeded one second. This is an observed recovery signal for the sampled periods, not a provider-confirmed permanent remediation.

The direct client route selected HKG; it did not force CEB. CEB results above come from production gateway logs. The exact provider-internal cause remains unproven because the connected log export does not expose Cloudflare/Supabase edge queue or worker traces.

### Additional bounded live OPTIONS trace

The committed script `scripts/cp-crm-conn02d-edge-trace-acceptance.mjs` was executed with four samples for each of three probes (12 requests total): `wm_list_boards` POST preflight, `wm_auth_access_context` POST preflight, and `/auth/v1/user` GET preflight. It sent no API key, bearer token, user payload, RPC body, or mutation.

- 12/12 HTTP 200; all 12 returned CF-RAY values with HKG suffix.
- `Access-Control-Allow-Origin: *`; requested methods and headers were present.
- `Access-Control-Max-Age: 3600` on all 12.
- TTFB P50 169 ms, P95 251 ms, maximum 251 ms; maximum total request time 252 ms.
- The sample confirms the HKG route only; it does not claim direct CEB acceptance.

### Employee signed-session native-application acceptance

A separate already-signed-in employee browser session on the authorized MacBook was navigated through the deployed CRM without signing out, changing credentials, creating boards, or modifying records. The UI showed **Jerome / CRM Employee / employee**, workspace **Work Management**, and a verified secure session. Its Overview and My Boards screens both showed **0 active boards, 0 items, and 0 available boards**.

| Native application | Observed result                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| TimeTracker        | **FAIL** — “The existing TimeTracker Attendance board was not found in this workspace. No board was created.” |
| Fund Tracker       | **FAIL** — route falls back to My Boards; no board is returned in the workspace catalog                       |
| FuelTrack+         | **FAIL** — “The existing FuelTrack+ v3 board was not found in this workspace.”                                |
| TradeLink          | **FAIL** — “The existing TradeLink board was not found in this workspace.”                                    |

A separate administrator browser session showed 257 active boards and 23,194 board items. These are distinct sessions; the administrator's catalog does not prove the employee's board visibility.

In the 2026-11-19 02:15–02:20 UTC production edge-log window, the relevant Auth and workspace/application RPCs returned HTTP 200. For HKG, `wm_list_boards` had 43 requests (P95 335 ms, max 341 ms), `wm_auth_access_context` 68 (P95 200 ms, max 482 ms), `work_board_access` 73 (P95 468 ms, max 489 ms), `wm_get_board_shell` 51 (P95 484 ms, max 502 ms), and `wm_get_board_items_page` 43 (P95 486 ms, max 507 ms). These observations do not show the historical 64.9-second edge tail. The employee UI nevertheless received an empty board catalog.

**Follow-up acceptance:** The sampled provider-edge latency regression check PASSes. The employee's live native-application acceptance FAILs for all four applications because the signed employee workspace currently returns no boards. This is a distinct workspace/board-catalog resolution blocker and must not be hidden by changing roles, grants, RLS, workspace membership, or application authorization within CP02D.

## Provider escalation handoff

**Prepared; not submitted.** The provider request should ask Supabase Support to correlate the listed UTC timestamps, request IDs, trace IDs, request-side Ray tokens, and CEB/HKG POPs against raw Cloudflare and API gateway traces. Specifically request:

1. Edge queue/worker/connection timing for the 64.9s CEB and 28.4s HKG OPTIONS requests.
2. Confirmation whether the delay occurred before CORS handling, during edge-to-gateway forwarding, or while waiting for a gateway worker/upstream connection.
3. Raw `Origin`, `Access-Control-Request-Method`, and `Access-Control-Request-Headers` values for the HTTP 400 OPTIONS events.
4. Full response Ray IDs and internal gateway trace correlation for each supplied request ID.
5. Any known CEB/HKG POP incident, saturation, retry, routing, or connection-pool event matching the supplied timestamps.

## Scope boundaries

This milestone adds only a manual diagnostic script, its unit tests, and evidence documentation. It does not change frontend request behavior, CORS configuration, Supabase settings, credentials, sessions, roles, permissions, workspace policies, database schema, migrations, business data, or production authorization. No new Supabase project, telemetry pipeline, recurring monitor, polling process, or background agent is introduced.
