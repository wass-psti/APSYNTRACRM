# CP-WS-02D/B3 — Genuine Signed-User Read Report → Real Auth/Trusted Backend Staging Acceptance

**Checkpoint date:** 2026-11-06  
**Classification:** `VERIFIED — STAGED AUTH/RLS READ CONTRACT; GENUINE SIGNED USER AND DEPLOYED BACKEND STILL PENDING`.

This continues [the prior trusted-execution fixture](./CP-WS-02D-B3-GENUINE-READ-TRUSTED-EXECUTION-FIXTURE.md) and retains **30/30 isolated domain write/denial path coverage**. No changes were made to production roles, authentication, database function privileges, RLS policies, workspace memberships, domain records, invitation flags or provider delivery.

## Implementation and tests

[GitHub Actions PG17/Node #191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42135755289) **completed SUCCESS** on `main`, incorporating the original PG17 session/auth and trusted private-issuer fixtures, domain contracts and the new staging read tests.

| Artifact | Tested boundary | Status |
| --- | --- | --- |
| `server/ws02d-b3-signed-read-staging.mjs` | Default-off HTTP GET/OPTIONS acceptance boundary; exact GitHub Pages origin; verified actor/session and re-verification after reads; stable workspace; 12 Boolean module results; no IDs or tokens in response | **VERIFIED — mocked unit HTTP tests** |
| `server/ws02d-b3-user-scoped-rpc.mjs` | Caller JWT + publishable key; pinned existing Supabase project; `POST /rest/v1/rpc/wm_auth_access_context` and `POST /rest/v1/rpc/has_module_access` with **only** `p_module_id`; response size/content bounds; no secret/service-role key | **VERIFIED — mocked PostgREST transport tests** |
| `server/ws02d-gotrue-live-read-adapters.mjs` | Existing strict Auth `GET /auth/v1/user` and PostgreSQL `auth.sessions` checks, now pinned to the approved project URL | **VERIFIED — mock Auth + prior real disposable DB** |
| `server/tests/ws02d-b3-signed-read-staging.test.mjs` | Disabled default, invalid/missing JWT, foreign Origin, missing dependencies, changed user/workspace/session, invalid module types and privacy sanitization | **PASS** |
| `server/tests/ws02d-b3-user-scoped-rpc.test.mjs` | Exact RPC names and request body; caller JWT not replaced by admin credentials; full GoTrue + session + 12 RLS-scope module-read composition; revoked/missing scope denied | **PASS** |
| Existing `frontend/workspace-b3-signed-read-preflight.js` | User-triggered genuine live read from Security page; **unchanged** | **AVAILABLE — user-executed evidence PENDING** |

**Important:** The passing tests use **mocked GoTrue and PostgREST responses**, while the existing PostgreSQL session and private invitation-role fixtures use real **disposable** PG17. The new HTTP handler is **not mounted, deployed, invoked with a genuine user JWT, or connected to an active provider**. A forged locally signed JWT or mock provider response is not acceptance of live authentication.

## Read-only production metadata compatibility

The existing Supabase project was inspected without reading user records or performing writes:

- `wm_auth_access_context()` and `has_module_access(text,uuid)` both have `authenticated` EXECUTE, **not anonymous** EXECUTE. Both are SECURITY DEFINER; neither has a direct literal GoTrue active-session check. The **new backend bridge** requires separate GoTrue/user identity and live `auth.sessions` validation.
- `wm_auth_access_context()` resolves the signed `auth.uid()` and authoritative workspace. The existing frontend's `api.context()` calls this exact RPC.
- `has_module_access` exposes an **optional** `p_user_id` argument. It defaults to `auth.uid()` but its original source does not explicitly require `p_user_id=auth.uid()`. **Review this preexisting arbitrary-actor entitlement-inspection surface before production rollout**. The staged backend and existing frontend explicitly omit `p_user_id` and provide only `p_module_id`. Do not change the live function/grants as an incidental part of B3.
- `private.ws02d_invitations`, the delivery ledger and private issuer are **absent** in production. Workspace B3 creation and B4 selection flags are **disabled**; B4 selector RPC is absent. Production still reports **2 workspaces and 40 active memberships**.
- The existing project still has **no deployed WS02D invitation Edge Function**. No real provider/sender DNS/webhook acceptance evidence has been supplied.

These catalog observations establish existing contract **availability and grants**, not row-level security or an actual user's session authorization result.

## Signed-user evidence boundary

The deployed GitHub Pages Security page already offers **Run B3 signed read preflight** followed by **Copy nonsecret B3 preflight**. Its result is a client-side, read-only report with four named checks, 12 module predicates, and zero writes or credential disclosure. The report is **user-submitted evidence, not a cryptographically signed backend attestation**.

The originating signed browser context was unavailable through the connected browser tool in this chat. **No genuine B3 report was executed or received**. Prior B2 signed-user reports, aggregate live Auth-session counts, mocked JWTs and synthetic PostgreSQL test identities cannot replace this criterion.

For future live trusted staging, use a separately reviewed signed-user route with enforced platform `verify_jwt=true`, current [Supabase user-authenticated Edge Function pattern](https://supabase.com/docs/guides/functions/auth) or equivalent trusted host, a user-scoped RLS client for signed RPCs, and an independently verified active GoTrue session. The staged Node handlers **do not automatically provide Supabase Edge deployment or platform JWT signature validation**.

## Acceptance ledger

| B3 overarching criterion | Status |
| --- | --- |
| 30/30 isolated business write/denial tests | **VERIFIED — prior** |
| Two PostgreSQL concurrent CAS races | **VERIFIED — prior** |
| Production RLS/grant inventory | **VERIFIED — prior** |
| Original 24-domain SQL source integrity | **VERIFIED — prior** |
| Backend Auth/delivery contract mock + disposable SQL integration | **VERIFIED — strengthened in this checkpoint** |
| Genuine signed-user B3 read report | **PENDING** |
| Genuine signed authorized/denied new-ceiling domain write | **BLOCKED — production ceilings not installed** |
| Trusted mounted backend issuer and safe live-session integration | **BLOCKED — staging deployment/roles not approved** |
| Real invitation delivery, receipt and webhook acceptance | **BLOCKED — provider not activated** |
| Invited account's signed active-workspace B4 selection | **BLOCKED — separate B4 gate** |

**Overarching score remains 5/10 (50%)**, because tests only strengthened a criterion already accepted at the isolated-development boundary. The new staging read test suite passes, but **genuine signed and production acceptance remain incomplete**.

**Next required gate:** `CP-WS-02D/B3 — User-Executed Genuine Signed B3 Read Acceptance → Controlled Nonproduction Auth/Backend Integration`. Collect only the Security-page sanitized report; then independently approve a genuine signed HTTPS staging environment and its least-privileged access. Verify real token/session expiry/revocation and RLS under user-scoped credentials before provisioning a private issuer or enabling outbound invitations. Reconcile the optional-`p_user_id` review and B4 workspace switching as separate security/activation gates.
