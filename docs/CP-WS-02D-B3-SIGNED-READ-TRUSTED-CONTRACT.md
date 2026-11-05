# CP-WS-02D/B3 — Genuine Signed-User Read and Trusted Backend Contract Integration

**Checkpoint date:** 2026-11-05. **Decision:** `STAGED / MOCK-VERIFIED — GENUINE SIGNED USER READ PENDING — PRODUCTION WRITE/DELIVERY BLOCKED`.

This checkpoint follows [CP-WS-02D/B3 production RLS and concurrency readiness](./CP-WS-02D-B3-SIGNED-AUTH-DOMAIN-DELIVERY-READINESS.md) and preserves the **30/30 isolated domain write/denial** baseline.

## Follow-on trusted backend execution fixture — 2026-11-05

[Execution fixture acceptance report](./CP-WS-02D-B3-GENUINE-READ-TRUSTED-EXECUTION-FIXTURE.md) and [CI #181](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42010423515) **SUCCESS** validate the exact active-session SQL on disposable PostgreSQL 17 with real server-side parameters, and a transaction-rolled-back **NOLOGIN** private issuer role with owner-only issuance, idempotent replay, foreign/nonowner and expired-session denials. GoTrue remains **mocked**, browser B3 signed-read acceptance remains **PENDING**, and no production WS02D object, role grant, provider or B4 selector was activated. The original readiness score remains **5/10**, not a new live-signed PASS.

## 1. Signed read acceptance: existing real user path, no fabricated evidence

The deployed GitHub Pages `#/security` route already provides **Run B3 signed read preflight**, wired via `frontend/app.js` to `frontend/workspace-b3-signed-read-preflight.js`. It runs `auth.getVerifiedUser()`, reads authoritative workspace context, calls all **12** `has_module_access` predicates using the signed actor (no user-id override), checks stable session identity, and can copy a **nonsecret** report.

Expected exported contract:

```json
{
  "checkpoint": "CP-WS-02D-B3-SIGNED-READ-PREFLIGHT",
  "status": "PASS",
  "checks": [
    {"name":"signed-identity","status":"PASS"},
    {"name":"authoritative-workspace","status":"PASS"},
    {"name":"module-access-read","status":"PASS"},
    {"name":"stable-signed-context","status":"PASS"}
  ],
  "moduleProbeCount": 12,
  "authorizedModuleCount": 0,
  "domainWritesVerified": 0,
  "providerDeliveriesVerified": 0,
  "writesAttempted": 0,
  "identifiersDisclosed": 0,
  "acceptanceBoundary": "READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE"
}
```

The above is **only a schema example**; `authorizedModuleCount` is dependent on that user and may be any integer from 0 to 12. This is not a reported user result. No genuine B3 signed report was supplied in this checkpoint. The connected browser could not be read from this conversation (requires the originating extension/browser context). **Status: PENDING.** Do not request or export JWTs, browser storage, user IDs, session IDs or emails.

## 2. New trusted Auth and current-session adapters

`server/ws02d-gotrue-live-read-adapters.mjs` is a **server-only, unmounted, default-disabled** implementation with three functions:

- `createGoTrueUserReader`: strictly accepts a configured HTTPS `*.supabase.co` project root, **publishable** (`sb_publishable_...`) key, bounded JWT syntax, and sends a read-only `GET /auth/v1/user` using the JWT with `redirect:'error'`, `cache:'no-store'` and a five-second bounded abort signal. It returns **only** verified user ID and anonymous status. It never forwards email, metadata, signing secrets, refresh tokens or provider response bodies.
- `createLiveSessionAuthority`: runs a **constant parameterized SELECT** against `auth.sessions`, `auth.users`, `public.profiles` and active `public.workspace_members`; checks matching actor/session UUID, session not expired, user not deleted/banned, active profile and active workspace membership; returns strict boolean only. It rejects missing, inaccessible, malformed or revoked session evidence.
- `createTrustedSignedActorReadVerifier`: composes both above adapters through the existing `createGoTrueActorVerifier`, which checks JWT envelope expiry/subject/session and compares with the independently returned Auth user. If either dependency is unavailable, it refuses the caller.

The exact table/column references were confirmed **read-only** against the existing Supabase project. A production query using only an invented all-zero actor/session UUID returned `active=false`, confirming the SQL executes and fails closed for that nonmember. **This does not validate a real user token or entitlement.**

`server/tests/ws02d-gotrue-live-read-adapters.test.mjs` exercises disabled defaults, allowed URL and key framing, untrusted host/secret key denial, mocked Auth response redaction, expired/revoked/unavailable-session denial, fixed SQL and parameter order, and composed Auth + database authorization. Its dependencies are **mocked**; there is no real provider call, JWT, connected database driver, Edge Function, or credential in CI.

**Boundary:** The live session reader is a preflight, not final issuance authorization. Even when independently authenticated, a future private issuer must recheck signed `auth.uid()`, `session_id`, authorized workspace, membership, owner/delegation, role ceiling, request idempotency and rate limits **inside the same authoritative DB transaction**. A service-role or browser-side claim is not a substitute. DB credentials to read `auth.sessions` must be confined to an approved trusted backend with least privilege; no such production connection was set up.

## 3. Current invariants and restrictions

- **Live domain source:** [24-function original-source preflight](../sql/tests/cp-ws02d-b3-24-live-original-preflight.sql) previously showed 24/24 unchanged and private WS02D invitation functionality absent; no migration or deployment is included here.
- **Session read only:** The adapter executes `SELECT` only. Production SQL validation used all-zero test UUIDs, not real sessions, and did not enumerate private profile records.
- **Invitation sends:** Both `WS02D_GOTRUE_ACTOR_VERIFIER_ENABLED` and `WS02D_LIVE_READ_ADAPTERS_ENABLED` remain `false`; `WS02D_INVITE_HTTP_ENABLED=false` and `WS02D_TRUSTED_DELIVERY_ENABLED=false`. Existing GitHub Pages `WS02_INVITATIONS_ENABLED=false` remains unchanged.
- **No production privilege changes:** No modification to `auth.sessions`, roles, grants, RLS policies, production workspace membership or GoTrue project settings; no email/provider configuration, backend deployment or installation of the private issuer.
- **Workspace selection:** CP-WS-01C/B4 remains absent/disabled. Signed invited users cannot be assumed to switch workspaces immediately.

## 4. Acceptance and next required actions

| Criterion | Status |
| --- | --- |
| Existing live signed read preflight available and sanitized | **VERIFIED — code/automated tests** |
| Genuine user signed-read report from the deployed Security page | **PENDING** |
| Backend GoTrue user read and active-session SQL composition | **IMPLEMENTED — mock-tested, not deployed** |
| Production session SQL schema/syntax without sensitive data | **VERIFIED — read-only** |
| Genuine signed-user domain write or denial against activated WS02D ceiling | **BLOCKED — ceiling not installed** |
| Trusted backend issuer, audited delivery and webhook integration | **BLOCKED — not deployed/approved** |
| B4 invited workspace active-selection acceptance | **BLOCKED — separately gated** |

The **original ten-criterion production-readiness accounting remains 5/10 (50%)**, not 6/10: the new adapter strengthens previously mock-verified Auth integration, but does not satisfy the missing *genuine signed* or *deployed backend* criteria.

**Next required checkpoint:** `CP-WS-02D/B3 — Genuine Signed-User B3 Read Acceptance → Approved Trusted Backend Auth/Session Execution Fixture`. Run the signed Security-page preflight and preserve **only** its sanitized report; separately establish a nonproduction approved trusted backend connection and test real user JWT verification, session revocation, workspace role ceiling, private issuance, receipt audit and B4 joining/selection without changing production users or roles. Do not enable email delivery before provider/sender-domain review and separate authorization.
