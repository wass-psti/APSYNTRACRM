# CP-NATIVE-APP-ACCESS-03 — Four-Application Employee Cold-Start and Recovery Acceptance

**Date:** 2026-11-19
**Status:** Genuine signed-employee 403/503 cold-start matrix and catalog recovery PASS; CI/deployment closeout pending.
**Repository:** `wass-psti/APSYNTRACRM`
**Production:** GitHub Pages; existing Supabase project `jtlusodorfnyzgyuewkz`

## Objective

Verify that the existing ordinary employee session can cold-start Overview and all four native applications while the generic `wm_list_boards` RPC returns HTTP 403 and HTTP 503, then recover when the catalog returns HTTP 200.

## Existing canonical identities

| Application  | Module ID               | Canonical board ID                     |
| ------------ | ----------------------- | -------------------------------------- |
| TimeTracker  | `time-tracker`          | `46bf4ee7-368a-4c35-842c-8593ea1f6ac3` |
| Fund Tracker | `fund-released-tracker` | `f36da8fe-8d9d-4629-9938-12533cb3ca39` |
| FuelTrack+   | `fueltrack-plus`        | `7af78b3f-67bf-4600-9aa1-9006d19d486e` |
| TradeLink    | `tradelink`             | `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` |

## Acceptance procedure

Run against an already authenticated ordinary employee browser profile:

```bash
node scripts/cp-native-app-access-03-employee-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:<existing-port>
```

The runner performs these read-only scenarios:

1. Overview cold start with `wm_list_boards` returning HTTP 403; native application links and degraded-catalog notice remain visible.
2. Each of the four native routes is cold-reloaded with the same HTTP 403 catalog failure; the signed native resolver must return the exact module and canonical board, and expected application-domain reads must return HTTP 200 and each native interface must reach its signed-ready state (not merely display its sidebar label).
3. Repeat Overview and all four native routes with HTTP 503.
4. Re-enter Overview while the 503 notice is present, remove the ephemeral browser-only override, invoke the existing non-mutating Retry workspace refresh action, confirm the real catalog RPC returns HTTP 200, and confirm the notice clears.
5. Confirm the same signed employee and workspace are retained across all four application contexts; TimeTracker must report the `Employee` module role.
6. Confirm zero page errors, failed REST requests, and unexpected HTTP errors.

## Scope boundaries

- The failure override exists only inside the local Playwright browser process. It does not alter Supabase, GitHub Pages, RLS, grants, roles, memberships, assignments, or production records.
- No credentials, cookies, access tokens, local storage, or session storage are read.
- No login is automated; the runner requires an already signed employee session.
- No attendance, fund, fuel, TradeLink, approval, or other business write is submitted. The only UI action is the existing non-mutating workspace refresh retry.
- The runner restores the original browser URL and disconnects without closing the user's browser.
- Generic board startup remains catalog-dependent; the existing unit tests continue to verify its failure behavior.

## Local verification

- CP-03 acceptance contract and related native resolver/startup tests: **24/24 PASS**.
- Full frontend regression: **2,813/2,813 PASS**.
- Genuine signed employee acceptance executed against the already signed Chromium CDP session on port `9225`.
- Overview HTTP 403: PASS; Overview HTTP 503: PASS.
- TimeTracker, Fund Tracker, FuelTrack+, and TradeLink cold-start under HTTP 403: 4/4 PASS.
- TimeTracker, Fund Tracker, FuelTrack+, and TradeLink cold-start under HTTP 503: 4/4 PASS.
- All four native resolvers returned HTTP 200 with exact canonical module and board identities; all required application-domain reads returned HTTP 200.
- The same signed employee and workspace remained consistent across all four applications.
- Catalog recovery after removing the temporary override and invoking the existing non-mutating workspace refresh retry: HTTP 200, degraded notice cleared — PASS.
- JavaScript page errors: 0; failed REST requests: 0; unexpected HTTP errors: 0.
- Production data writes, workflow submissions, and policy changes: 0.
- Sanitized machine-readable runtime evidence: `docs/evidence/cp-native-app-access-03g-employee-runtime.json`.

## Current acceptance status

- Existing native resolver and catalog fallback implementation: **VERIFIED by existing tests and deployed baseline**.
- CP-03 403/503/recovery runner and contract coverage: **IMPLEMENTED; local tests PASS**.
- Genuine signed employee cold-start under 403: **VERIFIED — 5/5 scenarios**.
- Genuine signed employee cold-start under 503: **VERIFIED — 5/5 scenarios**.
- Genuine employee catalog recovery: **VERIFIED — HTTP 200; degraded notice cleared**.
- Final production runtime certification: **VERIFIED for the deployed application build**; this CP-03G change only strengthens acceptance tooling and documentation.
