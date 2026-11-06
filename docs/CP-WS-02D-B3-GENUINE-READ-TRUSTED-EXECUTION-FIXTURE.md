# CP-WS-02D/B3 — Genuine Signed-User Read Acceptance → Approved Trusted Backend Execution Fixture

**Date:** 2026-11-05

**Decision:** `VERIFIED — DISPOSABLE AUTH-SESSION SQL AND TRUSTED PRIVATE ISSUER FIXTURE; GENUINE USER-SIGNED READ, DEPLOYMENT AND DELIVERY PENDING`.

## Scope and execution evidence

This checkpoint continues [B3 Signed Read and Trusted Backend Contract](./CP-WS-02D-B3-SIGNED-READ-TRUSTED-CONTRACT.md), preserving the 30/30 previously verified **isolated** domain-valid-write checks. No production database writes, privileges, user roles, Auth sessions, invitations, provider secrets, storage objects or workspace selections were changed.

[PostgreSQL 17 / Node 22 Workflow #181](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42010423515) completed **SUCCESS**. Its two new dedicated acceptance steps both passed, along with all earlier board, B1/B2, 30-domain, concurrency, backend-adapter and delivery-mock tests:

| Tested contract | Evidence | Classification |
| --- | --- | --- |
| Original signed Security-page B3 read-only preflight | `frontend/workspace-b3-signed-read-preflight.js`; existing frontend unit tests | **IMPLEMENTED/automated verified; genuine B3 user report PENDING** |
| Real PostgreSQL session authority query using synthetic identities | `scripts/ws02d-b3-trusted-backend-fixture.mjs` | **VERIFIED — disposable** |
| Mock GoTrue response composed with actual PostgreSQL prepared queries | same script and `server/ws02d-gotrue-live-read-adapters.mjs` | **VERIFIED — mock Auth + real PG only** |
| No-login trusted role calling the private issuer | `sql/tests/cp-ws02d-b3-trusted-inviter-no-send-disposable.sql` | **VERIFIED — disposable** |
| Genuine signed GoTrue JWT from the user, through an approved trusted service | No signed user report, no accessible connected browser session/backend | **PENDING/BLOCKED** |
| Production private issuer/role-ceiling deployment and real provider delivery | Private WS02D schema and issuance absent; no WS02D Edge Function | **BLOCKED** |

### 1. Actual database execution of the session-authentication contract

`scripts/ws02d-b3-trusted-backend-fixture.mjs` is guarded by **all** of the following: `CI=true`, PostgreSQL 17, `PGDATABASE=workspace_disposable`, `PGHOST=127.0.0.1` and `PGUSER=postgres`.

The Node script imports **the exact unchanged** `WS02D_ACTIVE_SESSION_SQL` from the backend module. It invokes it via PostgreSQL **server-side parameter binding**, both inside a temporary test function and through `PREPARE/EXECUTE` from independent `psql` connections.

It verifies valid signed **synthetic** sessions; missing session; actor/session mismatch; expired, deleted or revoked session; banned or deleted GoTrue user; inactive profile; and lack of active workspace membership. A foreign workspace user's **own** active session remains valid, but cannot masquerade as another actor. Workspace authorization is separately enforced by the private issuer (below); the session reader is not itself a grant for the requested workspace.

The script also composes the server GoTrue identity reader with actual PostgreSQL reads. Its `fetchImpl` returns an **explicitly mocked** Auth response, and the JWT is **synthetic and not cryptographically signed**. It tests the integration boundary, not live GoTrue network verification. The test-owned columns, session mutations and local record modifications are rolled back or removed and cleanliness checked.

### 2. Restricted no-login backend issuer contract

`sql/tests/cp-ws02d-b3-trusted-inviter-no-send-disposable.sql` runs only on `workspace_disposable`. It transactionally creates a **NOLOGIN, NOINHERIT, non-BYPASSRLS** role. Only this local fixture role receives `USAGE` of `private` and `EXECUTE` for `private.ws02d_issue(uuid,text,text,uuid)` while **`anon` and `authenticated` continue to lack EXECUTE**. It does not have direct SELECT access to `private.ws02d_invitations` or any delivery credentials.

The tests verify that:

- Issuance remains **denied by default**, even to this trusted backend test role.
- Enabling the invitation flag *inside the rollback-only fixture* allows issuance **only** for an active, signed workspace owner with a valid session and authoritative workspace.
- Idempotent request replay **never returns a second bearer token**; one invitation and one issuance audit event are recorded.
- Nonowner, foreign-workspace actor and expired session are denied; denial writes no new records.
- All temporary `GRANT`s, the NOLOGIN test role, invitation rows, event rows, flag changes and session expiry are **fully rolled back**.

No real provider is called and **no token, link, email, JWT or sensitive identifier appears in the acceptance output**. The fixture is **not** a production role or deployment pattern approved for live rollout by itself. If deployment is later approved, a separately reviewed minimal trusted backend identity and transactional caller-bound execution mechanism will be required.

### 3. Production read-only integrity and separate blockers

Read-only inventory after the fixture completed:

- `private.ws02d_invitations`, delivery receipts, and private issuer are still **absent**.
- B3 creation and B4 workspace-selection activation flags remain **disabled**; B4 RPC is absent.
- Two production workspaces and 40 active workspace memberships were observed. No production data migration or permission change was applied.
- Existing Supabase Edge Function inventory has no `ws02d-invite` function.
- The signed user's Security-page B3 preflight was **not** executed in this assistant session: the browser connector reported that it requires the originating connected browser context. An aggregate Auth-session inventory or prior B2 user report **cannot** substitute for the genuine B3 result.

## Follow-on signed read staging integration — 2026-11-06

[Signed read staging evidence](./CP-WS-02D-B3-REAL-AUTH-TRUSTED-READ-STAGING.md) and [CI #191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42135755289) **PASS**. A default-disabled HTTP GET boundary now composes the existing GoTrue + PostgreSQL active-session adapter with user-JWT scoped `wm_auth_access_context` and `has_module_access` reads, rechecks the actor after 12 predicates, and emits only sanitized checks. This is **mocked Auth/PostgREST integration, not a genuine browser signature, deployed Edge Function or active production issuer**. Live metadata review also identified `has_module_access`'s optional `p_user_id` for separate entitlement privacy review. B3 overarching 5/10 readiness remains unchanged pending real signed evidence and approved staging deployment.

## Gate accounting and decision

The existing **10-criterion B3 integration/delivery readiness ledger remains 5/10 (50%)**. This checkpoint strengthens one of the already-counted backend-contract criteria; it does **not** supply the still-missing genuine signed user test, real deployed issuer, production write denial, provider acceptance or workspace-selection criteria. The two **new disposable execution fixtures are 2/2 PASS**, but do not alter that top-level denominator.

**Next required checkpoint:** `CP-WS-02D/B3 — Genuine Signed-User B3 Read Report → Real Auth/Trusted Backend Staging Acceptance`. The authorized signed user should use [APSYNTRA CRM Security](https://wass-psti.github.io/APSYNTRACRM/#/security): **Run B3 signed read preflight** → **Copy nonsecret B3 preflight**. Supply **only** the sanitized JSON report; never provide JWTs, Auth session IDs, emails, passwords or raw developer-console data.

After genuine read acceptance, evaluate an independently approved staging/backend environment with actual JWT signature verification, fresh Auth-session and recipient-role checks, issuer and receipt transaction isolation, one-time token lifecycle, signed provider webhooks, B4 workspace selection, revocation and rollback. Do **not** enable production invitations, create new projects, or change live Auth/data/roles to manufacture acceptance evidence.
