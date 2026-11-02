# CP-FRT-SEC14 — Legacy FRT read RPC consumer compatibility

**Updated:** 2026-11-02  
**Production:** `wass-psti/APSYNTRACRM` GitHub Pages and Supabase project `jtlusodorfnyzgyuewkz`  
**Disposition:** **PARTIAL SOURCE COMPATIBILITY VERIFIED; PRODUCTION RETIREMENT BLOCKED**  
**Change boundary:** read-only source/production inventory and CI prevention; **no production REVOKE or finance writes**.

## Retirement scope

Exactly three legacy authenticated read RPC signatures:

| Historical RPC | Restricted replacement | Legacy EXECUTE in production |
| --- | --- | --- |
| `public.frt_get_request(uuid,uuid)` | `public.frt_restricted_request_detail(uuid,uuid)` | RETAINED |
| `public.frt_list_requests(uuid,text,text)` | `public.frt_board_list_safe(uuid,text,text)` | RETAINED |
| `public.frt_dashboard(uuid,text)` | `public.frt_board_dashboard_safe(uuid,text)` | RETAINED |

The new `public.frt_sec14_auto_foreign_denials(uuid)` is a **read-only authorization acceptance probe**, **not** a general list/dashboard/detail replacement. Existing `public.frt_request_action(uuid,uuid,text,jsonb)` and finance authorization are outside the removal scope.

## First-party caller inventory — VERIFIED at audited source revision

### APSYNTRA CRM

Repository: [`wass-psti/APSYNTRACRM`](https://github.com/wass-psti/APSYNTRACRM). The frontend build is shipped through GitHub Pages.

- `frontend/frt-finance-readonly.js`: signed context and `frt_bootstrap` followed by `frt_board_dashboard_safe` and `frt_board_list_safe`.
- `frontend/frt-finance-workflow.js`: request details via `frt_restricted_request_detail`; never invokes `frt_request_action`.
- `frontend/frt-sec14-signed-acceptance.js`: composes the restricted read-only contracts. The `restricted-detail` check is **PENDING** while no legitimate production request exists.
- `frontend/frt-sec14-signed-denials.js`: uses `frt_sec14_auto_foreign_denials`, selecting a genuine foreign workspace internally; genuine nonbootstrap `FINANCE_APPROVER` operator report **PASS 7/7**, recorded in the authoritative SEC14 checkpoint.
- `frontend/data.js` has a generic Supabase RPC wrapper and other board contracts. Source-level absence of a literal deprecated function **cannot establish the absence of runtime-generated or unknown third-party RPC callers**.

The new `scripts/sec14-legacy-read-consumer-guard.mjs` scans **46 first-party runtime source files** under `frontend/`, `scripts/`, and `index.html` (excluding tests and its own source). It refuses all three deprecated exact RPC names and enforces the three intended restricted-read call strings. `frontend/tests/sec14-legacy-read-consumer-guard.test.mjs` exercises positive and negative detection. This check runs as a required job step in `.github/workflows/apsyntra-frontend.yml`.

**CI evidence:** [APSYNTRA CRM Frontend Validation #41395912107](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41395912107): **PASS**, **244/244** frontend tests, disposable PostgreSQL suite PASS, exact-source live Pages smoke PASS. The static guard reported no deprecated first-party runtime literals.

**Limit:** the scanner is a *regression guard for source-visible literal calls*, not a complete proof against dynamic RPC construction, cached older browser builds, browser extensions, private clients, or external apps.

### Standalone Fund Released Tracker

Repository: [`wass-psti/Fund-Released-Tracker`](https://github.com/wass-psti/Fund-Released-Tracker), source HEAD `80c791f95048a354455bea6a7f0035d25daae9b8`.

- `apps/web/src/lib/api.ts` calls relative `/api` via `fetch`, passing its independent `frt_token` bearer. Its pages and components use these API routes rather than the three Supabase RPC names.
- `apps/api/src/index.ts` defines Express request, dashboard, finance, and administration endpoints.
- `apps/api/src/db.ts` uses the `pg` pool and `DATABASE_URL`; `README.md` describes a standalone JWT/Express/PostgreSQL deployment and a **future** Supabase handover.
- No source-inspected first-party path is an established client of the three production Supabase read RPCs. **The actual deployed build, environment, historical releases, third-party integrations, and production PostgreSQL destination have not been independently verified.** Standalone finance and role-management routes are **not** authorized by this exercise to be changed.

## Live production use — READ-ONLY evidence, not client identification

### Supabase function grants

The live database still grants `authenticated EXECUTE` on all three legacy read RPCs; no retirement migration has been run. Existing restricted safe reads and the automatic foreign denial RPC are active.

### Existing PostgreSQL statistics (no new monitoring installed)

An aggregate, read-only query against existing `extensions.pg_stat_statements` was inspected. The statistics reset at **2026-10-20 05:09:04 UTC**, with `pg_stat_statements.track = top`. Historical matches by the database role `authenticated` were:

| RPC name in normalized SQL | Accumulated matching calls |
| --- | ---: |
| `frt_list_requests` | **88** |
| `frt_dashboard` | **18** |
| `frt_get_request` | **0** |
| `frt_board_list_safe` | **19** |
| `frt_board_dashboard_safe` | **19** |

The three legacy matches appeared in **two normalized statements** under `authenticated`. Another catalog/inventory mention under `postgres` was excluded from the authenticated counts. Counts are **historical statement references**, not unique API users or a verified timeline. They do **not** attribute a calling application, distinguish older browser assets from external callers, or prove usage today. Do not use these counts to certify active consumers or safe revocation.

### Existing gateway logs, one-time read only

A bounded review of Supabase `edge_logs` in the default **most recent 24-hour** window found `18` `POST 200` observations for `/rest/v1/rpc/frt_board_list_safe`, `18` for `/rest/v1/rpc/frt_board_dashboard_safe`, and **no matching request paths** for the three legacy RPCs in that window. The browser-generated `OPTIONS` requests are not separate business invocations. This narrow log absence **does not prove** older clients are compatible or no direct database RPC consumers exist. No persistent log collection or new telemetry was installed.

## Compatibility decision and exit criteria

**CURRENT RESULT: BLOCKED — DO NOT REVOKE LEGACY EXECUTE.** Source inspection establishes that the current controlled CRM frontend uses safe calls, and the inspected standalone source uses its separate Express API. However, prior authenticated legacy SQL references lack verified ownership and timing.

Before retirement, the release owner must:
1. Account for historical authenticated legacy RPC activity, identify any older deployed pages, alternative FRT clients, scripts, and external integrations, and migrate them to safe replacements or affirm their inactivity based on independently reviewable evidence.
2. Confirm *each deployed consumer* is compatible with the restricted response shapes and company/workspace authorization; source-level scans and a 24-hour quiet period alone are insufficient.
3. Preserve signed nonbootstrap cross-workspace denial PASS (already collected); validate genuine restricted request-detail when the **first legitimate FRT request** exists, not through invented production finance entries.
4. Obtain explicit **production permission-change authorization**, check the approved rollback path, and only then consider the guarded `sql/cp-frt-sec14-legacy-read-grant-retirement-candidate.sql` in a controlled change window with postchecks.
5. Keep the financial action grants, RLS, bootstrap identities, role management, historical finance records, and the accepted 12-board architecture unchanged.

**Current aggregate SEC14 accounting:** **6/8 verified (75%)**, with signed foreign-workspace denial confirmed as a completed subcheckpoint but real request-detail and full legacy-consumer/retirement acceptance still outstanding. This inventory does not alter that figure.


## Historical APSYNTRA CRM attribution — linked source and Pages deployment — 2026-11-02

**Major new finding: older first-party APSYNTRA CRM versions were actual legacy RPC callers in code, and a legacy-default version had a successful Pages deployment workflow.** This narrows the historical-traffic explanation substantially; it does **not** prove which exact deployed browser made each of the database calls.

| Timestamp (UTC) | Evidence | Exact behavior |
| --- | --- | --- |
| 2026-10-31 16:03:51 | [Initial SEC12 client commit `1b40e693`](https://github.com/wass-psti/APSYNTRACRM/commit/1b40e693edee3f9f2173727501fa53fdb894fb60) | `frontend/frt-finance-readonly.js` directly called `frt_dashboard` and `frt_list_requests` under the current signed workspace. |
| 2026-11-01 09:34:49 | [Fallback-enabled commit `b2851b9d`](https://github.com/wass-psti/APSYNTRACRM/commit/b2851b9d04614c32c56fa97d8ed0be6ebf5c1117) | Introduced `secureContracts=false` as the **default**, using `secureContracts ? frt_board_dashboard_safe : frt_dashboard` and the equivalent safe/legacy list switch. Default calls still used legacy RPCs. |
| 2026-11-01 09:34:50 | [GitHub Pages workflow #41293742066](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293742066) | **SUCCESS** for commit `b2851b9d`. The separate frontend validation run for the same commit **FAILED**, so do not equate this historic Pages deployment success with passed frontend acceptance. |
| 2026-11-02 00:28:54 | [Safe-only migration commit `ea43e52d`](https://github.com/wass-psti/APSYNTRACRM/commit/ea43e52daae8308cd641bbd2b3b15322859fa7e4) | Removed the conditional and always invoked the two `frt_board_*_safe` read APIs. Later current `main` source and CI explicitly enforce no fallback. |
| 2026-11-02 | [Current first-party CI #41396326150](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41396326150) | **PASS**, zero deprecated read RPC names across 46 scanned runtime files, with safe read signatures in the intended finance modules; 244/244 frontend tests. |

**Independent SQL fingerprint attribution:** The previous 88 and 18 historical counts were not incidental catalog mentions. Both `authenticated` normalized SQL statements explicitly invoke `"public"."frt_list_requests"` or `"public"."frt_dashboard"` from the generated `WITH pgrst_source AS (...)` PostgREST RPC wrapper. This proves **historical authenticated PostgREST RPC executions**, but not which website/actor generated them. The historical application versions above are a concrete first-party candidate matching both RPC names, including a Pages deployment of the default-legacy revision.

The added, reusable read-only query [`sql/tests/cp-frt-sec14-legacy-usage-attribution-readonly.sql`](../sql/tests/cp-frt-sec14-legacy-usage-attribution-readonly.sql) was independently executed against production; it returned `frt_list_requests=88`, `frt_dashboard=18`, `nonPostgrestMentions=0`, with reset `2026-10-20T05:09:04.110272+00:00`. It emits no user UUID, token, financial data or raw normalized SQL. It does not reset `pg_stat_statements` or install monitoring. **Neither pg_stat_statements nor this query provides the individual call timestamp or client identity.**

**Bounded API-log corroboration:** Two historical 24-hour log windows (October 31 and November 1 UTC) returned no matching gateway entries, which cannot disprove older requests because historical log retention/coverage is unknown. A separate November 2 UTC window showed 21 successful POSTs each to `frt_board_dashboard_safe` and `frt_board_list_safe` and none to the three legacy REST routes. This confirms *observed recent restricted-API traffic only*, not total compatibility. No persistent monitoring or telemetry was introduced.

**Revised retirement decision:** The identity of a real historical *code consumer* is now **VERIFIED** (prior APSYNTRA CRM frontend), and a legacy-default Pages workflow success is **VERIFIED**. Attribution of all accumulated production calls to that client is still **UNVERIFIED**. Untracked external scripts, currently open old browser tabs, cached assets, alternate historical deployments and direct database consumers remain **NOT EXHAUSTIVELY AUDITED**. All three legacy read RPC grants must continue unchanged until controlled consumer compatibility/retirement authorization is satisfied; do not use the historical code identification alone as permission to revoke.

