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
