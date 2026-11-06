# CP-WS-02D/B3 — Genuine Signed B3 Read → Controlled Nonproduction GoTrue Integration

**Date:** 2026-11-06  
**Decision:** `VERIFIED — REAL LOCAL GOTRUE SIGNED-SESSION ACCEPTANCE; DEPLOYED APSYNTRA SIGNED-USER READ PENDING`.

This checkpoint follows [the staged signed-read and PostgREST contract](./CP-WS-02D-B3-REAL-AUTH-TRUSTED-READ-STAGING.md). All work is confined to the existing repository and **ephemeral GitHub Actions infrastructure**. The test does **not** create an additional Supabase project, access the user's signed browser token, run against production PostgreSQL, or enable invitation delivery.

## Executed integration

**[Disposable Real GoTrue CI run #3](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138213159): SUCCESS.** Workflow: `.github/workflows/cp-ws02d-b3-local-gotrue.yml`, source: `scripts/ws02d-b3-gotrue-disposable-acceptance.mjs`.

- Uses a pinned **`supabase/gotrue:v2.189.0`** image (version from the official Supabase self-hosted Docker reference), PostgreSQL **17**, Node.js **22**, a dedicated `gotrue_disposable` database and loopback-only Auth HTTP service.
- GitHub runner generates an ephemeral JWT signing key and random disposable password. Test accounts use synthetic `example.invalid` addresses. Email auto-confirm bypasses SMTP; **no external email provider** is configured or called.
- Real GoTrue `/signup`, password login when required, and authenticated `GET /user` establish **actual signed JWTs from GoTrue**. They are not hardcoded, printed, stored in artifacts, or sent to the APSYNTRA production project.
- The existing `createTrustedSignedActorReadVerifier` runs against the real local GoTrue user endpoint (via an explicitly loopback-only transport) and the **exact** production-candidate `WS02D_ACTIVE_SESSION_SQL` using PostgreSQL `PREPARE / EXECUTE` on synthetic `auth.users`, `auth.sessions`, `public.profiles` and `public.workspace_members`.
- Preserves two separate synthetic user/workspace memberships and validates both authentic actors. Tampering with the signed JWT actor claim is rejected by real GoTrue Auth.
- Validity checks deny removed workspace membership, inactive profile, expired session, and revoked/deleted session row even while an access JWT may remain otherwise valid. A valid foreign user's **own** session stays accepted without gaining the other user's identity.
- Workflow verifies local Auth health, runs end-to-end assertions and removes the GoTrue container. The PostgreSQL service and fixture DB are disposed with the ephemeral runner.

CI printed only nonsecret acceptance signals:

```text
LOCAL_GOTRUE_HEALTH_VERIFIED
CP_WS_02D_B3_LOCAL_GOTRUE_ACCEPTANCE_PASS auth=REAL_LOCAL_GOTRUE signed_jwt=YES independent_pg_sessions=YES valid=2 forged_actor=DENIED disabled_profile=DENIED removed_membership=DENIED expired_session=DENIED revoked_session=DENIED foreign_identity_isolated=YES production_requests=0 production_mutations=0 external_email=0
LOCAL_GOTRUE_EPHEMERAL_CLEANUP_COMPLETE
```

The first exploratory CI attempt returned 500 on signup because the disposable role's PostgreSQL schema search path was not aligned with GoTrue's `auth` namespace. This was corrected **only in the isolated workflow**. A subsequent test reached the final assertion and exposed an overstrict call-count expectation; the assertion was replaced with explicit independent denial evidence. Run #3 completed successfully. No production remediation was performed.

## Live readiness and open security boundaries

Read-only production inspection during the checkpoint showed:

- **2 existing workspaces, 40 active memberships.**
- `private.ws02d_invitations`, `private.ws02d_delivery_receipts`, the private WS02D issuer, and the workspace B4 selection RPC are **absent**.
- Workspace creation/selection flags remain disabled.
- `has_module_access(text,uuid)` is authenticated-callable, not anon-callable. Its optional `p_user_id` allows a caller to request another principal's entitlement result unless separately constrained; this **preexisting cross-principal inspection surface requires authorization review**. The staged signed-read adapter does **not** provide `p_user_id` and only reads its signed actor.

**Not proven:** A genuine signed session in the deployed GitHub Pages Security page; real HTTPS trusted backend or Supabase Edge deployment; caller-scoped PostgREST/RLS execution against actual live roles; real WS02D authorization-denied production writes; invitation provider, webhook, recipient token lifecycle and delivery; B4 joined-workspace switching. Local GoTrue uses loopback HTTP and deliberately omits internet-facing TLS, gateway and Edge Function JWT-verify configuration.

The staging endpoint `server/ws02d-b3-signed-read-staging.mjs`, Auth reader `server/ws02d-gotrue-live-read-adapters.mjs`, and user-scoped RPC bridge remain **default disabled and unmounted**. No production role grants, RLS changes, user invitations or emails are authorized by this test.

## Milestone and next required checkpoint

| Acceptance dimension | Classification |
| --- | --- |
| Real self-hosted GoTrue signed JWT + PostgreSQL active-session acceptance | **VERIFIED — nonproduction 1/1** |
| Synthetic workspace identity and session revocation denial | **VERIFIED — nonproduction** |
| Deployed APSYNTRA user's signed B3 Security-page read report | **PENDING** |
| Approved trusted HTTPS backend and user-scoped PostgREST/RLS integration | **PENDING — nonproduction execution fixture** |
| Production private WS02D issuer, provider delivery, B4 activation | **BLOCKED — separate controlled approvals** |

The original higher-level B3 integration/delivery acceptance ledger stays **5/10 (50%)**. The new real GoTrue acceptance upgrades evidence within the previously counted backend-integration development criterion; it **does not** satisfy the missing genuine deployed-user read, deployed issuer, real provider or B4 criteria.

**Next required gate:** `CP-WS-02D/B3 — Genuine Deployed Signed-User Read Acceptance and Nonproduction User-Scoped RLS/HTTPS Contract`. To collect real signed-user evidence, run **Run B3 signed read preflight** from [APSYNTRA CRM Security](https://wass-psti.github.io/APSYNTRACRM/#/security), then **Copy nonsecret B3 preflight**; never provide a JWT, refresh token, session ID, email, or password. After that evidence is evaluated, extend the disposable GoTrue fixture with an appropriately pinned local PostgREST/HTTPS boundary using synthetic data and explicit deny cases, without changing production privileges or activating email.
