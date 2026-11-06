# CP-WS-02D/B3 — Operator-configured activation, live 503 and isolated signed UI

**Date:** 2026-11-06 (Asia/Manila)
**Decision:** **BLOCKED — deployed host still responds 503 to the authorized-origin preflight.**
**Important:** The operator reports having configured `WS02D_B3_EDGE_READ_APPROVED=true` in the existing Supabase project. This is a report about the dashboard change, **not runtime acceptance**.

## Deployed control-plane state

Existing project: `WatchdogWorkspace`, ref `jtlusodorfnyzgyuewkz`.
Deployed Edge function `apsyntra-ws02d-b3-read` is `ACTIVE`, version **2**, `verify_jwt=true`, with unchanged code SHA `3508b478f9eebe0656128d099bd07b5e306bb39b1aa5fb6af9bdc4a671660411`. The three pre-existing unrelated functions also incremented their versions with unchanged code fingerprints. This is **consistent with** configuration propagation/redeployment; it does **not** prove that the flag's value is visible or that the read handler's prerequisites are satisfied.

The entrypoint requires `Deno.env.get('WS02D_B3_EDGE_READ_APPROVED')==='true'`. The composed handler also defaults OFF if the approved project origin or its publishable-key prerequisite is missing/invalid. Any of these fail-closed conditions can produce **HTTP 503**. We cannot isolate which runtime prerequisite is missing from a 503 alone. Do **not** remove the guard, switch to a secret/service-role key or turn `verify_jwt` off.

## Actual live public HTTPS evidence

[Workflow run 42166900582](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42166900582) ran from GitHub-hosted Ubuntu on the focused acceptance branch, against:
`https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read`.

- Node 22 app syntax, frontend source guard and all six synthetic browser tests: **PASS**.
- Actual certificate-validated HTTPS `OPTIONS` from `https://wass-psti.github.io` requesting `GET`, `authorization,apikey`: **HTTP 503**, `access-control-allow-origin` header **present**. **FAIL to satisfy expected activated 200.**
- The workflow then stopped fail-closed. Subsequent foreign-origin and anonymous/invalid-token tests in this run were **NOT RUN**. Previous public-host workflow [42159136903](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42159136903) proved anonymous/malformed 401 and inactive foreign-origin behavior **at an earlier host state**, not at the new config.

**No signed user's JWT, refresh token, user/workspace ID, account email, production record, provider, SQL mutation or membership change** was used or recorded.

## Minimal safe operator correction and recheck

Using [Supabase project → Edge Functions → Secrets](https://supabase.com/dashboard/project/jtlusodorfnyzgyuewkz/functions/secrets), inspect the **existing** variable before modifying it:

- Exact **name**: `WS02D_B3_EDGE_READ_APPROVED` (no `=true` in the name).
- Exact **value**: `true` (lowercase, no quotes, no surrounding whitespace).
- Confirm it was **saved** for the same project and the Edge runtime was refreshed. The project hosts production-connected resources; avoid changing unrelated secrets.
- If the key and value are already exact, **do not repeatedly redeploy or weaken the guard**. The next technical diagnosis is a narrow, approved, nonsecret runtime-readiness indication for the preflight, separating flag presence from publishable-key parsing. A code/config change should preserve exact origin, JWT and all fail-closed restrictions.

Until an actual approved-origin `OPTIONS` returns HTTP 200 with exact CORS, **do not claim activated host readiness** or run live authenticated traffic. A genuine read PASS will additionally require a real same-actor signed JWT, independent GoTrue/session checks, 12 module probes and sanitized successful reply; cross-workspace and revoked-session denial must be separately witnessed.

## Isolated frontend acceptance PR

This focused PR contains only the current-main-based browser UI and synthetic test plus one CI workflow. It is **draft** and **not deployed to the CRM**; the earlier broader workspace/privacy PR #34 stays independent. The browser control, once reviewed and deployed, will send the real existing signed user's token exclusively to the pinned Edge HTTPS route and return a sanitized status. It **does not** verify independent table-level RLS, cross-account denial or revoked-session behavior by itself.

**Overall overarching B3 readiness:** **6/10 (60%)**, unchanged. A new positive numerator requires genuine live acceptance, not settings changes, synthetic tests or a matching Edge bundle SHA.
