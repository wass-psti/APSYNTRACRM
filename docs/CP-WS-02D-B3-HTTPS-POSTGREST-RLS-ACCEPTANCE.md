# CP-WS-02D/B3 — Genuine Deployed Signed-User Read and Nonproduction User-Scoped RLS/HTTPS Integration

**Date:** 2026-11-06  
**Decision:** `VERIFIED — ISOLATED REAL GOTRUE + HTTPS + POSTGREST + RLS; DEPLOYED APSYNTRA USER READ PENDING`

This gate extends [the previous GoTrue signed-JWT nonproduction acceptance](./CP-WS-02D-B3-LOCAL-GOTRUE-ACCEPTANCE.md). It uses the **existing repository and GitHub Actions ephemeral containers only**. No second Supabase project, production database changes, Auth mutations, roles/grants, provider activation, email delivery, or workspace selection was performed.

## Executed evidence

[CP-WS-02D/B3 Disposable Real GoTrue Signed-Session Acceptance, **workflow run #5**](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42141011359): **COMPLETED SUCCESS**, head `dd0c9261317f5722cc1749b04ac4a64faad65d3d`.

This run passed the previous authentic local GoTrue-signed JWT and PostgreSQL session-revocation suite **plus** the new HTTPS/RLS/PostgREST integration suite.

| Component | Actual isolated test boundary | Result |
| --- | --- | --- |
| Supabase GoTrue `v2.189.0` | Two signed real local JWTs, verification through GoTrue and independent `auth.sessions` | **VERIFIED** |
| PostgREST `v14.17` | Verified GoTrue JWT signature under a separate database authenticator, `authenticated`/anonymous role selection, executed security-invoker RPCs | **VERIFIED** |
| TLS endpoint | Temporary self-signed localhost CA/certificate *explicitly trusted by the isolated Node runner*, HTTPS client, no plaintext acceptance path | **VERIFIED — local TLS, not production certificate** |
| PostgreSQL 17 RLS | One signed user's `profiles` and `workspace_members` rows invisible to another; anonymous denied; caller-specific `auth.uid()` | **VERIFIED — synthetic policy fixture** |
| Signed RPCs | `wm_auth_access_context` and `has_module_access` through actual user-JWT PostgREST requests, 12 module reads | **VERIFIED — synthetic function bodies** |
| Staged trusted read endpoint | Composes real local GoTrue user verification, current PostgreSQL session query and signed PostgREST RLS reads, then revalidates signed session/workspace | **VERIFIED — nonproduction** |
| Rejection cases | Tampered JWT, cross-principal entitlement inspection, foreign/mismatched workspace, anonymous read, disallowed Origin, revoked session | **PASS** |
| Test teardown | Auth/PostgREST containers stopped, ephemeral JWT signing secret and TLS material deleted, runner database discarded | **VERIFIED** |

The [CI job logs](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42141011359) include these nonsecret evidence signals:

```text
CP_WS_02D_B3_LOCAL_GOTRUE_ACCEPTANCE_PASS auth=REAL_LOCAL_GOTRUE signed_jwt=YES independent_pg_sessions=YES valid=2 forged_actor=DENIED disabled_profile=DENIED removed_membership=DENIED expired_session=DENIED revoked_session=DENIED foreign_identity_isolated=YES production_requests=0 production_mutations=0 external_email=0
LOCAL_POSTGREST_READY
LOCAL_HTTPS_TEST_CERTIFICATE_READY
WS02D_B3_HTTPS_POSTGREST_RLS_PASS real_local_gotrue=YES cryptographic_jwt=YES tls_verified=YES rls_signed_rows=ISOLATED unsigned_actor=DENIED cross_principal_rpc=DENIED revoked_session=DENIED twelve_module_reads=PASS writes=0 provider_delivery=0 production_requests=0
LOCAL_GOTRUE_POSTGREST_TLS_EPHEMERAL_CLEANUP_COMPLETE
```

### Artifact references

- `.github/workflows/cp-ws02d-b3-local-gotrue.yml`: pinned isolated GoTrue/PostgREST, disposable PG17, temporary TLS, cleanup with `always()`.
- `sql/tests/cp-ws02d-b3-local-user-scoped-rls.sql`: isolated `anon`, `authenticated`, NOINHERIT PostgREST authenticator and RLS; deliberately **not a deployable migration**.
- `scripts/ws02d-b3-https-rls-acceptance.mjs`: actual local HTTPS server and network forwarding restricted to named Auth and read-only RPC/table paths; real signed JWT and session checks, cross-workspace read denials, no secrets in stdout.
- Existing `server/ws02d-b3-signed-read-staging.mjs`, `server/ws02d-b3-user-scoped-rpc.mjs` and `server/ws02d-gotrue-live-read-adapters.mjs`: still **unmounted and default-disabled** for production.

## Important limitations

This milestone proves **isolated full-stack behavior**. It does not prove that the existing **deployed** GitHub Pages browser session can access a real trusted HTTPS backend. The local TLS certificate is not publicly trusted and the test proxy does not establish an authorized public production/staging host.

The RLS fixtures are intentionally **security-invoker substitutes**, not copies of production `SECURITY DEFINER` function bodies. In particular, the synthetic `has_module_access(text,uuid)` **explicitly rejects a foreign `p_user_id`**. The production version was previously found to accept an optional `p_user_id` without that direct equality condition. **Do not infer that the production function is safe from cross-principal entitlement inspection.** The staged user-scoped adapter omits the parameter. A separate read-only privacy/authorization review remains necessary before controlled production changes.

The real trusted service and private WS02D issuer have **not been deployed**. `verify_jwt=true` on a future Supabase Edge Function, actual public HTTPS domain/credentials, live user JWT/RLS, invitation recipient lifecycle, provider/webhooks, domain-write acceptance, and CP-WS-01C/B4 active-workspace switching remain **PENDING or BLOCKED**.

## Production guardrail check after CI

Live Supabase read-only metadata returned **2 workspaces**, **40 active memberships**, no `private.ws02d_invitations`, no delivery receipt ledger, no private issuer, no B4 selector, and creation/selection disabled. Existing project Edge Functions do **not** include `ws02d-invite`. No production data, Auth, grants or RLS were changed.

## Higher-level gate and next required checkpoint

The overarching B3 readiness ledger remains **5/10 (50%)**: earlier 30/30 disposable domain transaction acceptance, two races, production RLS/grant inventory, source integrity, and backend Auth/delivery integration are verified at their **development/nonproduction** boundaries. Although the backend criterion now has stronger real Auth/HTTPS/RLS evidence, the five remaining criteria are not met by the same tests.

**Next required gate:** `CP-WS-02D/B3 — Genuine Deployed Signed-User B3 Read Report → Controlled Trusted HTTPS Staging Host and Production RPC Privacy Review`.

The signed user should run **Run B3 signed read preflight** on [APSYNTRA CRM Security](https://wass-psti.github.io/APSYNTRACRM/#/security), then share **Copy nonsecret B3 preflight**. Do **not** share real tokens, session IDs, addresses, passwords, or emails. Authorize the nonproduction HTTPS host/least-privilege identity separately before mounting a trusted public backend; preserve B4 and provider activation gates independently.
