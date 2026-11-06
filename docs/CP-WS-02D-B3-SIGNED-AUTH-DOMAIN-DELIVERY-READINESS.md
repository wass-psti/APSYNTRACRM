# CP-WS-02D/B3 — Genuine Signed-Session Authorization, Domain Integration, and Trusted Invitation Delivery Readiness

**Checkpoint date:** 2026-11-05.

**Decision:** `PARTIAL — READ-ONLY PRODUCTION BASELINE VERIFIED; DISPOSABLE CONCURRENCY AND MOCK AUTH VERIFIED; GENUINE SIGNED WRITE AND TRUSTED PROVIDER DELIVERY BLOCKED`.

**Scope:** Existing APSYNTRA CRM repository `wass-psti/APSYNTRACRM`, existing Supabase project `jtlusodorfnyzgyuewkz`, GitHub Pages signed frontend. No change to production PostgreSQL, Supabase Auth sessions, roles, grants, workspace memberships, storage or external email. New source is staged only and default-off. No role ceilings or invitations are deployed.

## Follow-on B3 signed-read/trusted Auth contract — 2026-11-05

[Signed-read and trusted contract report](./CP-WS-02D-B3-SIGNED-READ-TRUSTED-CONTRACT.md) records [PG17/Node CI #176](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42007719449) **SUCCESS**. Concrete server-only, default-disabled GoTrue user lookup and strictly parameterized live-session SQL adapters now compose with the existing fail-closed identity verifier. Tests validate allowed `sb_publishable_` key use, exact Supabase HTTPS host, redacted Auth response, bad/expired/mismatched/revoked identities, and disabled defaults. The trusted SELECT was validated on production with invented nonmember UUIDs only; no genuine signed JWT, external provider, private issuer or backend deployment was used. **The original 5/10 development/readiness criteria remain unchanged**, as genuine signed read/production integration remains pending.

## Latest approved-scope trusted execution fixture — 2026-11-05

[New signed-read/trusted execution evidence](./CP-WS-02D-B3-GENUINE-READ-TRUSTED-EXECUTION-FIXTURE.md): [PG17 CI #181](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42010423515) **SUCCESS**. The actual constant backend session SQL was executed using PostgreSQL server-side parameters against synthetic active/expired/revoked/deleted/banned identities, with all records cleaned. A **NOLOGIN** disposable role invoked only the private issuer and verified default-deny, owner-only issuance, replay withholding, foreign, Member and expired denials, audit integrity and complete rollback of role/grants/flags. **No genuine signed browser token, live trusted service, production write or external email** was involved. B3 integration readiness stays **5/10** pending user-supplied sanitized signed-read evidence and separately approved staging/backend activation.

## Latest trusted signed-read staging contract — 2026-11-06

[Staging integration report](./CP-WS-02D-B3-REAL-AUTH-TRUSTED-READ-STAGING.md) and [CI #191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42135755289) show **PASS** for a default-off signed HTTP read boundary, verified actor/session rechecks and twelve user-scoped PostgREST predicates. Network Auth/PostgREST calls were **mocked**; real PostgreSQL and private invitation acceptance remain limited to prior disposable PG17 fixtures. The existing live Security-page report is still **PENDING**, and no WS02D issuer, delivery or B4 selection is deployed. Existing 5/10 B3 gate accounting remains unchanged.

## 1. Evidence verified now

| Area | Evidence | Result |
| --- | --- | --- |
| Prior individual valid/denied domain transactions | [30-path B3 acceptance](./CP-WS-02D-B3-REMAINING-TEN-DOMAIN-VALID-WRITES.md), [PG17 CI #162](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42002817567) | **VERIFIED — disposable 30/30** |
| Genuine parallel database concurrency (not mocked) | [PG17 CI #163](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004388490) running `scripts/ws02d-b3-disposable-concurrency.mjs` | **VERIFIED — two race tests** |
| Strict backend GoTrue verification adapter boundary | [PG17/Node CI #167](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42005082083), `server/ws02d-gotrue-actor-verifier.mjs` and its Node tests | **VERIFIED — mocks only, disabled** |
| Existing trusted HTTP delivery and private ledger | `server/ws02d-invitation-http-boundary.mjs`, `server/ws02d-trusted-delivery.mjs`, `sql/cp-ws02d-b3-delivery-receipt-candidate.sql` | **VERIFIED — mocked/disposable; NOT deployed** |
| Production domain RLS/EXECUTE boundary | `sql/tests/cp-ws02d-b3-live-auth-rls-readonly-inventory.sql` run against live catalog | **VERIFIED — read-only** |
| Production source compatibility | `sql/tests/cp-ws02d-b3-24-live-original-preflight.sql` run against live catalog | **VERIFIED — 24/24 original definitions, zero drift** |
| Actual user-signed browser/domain read evidence | Existing Security-page B3 signed-read preflight, no genuine user-submitted report in this checkpoint | **PENDING** |
| Actual signed-user denied domain writes under new ceilings | WS02D private ceiling SQL not installed in production | **BLOCKED** |
| Trusted endpoint, verified sender and real provider delivery | No WS02D invitation Edge Function/approved provider or sender identity | **BLOCKED** |
| Accepted joined-workspace active-session switch | CP-WS-01C/B4 remains disabled | **BLOCKED** |

### Parallel transaction test details

`scripts/ws02d-b3-disposable-concurrency.mjs` requires `CI=true`, `PGHOST=127.0.0.1`, `PGDATABASE=workspace_disposable`, `PGUSER=postgres` and PG17. It uses independent `psql` connections with signed **synthetic** claims. A coordinator holds the exact advisory asset lock or `FOR UPDATE` FuelTrack state row until **both** competing sessions are observed waiting in `pg_stat_activity`. It then releases them. [Run #163](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004388490) emitted:

```text
WS02D_B3_ASSET_RACE_PASS waiters=2 committed=1 conflict=1
WS02D_B3_FUELTRACK_RACE_PASS waiters=2 committed=1 conflict=1
WS02D_B3_CONCURRENCY_VERIFIED both signed-CAS races serialized correctly
WS02D_B3_DISPOSABLE_CLEANUP_VERIFIED
```

The resulting asset revision and FuelTrack state revision were checked; rejected FuelTrack requests generated no additional activity. Named fixture records were removed. This is meaningful real PostgreSQL race evidence for **two** operations, **not** a full throughput/performance/concurrency assessment of all 30 domains.

### Live RLS and function grants (catalog data only)

`sql/tests/cp-ws02d-b3-live-auth-rls-readonly-inventory.sql` returned `WS02D_B3_LIVE_AUTH_RLS_GRANTS_BOUNDARY_VERIFIED`:

- **17/17** inspected public domain tables have RLS enabled.
- **0** have `anon` table-write grants; **0** have direct `authenticated` table-write grants. No exposed writable tables without RLS.
- **5** of these tables have at least one RLS policy; **12** have no RLS policy and are default-deny. The absence of a policy is not equivalent to a security gap for intentionally private definer-managed tables.
- `wm_admin_set_application_role` and the internal TimeTracker attendance RPC have no direct `authenticated` EXECUTE privilege; `charter_admin_set_role` is authenticated callable but not anonymous callable and preserves its server-side authorization predicate.
- `private.ws02d_*` invitation schema/runtime objects are not installed and B3/B4 creation/switch RPCs are absent.

These findings verify access *configuration*, **not** the correctness of each RLS predicate or the behavior of live `SECURITY DEFINER` RPCs under real signed identities.

The separate original-source preflight again returned `CP_WS_02D_B3_24_LIVE_ORIGINALS_VERIFIED_DEFAULT_OFF`: **24 expected, 24 unchanged, 0 drift**, **2 workspaces**, **40 active memberships**.

### Genuine session readiness (aggregate only)

A read-only query found **18 nonexpired GoTrue session rows** linked to active profiles and current active workspace membership, representing **7 distinct users**. There are **0** users with membership in more than one currently active workspace. These aggregate observations cannot validate an individual signed browser token or perform the required real foreign-workspace negative acceptance.

The live Security-page B3 preflight is already wired in `frontend/app.js` to `runWs02dB3SignedReadPreflight`. Its button tests `auth.getVerifiedUser()`, current backend context, all 12 module-access reads and stability; a copy action exports only a sanitized nonsecret result. A successful **user-triggered** report should be logged separately as **READ-ONLY**, never as domain-write or email acceptance. Browser automation is not accessible from the current chat client; no actual signed user probe was executed here.

## 2. Staged GoTrue Auth bridge (not deployed)

The new `server/ws02d-gotrue-actor-verifier.mjs` exports a **default-disabled** `createGoTrueActorVerifier`. Its injected `getUserForToken` dependency must use a **real** Supabase Auth `getUser(jwt)` call. The verifier checks bounded JWT framing, signed-user `sub`, `session_id`, `role`, expiration and anonymous status; it compares the recovered user ID against the **verified Auth response**, and only accepts an exact positive independent `assertActiveSession({actorId,sessionId})` result. The latter must use the backend's trusted `auth.sessions`/active-profile authority; a user-editable JWT or user_metadata record cannot substitute.

Node mocks verify fail-closed: missing dependencies, malformed or expired JWT claims, anonymous actor, Auth identity mismatch, Auth rejection, revoked/inaccessible session, stable verified actor record and integration with the staged HTTP invitation handler. No JWT, email or bearer invite token is returned to the browser.

**Important:** This adapter itself is not a GoTrue verifier, signing key, Edge Function or private issuer. It depends on independently implemented and reviewed `getUserForToken` and `assertActiveSession` callbacks. An unchecked service-role RPC or an unverified decoded JWT would violate the contract. Existing `server/ws02d-invitation-http-boundary.mjs` remains disabled by default.

Supabase's [current Edge Function authentication guidance](https://supabase.com/docs/guides/functions/auth) recommends a genuine user JWT, platform `verify_jwt=true`, and a user-scoped handler; `supabaseAdmin` bypasses RLS and must not substitute for a user's signed authority.

## 3. Security Advisor inventory — preexisting warnings, no automatic remediation

The live Supabase Security Advisor currently reports these catalog/project warnings. These are **not** newly created by the staged code and do not automatically establish exploitable issues:

| Notice | Count/level | Interpretation |
| --- | --- | --- |
| [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | 77 INFO | Many protected tables intentionally default-deny; assess individually before adding grants or policies |
| [Mutable function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) | 9 WARN | Review path qualification for each function |
| [Anonymous executable SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | 3 WARN | Contract-attestation endpoints: `wm_board_contract_attestation`, `wm_deployment_contract_attestation`, `wm_item_workspace_recovery_attestation`; assess information-disclosure/legacy-client needs before any grant change |
| [Authenticated executable SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | 267 WARN | Review caller checks and security model, not blanket removal of authorized RPCs |
| [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) | 1 WARN | Project Auth policy configuration requires an authorized review |

Any changes to production authentication settings, grants, function security, RLS, role permissions or external providers require separate approval and controlled acceptance. No proposed remediation is silently applied here.

## 4. Trusted invitation delivery activation blockers

No `ws02d-invite` Edge Function is deployed in the existing project. The inspected Edge Function catalog has three other active functions. Resend is a **candidate adapter**, not an approved provider. No verified sender domain, production API key, webhook signing key or live delivery reconciliation is demonstrated.

The following prerequisites remain mandatory:

1. Establish an actual signed-user Edge Function using a verified GoTrue JWT and a fresh `auth.sessions` check; its private issuer must recheck workspace owner/delegation, active membership, role ceiling and bounded rate limits **inside the authoritative transaction**.
2. Keep private invitation issuance, secret-bearing token and provider key behind a trusted server boundary; never grant direct browser EXECUTE to token-returning functions or expose a service-role credential in GitHub Pages.
3. Approve a provider and verified sender domain, validate signed webhook events, bounce/suppression and retry reconciliation. A provider HTTP 200/202 receipt is **not** recipient delivery.
4. Activate a real one-time invitation-acceptance route with recipient-email verification and replay/expiry/revocation tests.
5. Resolve the separately gated CP-WS-01C/B4 signed workspace-selection mechanism. Currently joined members cannot reliably change their authoritative active workspace through the disabled B4 RPC.
6. Verify actual signed owner/ordinary member/Viewer/foreign actor and invited recipient behavior in a safe approved nonproduction environment (or separately approved controlled production fixture), including denied writes, revoked sessions, tenant isolation, audit and rollback.

**Do not** activate the send button, provider adapter, B4 workspace selection or staged production role ceilings based on the passing disposable tests.

## 5. Readiness accounting and next gate

There are **10 acceptance criteria** for this particular signed-integration/delivery checkpoint: previous 30/30 disposable domain acceptance; 2/2 real concurrent DB races; read-only production RLS/grants inventory; 24/24 source integrity; mocked Auth and trusted transport integration; genuine signed user-read preflight; live signed authorized/denied write acceptance; trusted deployed private issuer; real provider delivery with webhooks; and working approved joined-workspace selection.

**Verified 5/10 (50%)** at the development/configuration boundary. **Remaining 5/10 PENDING/BLOCKED** due to genuine signed-user evidence, production authorization not installed, backend/provider prerequisites and B4 dependency. This is **not** a percentage of production readiness, which remains unverified.

**Next required checkpoint:** Continue **CP-WS-02D/B3 — Genuine Signed-User Read Acceptance and Trusted Backend Contract Integration**, without any production role or data mutation. Use the Security page's `Run B3 signed read preflight` and share only its nonsecret exported result; then prepare an approved backend/staging integration plan with genuine GoTrue, RLS, provider, webhook, migration/rollback and B4 identity/selection verification.
