# CP-WS-02D/B3 — Controlled signed-read activation and real deployed GoTrue/session/RLS acceptance

> **2026-11-06 — SUPERSEDING ACCEPTANCE STATUS:** The managed Edge activation and public HTTPS/CORS/anonymous denial are now **VERIFIED**, and the operator has supplied a genuine deployed signed-HTTPS acceptance report with **PASS, 12/12 module probes, 12/12 authorized**, zero writes and zero identifiers. Main has deployed the UI via PR #35 / commit `a2b5532`. **Foreign-workspace denial, independent table-level RLS and revoked-session denial remain PENDING.** See [genuine signed-read evidence ledger](./CP-WS-02D-B3-GENUINE-SIGNED-HTTPS-ACCEPTANCE-20261106.md). The remainder of this document preserves its earlier activation-pending state as historical evidence.


**2026-11-06 decision:** `SIGNED BROWSER HARNESS IMPLEMENTED-UNVERIFIED; LIVE RLS CATALOG VERIFIED; APPLICATION ACTIVATION BLOCKED; GENUINE SIGNED-HTTPS READ PENDING`.

This is the **next-stage evidence** following [deployed default-off HTTPS host acceptance](./CP-WS-02D-B3-DEPLOYED-HTTPS-GATE-20261106.md). Do not confuse successful transport-layer checks or synthetic browser harness tests with a genuine production signed-user read.

## 1. Frozen host security boundary

- Existing project only: `jtlusodorfnyzgyuewkz` (`WatchdogWorkspace`).
- New deployed Edge Function: `apsyntra-ws02d-b3-read`; `ACTIVE`, version **1**, `verify_jwt=true`, stored bundle SHA `3508b478f9eebe0656128d099bd07b5e306bb39b1aa5fb6af9bdc4a671660411`.
- Public route: `https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read`.
- Actual application-level read path remains **default-OFF**, requiring exactly `WS02D_B3_EDGE_READ_APPROVED=true` in the managed Edge runtime environment to activate.
- Origin must be exactly `https://wass-psti.github.io`; POST/domain mutation denied. Existing caller JWT and a publishable key are forwarded only to approved GoTrue and PostgREST reads.
- Deployment v1 and the original three unrelated Edge Functions were re-inspected; none of the latter were modified in this gate.
- **Do not redeploy this host with the default-off predicate removed or `verify_jwt=false` as an activation workaround.**

## 2. Live production SQL/RLS catalog inventory — VERIFIED

Executed the pre-existing **read-only** `sql/tests/cp-ws02d-b3-live-auth-rls-readonly-inventory.sql` on the connected existing project. The result was:

```text
WS02D_B3_LIVE_AUTH_RLS_GRANTS_BOUNDARY_VERIFIED
public_domain_tables=17
public_domain_rls_enabled=17
public_domain_rls_missing=0
public_domain_signed_write_granted=0
public_domain_anon_write_granted=0
exposed_writable_without_rls=0
public_domain_tables_with_policy=5
public_domain_tables_default_deny=12
private_ws02d_table_count=0
private_ws02d_client_writable=0
```

Additional grant observations: ordinary signed users could not directly invoke the watched app-role mutation or raw attendance-internal RPC; the Charter role RPC was authenticated-callable but not anonymous-callable. The WS02D private invitation contract and B4 selection RPCs were still absent.

**Scope limitation:** This is a PostgreSQL **metadata** inventory, not signed cross-workspace or revoked-session runtime acceptance. RLS enabled does not imply the policies correctly deny all foreign rows or that `SECURITY DEFINER` RPCs enforce table RLS. The observed `public.has_module_access(text,uuid)` RPC is `SECURITY DEFINER` and the separate cross-actor entitlement disclosure concern remains outstanding. No production permission policy was changed.

The exact source definitions of `wm_ws01_list()` and `wm_auth_access_context()` were read and found to return the data shapes expected by the Edge adapter. The `wm_ws01_list()` implementation requires `private.wm_board_config_session_active()`, an active profile, and an active workspace membership; the session helper consults the real `auth.sessions` table using the incoming signed JWT's actor/session IDs.

## 3. Implemented draft-only genuine signed browser acceptance action

A **new, additive** browser acceptance module, `frontend/workspace-b3-deployed-https-acceptance.js`, is wired to the existing Security view in draft PR #34:

- **Run deployed B3 signed HTTPS check:** runs only on the exact GitHub Pages origin and only under the browser's existing `AuthClient` session; obtains the caller's token in memory, passes it directly to the exact HTTPS B3 route in an `Authorization` header, and uses the existing public publishable key in `apikey`.
- Verifies current signed GoTrue user identity before and after the call. The Edge host itself is responsible for independently validating the live GoTrue user, actual session, authoritative workspace and module access.
- Accepts a real `PASS` only after receiving HTTP 200, trusted JSON/no-store response headers, the exact server contract, all four named server checks, twelve numeric Boolean module probes, zero writes and identifiers, and stable browser identity.
- Distinguishes `BLOCKED` network/preflight, `401/403` gateway denial, `503` disabled/unavailable host and `FAIL` malformed success bodies. Browser CORS failures are intentionally **not** translated into invented HTTP responses.
- **Copy nonsecret deployed HTTPS result:** exports only whitelist-validated status, counts and acceptance scope; never JWT, refresh token, email, user/workspace ID, or raw API response.
- State, reporting and activity are cleared on sign-out/session expiration and guarded against stale result completion.
- This new UI **exists only on the PR draft branch**, not the deployed GitHub Pages main app. It does not initiate automated traffic until an authenticated operator clicks the action after an authorized frontend deployment.

Dedicated offline tests exercise fake transport and fake identity only; CI must pass before accepting the code. Such synthetic tests are **IMPLEMENTATION-VERIFIED ONLY**, not real signed HTTPS evidence.

## 4. Activation blocker and minimal authorized operator action

The available connected Supabase actions can **deploy/read** Edge Functions but **cannot create or update Edge runtime secrets/environment flags**. The read-only browser connection cannot access the originating signed APSYNTRA CRM tab. No genuine bearer JWT was available; none is requested, collected or logged.

The operator responsible for the existing Supabase project must, during a controlled acceptance window:

1. Open [WatchdogWorkspace in Supabase Dashboard](https://supabase.com/dashboard/project/jtlusodorfnyzgyuewkz). Navigate to **Edge Functions → Secrets** (according to the current managed dashboard UI).
2. Configure the single project Edge runtime variable `WS02D_B3_EDGE_READ_APPROVED` with the exact value `true`. This enables only the new B3 handler's existing default-off condition; other project functions must remain untouched. **No service role, DB password, JWT, custom grant, production role or membership change is needed.**
3. After the draft frontend acceptance UI is reviewed and deployed via its normal protected workflow, open `https://wass-psti.github.io/APSYNTRACRM/#/security` under a legitimately signed existing account and run **B3 · Deployed signed HTTPS acceptance**.
4. Copy **only the nonsecret result**. A `PASS` is genuine only if the actual live Edge route returned the strictly validated 200 and 12 module probes; a `BLOCKED` or denied network request is **not** a PASS.
5. For the limited acceptance window, collect separate authorized denied outcomes for a legitimately available second principal / foreign workspace / revoked session, without creating or modifying accounts or altering production roles. Do not paste JWTs or secrets into chat, GitHub or CI logs.
6. Restore the default-off condition by removing the custom activation variable when testing is finished or any anomaly occurs. A project-wide Edge secret update can affect other functions if reused: retain the unique WS02D_B3 prefix.

If the actual JWT gateway rejects a genuine signed token, review the existing project's JWT signing mode and [Supabase Edge authorization guidance](https://supabase.com/docs/guides/functions/auth-headers); **do not disable platform JWT verification** as a workaround.

## 5. Acceptance ledger

| Requirement | Status | Evidence |
| --- | --- | --- |
| Host registered, original function isolation, `verify_jwt=true` | **VERIFIED** | Supabase Edge inventory and deployed source inspection |
| Public CA-validated HTTPS, anonymous/malformed bearer denial, exact-origin CORS | **VERIFIED** | [public HTTPS smoke 42159136903](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42159136903) |
| Real production signed-session and RPC source contract | **VERIFIED — metadata** | Read-only `pg_get_functiondef` inspection |
| Live production table RLS/grant configuration | **VERIFIED — metadata** | `WS02D_B3_LIVE_AUTH_RLS_GRANTS_BOUNDARY_VERIFIED`, 17/17 |
| Additive signed-browser genuine HTTPS acceptance client | **IMPLEMENTED-UNVERIFIED** | PR #34 frontend module, Security view integration, synthetic tests |
| Controlled environment activation | **BLOCKED** | No available connected Edge secrets-write action |
| Genuine signed-user HTTPS 200 and two independent identity checks | **PENDING** | No enabled host or originating signed browser |
| Genuine session revocation and foreign-scope runtime denial | **PENDING** | No approved live principal fixtures / no signed browser |
| Table-level cross-workspace RLS runtime acceptance | **PENDING** | Catalog checks are not runtime RLS checks |
| Domain writes, delivery provider, 45-consumer privacy cutover, B4 switching | **NOT APPLICABLE to this subgate** | Requires independent gates and approvals |

**Overarching B3 progress:** **6/10 (60%)** remains unchanged until the real deployed signed HTTPS acceptance requirements are met. Keep PR #34 **draft**, and do not merge, activate additional domains or claim production readiness from CI alone.
