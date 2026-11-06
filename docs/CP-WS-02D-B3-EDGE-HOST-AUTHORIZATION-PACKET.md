# CP-WS-02D/B3 — Controlled HTTPS Host Authorization and Genuine Deployed Signed-Read/Denial Gate

**Checkpoint:** 2026-11-06  
**Status:** `HOST SOURCE STAGED + OFFLINE TESTS VERIFIED; DEPLOYMENT NOT APPROVED OR EXECUTED; GENUINE DEPLOYED HTTPS ACCEPTANCE PENDING`

## Decision boundary

This is a **proposal** for one new, read-only, default-off Supabase Edge Function using the existing WatchdogWorkspace project `jtlusodorfnyzgyuewkz`. It reuses a managed publicly trusted Supabase HTTPS origin and existing signed-session/RPC authorization. **The existing project contains real production accounts and data; calling this "staging" does not make it an isolated nonproduction data environment.** Separate host-specific security and operational authorization is required before deploying even a disabled route.

**Proposed URL only — not deployed or verified reachable:** `https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read`.

**Current actual state:** Existing project Edge Functions are `admin-sync-auth-access`, `toolbox-attachment-maintenance` and `apsyntra-native-issues`. There is no active B3 signed-read Edge Function. No new Supabase project, roles, privileges, production SQL migration, Auth mutations, credentials, provider delivery, domain writes or live board actions were created for this gate. GitHub Pages is still the frontend, not the backend.

## New source artifacts (draft PR #34, source only)

| File | Contract |
| --- | --- |
| `server/ws02d-b3-edge-signed-read.mjs` | Composes the existing default-off B3 signed handler and caller-JWT PostgREST reader with live `auth/v1/user` and `wm_ws01_list()` signed-session checks. Project origin is exact and pinned, publishable key only, callback verifies the same actor/session/workspace again after 12 predicates. |
| `supabase/functions/apsyntra-ws02d-b3-read/index.ts` | Unmounted proposed Edge entrypoint. Host activation disabled unless `WS02D_B3_EDGE_READ_APPROVED=true` is deliberately provisioned after approval. `SUPABASE_PUBLISHABLE_KEYS` provides the project's publishable key; no service-role or custom session DB credential. |
| `server/ws02d-b3-signed-read-staging.mjs` | Existing signed HTTP handler now checks an optional verified workspace ID against the signed context and accepts `apikey` in the exact-origin CORS preflight. It remains default disabled. |
| `server/tests/ws02d-b3-edge-signed-read.test.mjs` | Synthetic success/denial tests with mocked GoTrue and user-scoped PostgREST; not a real user session. |
| `.github/workflows/cp-ws02d-b3-staged-edge-read.yml` | PR-only offline Node 22 tests and explicit default-off deployment-flag check; no secrets, live upstream requests or external deployment. |
| `sql/tests/cp-ws02d-b3-edge-host-session-source-lock.sql` | Live **read-only** prerequisite inventory of the four existing session and access functions. No user records, Auth session rows, DDL or DML. |

### Why no new private session-table grant is needed

Production metadata was inspected read-only. The existing `public.wm_ws01_list()` is authenticated-callable and internally invokes `private.wm_board_config_session_active()`, which verifies the actual signed JWT's `session_id` and `auth.uid()` against `auth.sessions`. The private checker does not have direct authenticated/anon EXECUTE grants. This is reused with the same bearer token that calls `wm_auth_access_context()` and `has_module_access(p_module_id)`. The proposed host additionally performs a real GoTrue `GET /auth/v1/user` check before accessing PostgREST and rechecks after all module reads. It never passes `p_user_id` into `has_module_access`.

**Production-safe session-source preflight — VERIFIED:** `CP-WS-02D/B3-EDGE-HOST-SESSION-SOURCE-LOCK` returned **4/4 definitions matched, 0 drift**, result `EXISTING_SIGNED_SESSION_RPC_SOURCE_MATCH__HOST_UNDEPLOYED`. The locked functions are:

- `public.wm_ws01_list()` — MD5 `9f8c947a4a13083330b4c98fe77b57b1`.
- `private.wm_board_config_session_active()` — MD5 `a2284885128169732cb646fe03adcd83`.
- `public.wm_auth_access_context()` — MD5 `4b724270f79a4627fbbf45d0c932bd97`.
- `public.has_module_access(text,uuid)` — MD5 `3d44e27eed8d67ac223a9c4353d6003a`.

These are **source and grant observations**, not live signed HTTPS attestation. Retest immediately before approved deployment. The original optional-`p_user_id` entitlement-information privacy concern remains independent and unresolved in the live production function.

## Verified nonproduction tests

[Default-Off Edge Signed Read Contract workflow 42157191678](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42157191678): **completed SUCCESS** at commit `84dedd4f3312ec00a3d1c0aa37bb51fbd3805c23`.

**26/26 Node tests passed, 0 failed**, including the pre-existing signed handler and GoTrue/PostgREST adapter tests. The new coverage includes:

- Invalid project URL, nonpublishable key and off-by-default configuration cause **zero upstream requests**.
- Exact GitHub Pages origin, CORS including `apikey`, GET/OPTIONS restriction and bearer framing.
- Synthetic `auth/v1/user`, authenticated server `wm_ws01_list()`, authoritative `wm_auth_access_context()`, 12 user-scoped Boolean `has_module_access` reads.
- Same actor, active workspace, current session and 12-module read revalidation; no user IDs, token, session IDs or workspace IDs in the returned report.
- Simulated expired/malformed/fake JWT, revoked session at first or second check, wrong actor, foreign workspace, invalid Boolean response and error sanitization.

An initial test failure exposed a four-segment UUID validator that rejected valid five-segment UUIDs. The validator was corrected and temporary diagnostic exports removed before the successful run. Earlier failed CI attempts are not evidence of acceptance. **All networking in this new workflow is mocked.** The earlier [real disposable GoTrue/PostgREST/temporary TLS/RLS workflow 42141011359](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42141011359) verifies a different, isolated boundary.

**Not yet verified:** Deno Edge bundling/deployment, platform `verify_jwt` configuration, actual publicly trusted HTTPS endpoint response, real user requests, current-signature session revocation over deployed HTTPS, cross-account/foreign-workspace production denial and actual rollback.

## Host-specific approval checklist — unfulfilled

A separate approval must specify that the operator authorizes **one new production-connected, read-only Edge Function** on the existing project at the proposed exact route; no arbitrary alternate host, no general domain-write capability, no new SQL grants/roles and no secret/service-role key. Require all of:

1. **Deployment contract:** Exact function slug, version/commit, owner, production-connected exposure and rollback/disable ownership. The proposed source **does not yet establish a successful Deno bundle**.
2. **JWT boundary:** Platform `verify_jwt=true` for signed-user bearer requests, plus handler-level `getUser` verification and signed `wm_ws01_list` active-session denial. Supabase [Authorization header guidance](https://supabase.com/docs/guides/functions/auth-headers): user JWT in `Authorization`; publishable key in `apikey`. A publishable key is not a user JWT.
3. **Host activation:** Approve or reject provisioning `WS02D_B3_EDGE_READ_APPROVED=true` **after** a default-off deployed host is verified. No routine test should automatically flip this flag.
4. **Least privilege and privacy:** Exactly the existing read RPCs, no `service_role`, no raw `auth.sessions` grant, no external email/provider API, no domain DML. TLS CA chain valid, strict CORS and OPTIONS/GET tests, no redirects, sanitized report and no sensitive logs.
5. **Live acceptance plan:** Existing genuine signed users only. Positive signed read; 12 Boolean predicates; anon/malformed/foreign-origin denial; controlled sign-out/revocation without changing production identities; another existing signed principal/foreign-workspace denial when legitimately available; session/workspace revalidation after read. Do not ask the user to paste JWTs, session IDs or secrets.
6. **Safe failure:** On unexpected response, disable the function and preserve source and audit evidence. Keep production privacy cutover, domain-write testing, provider delivery and B4 workspace selection separate.

The only approved hosting property currently established is the **existing project and its canonical HTTPS origin**. **A new public function, new production-connected runtime surface or activation flag has not received separate host-specific approval.**

## Gate disposition and next action

| Requirement | Classification |
| --- | --- |
| Genuine browser B3 12/12 module read preflight | VERIFIED — operator-submitted |
| Existing session-authority read-only metadata | VERIFIED — 4/4 source lock |
| Default-off Edge host source and synthetic acceptance | VERIFIED — 26/26 unit tests |
| Edge Deno build/deploy and public CA/TLS test | PENDING — undeployed |
| Host-specific security and operational approval | BLOCKED — approval not yet supplied |
| Real deployed signed-read/denial and revoked-session acceptance | BLOCKED — no approved endpoint and no originating browser access |
| Production privacy migration, domain writes, invitations and B4 | BLOCKED — distinct gates |

**Overall CP-WS-02D/B3 readiness: 6/10 (60%)**, unchanged. A source-only host is not an accepted mounted trusted HTTPS backend.

**Next required gate:** `CP-WS-02D/B3 — Approved Read-Only Edge Host Deployment and Genuine Signed HTTPS Acceptance`. Advance only after independent approval and then prove the real endpoint; keep this PR draft until its production-connected scope and security review are resolved.
