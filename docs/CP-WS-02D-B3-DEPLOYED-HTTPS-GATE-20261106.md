# CP-WS-02D/B3 — Deployed HTTPS host: controlled live evidence and outstanding signed-user acceptance

> **2026-11-06 — SUPERSEDING SIGNED ACCEPTANCE:** The earlier default-OFF deployment subsequently became active after the operator corrected the Edge secret name. Real public-origin OPTIONS **200**, foreign-origin OPTIONS **403**, unsigned/malformed GET **401**; the deployed signed-user browser report now records **PASS and 12/12 authorized module reads**. Independent RLS, foreign-workspace and revoked-session denial are **PENDING**. See [new signed read ledger](./CP-WS-02D-B3-GENUINE-SIGNED-HTTPS-ACCEPTANCE-20261106.md). Original version-1/default-OFF statements below are historical.


**Evidence checkpoint:** 2026-11-06 (Asia/Manila).  
**Disposition:** **PUBLIC TRUSTED HTTPS HOST DEPLOYED, DEFAULT-OFF; PUBLIC UNAUTHENTICATED / PREFLIGHT CHECKS VERIFIED; GENUINE SIGNED-USER READ/DENIAL PENDING.**  
**Scope:** Existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`; no additional project.

## Actual deployment (control-plane evidence)

The previously approved exact **new** Edge Function was deployed using the Supabase connected deployment action, **not** by merging the draft PR. The upload included six original UTF-8 source files from **Git commit `9dae46402ecef9a96fb750c4675b937823b686bd`**:

- `supabase/functions/apsyntra-ws02d-b3-read/index.ts`
- `server/ws02d-b3-edge-signed-read.mjs`
- `server/ws02d-b3-signed-read-staging.mjs`
- `server/ws02d-b3-user-scoped-rpc.mjs`
- `server/ws02d-gotrue-live-read-adapters.mjs`
- `server/ws02d-gotrue-actor-verifier.mjs`

**Canonical route:** `https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read`.

**Deployed function ID:** `87b49289-4633-4a83-ba14-c903b20469ef`  
**Version/status:** 1 / `ACTIVE`  
**Platform JWT check:** `verify_jwt=true`  
**Recorded bundle SHA-256:** `3508b478f9eebe0656128d099bd07b5e306bb39b1aa5fb6af9bdc4a671660411`  
**Entrypoint:** `supabase/functions/apsyntra-ws02d-b3-read/index.ts`.

The separately verified deployed file inventory matched the six uploaded files and version. The other three existing project Edge Functions (`admin-sync-auth-access`, `toolbox-attachment-maintenance`, `apsyntra-native-issues`) retained their observed versions, statuses and bundle SHA values. **No functions were replaced.**

**Critical distinction:** The function is **deployed** and its global public route is registered, but its **application signed-read handler remains disabled** unless the explicitly checked runtime flag `WS02D_B3_EDGE_READ_APPROVED=true` is configured. No secret/key/flag was provisioned or changed in this gate. The default-off function returns `503 BLOCKED` even for valid signed users; the gateway can reject unsigned requests with `401` before reaching it. Do not confuse `ACTIVE` control-plane status with accepted signed reads.

## Live public HTTPS evidence — verified

**GitHub Actions:** [CP-WS-02D/B3 Genuine Public HTTPS and Anonymous Denial Smoke — run 42159136903](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42159136903). Executed successfully using a GitHub-hosted runner and system CA certificates; no `curl -k`, no redirect following, no real bearer tokens, no credentials or domain writes.

| Real deployed public HTTPS request | Actual result | Classification |
| --- | --- | --- |
| GET with no bearer and no API key | HTTP **401** | **VERIFIED** — denied at live gateway |
| GET with intentionally malformed bearer | HTTP **401** | **VERIFIED** — denied at live gateway |
| OPTIONS from `https://wass-psti.github.io`, requesting `authorization,apikey` | HTTP **503**, `Access-Control-Allow-Origin` present | **VERIFIED** — request reached default-off handler; legitimate-origin CORS retained |
| OPTIONS from `https://untrusted.example.invalid` | HTTP **503**, **no** `Access-Control-Allow-Origin` | **VERIFIED** — default-off handler did not authorize foreign-origin CORS |

The signed-browser CORS preflight is not yet a positive accepted preflight because the application gate is deliberately disabled. The strict transport and origin behavior are nevertheless demonstrated by real public network requests. No certificate chain was exported or logged, but `curl` succeeded with normal certificate verification and a minimum TLS 1.2 requirement.

**Offline safety regression:** [Edge host contract CI 42157419191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42157419191) **SUCCESS**, 26/26 Node tests on the draft branch, validating source behavior under mocks. [Disposable privacy CI 42157419194](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42157419194) **SUCCESS**. The public HTTPS smoke does **not** exercise real GoTrue signed-user reads or server-side RLS predicates.

## Signed-session authority — baseline only

The existing production functions remained source-locked in a separate **read-only** catalog check:

- `public.wm_ws01_list()` MD5 `9f8c947a4a13083330b4c98fe77b57b1`
- `private.wm_board_config_session_active()` MD5 `a2284885128169732cb646fe03adcd83`
- `public.wm_auth_access_context()` MD5 `4b724270f79a4627fbbf45d0c932bd97`
- `public.has_module_access(text,uuid)` MD5 `3d44e27eed8d67ac223a9c4353d6003a`

The old `has_module_access(p_module_id,p_user_id)` cross-actor privacy concern and nullable module-state delete helper concern remain **unresolved in production**. This Edge Function intentionally forwards only `p_module_id` for self-scoped reads; it does not modify the existing publicly callable RPC or its 45 dependent stored functions.

## Outstanding activation and genuine signed acceptance

**BLOCKER:** The connected Supabase management tools provide deployment and read-only inspection, but do **not** provide an action to set the function's guarded runtime environment flag. The assistant's connected browser also cannot access the originating signed APSYNTRA CRM browser context. No production signed JWTs, session IDs, secrets or raw profiles were collected.

Before completing this gate, an authorized operator must deliberately configure **`WS02D_B3_EDGE_READ_APPROVED=true`** in the existing project's Edge Function secrets (this is a production-connected runtime-configuration change). No user tokens or service-role credentials should be pasted into chat or GitHub. After controlled activation, the following must be **actually tested** on the deployed HTTPS route:

1. Real existing signed-user GET with `Authorization: Bearer <real caller JWT>` and project publishable key in `apikey`, via the trusted frontend/browser. Expect sanitized `200 PASS` with four checks, 12 Boolean module access reads, zero identifiers disclosed and no domain writes.
2. Valid signed-actor revalidation, authoritative workspace/profile/membership verification and real current `auth.sessions` check via the existing `wm_ws01_list()` chain; separate fresh GoTrue `/auth/v1/user` check.
3. Expired/invalid JWT, anonymous, foreign-origin, inactive, session-revoked, changed workspace and cross-account denial cases where legitimately available, without altering production users, passwords, grants or data.
4. Validate no sensitive responses/logs, no unauthorized direct `p_user_id` operation through this route, exact CORS, no cache, correct credentials and no additional application API surfaces.
5. Record sanitized result counts and statuses and bind them to deployed function version, commit and date. **A source code success or anonymous 401 cannot replace these proofs.**

No release, production privacy cutover, mail/invitation sending, B4 workspace switching or full 45-consumer runtime acceptance is approved by this checkpoint.

## Rollback and state preservation

The function's application feature flag is already **default-OFF**; do not add any flag or secrets unless deliberate activation is approved and feasible. If runtime safety regresses after activation, unset `WS02D_B3_EDGE_READ_APPROVED` (if configured) or redeploy the known v1 default-off artifact; delete the new route in the Supabase Dashboard if required by the responsible project administrator. No production database rollback is involved because this gate made **zero SQL/auth/role/grant changes**. The draft PR remains open and unmerged.

**Overall B3 ledger:** **6/10 (60%)** until genuine server-side signed-user acceptance is completed; deployment and anonymous/CORS evidence improve the host subgate but do not satisfy the combined production-backed security acceptance criterion.

**Next required gate:** `CP-WS-02D/B3 — Controlled Signed-Read Activation and Genuine Deployed GoTrue/Session/RLS Acceptance`. Keep the host default-off while this acceptance remains unavailable.
