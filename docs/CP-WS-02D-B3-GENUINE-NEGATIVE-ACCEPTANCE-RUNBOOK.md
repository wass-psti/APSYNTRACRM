# CP-WS-02D/B3 — Genuine foreign-workspace, direct table-RLS and revoked-session acceptance

**Scope:** Same existing APSYNTRA CRM GitHub Pages frontend and WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`. The previously submitted signed B3 read succeeded with 12/12 authorized modules. The following are **new, separate denial tests**; a production PASS must be created by running the controls under real existing signed sessions.

## A. Exact runtime prerequisites

The previously deployed Edge function `apsyntra-ws02d-b3-read` remains read-only, `verify_jwt=true`, and user-activated through the already configured `WS02D_B3_EDGE_READ_APPROVED=true`. Do not change runtime secrets, RLS, Auth, roles, members, or domain data for this gate.

The production read-only PostgreSQL catalog check verified **17/17 watched public domain tables RLS-enabled**, zero public domain authenticated or anonymous direct table-write grants and zero writable without RLS. **RLS metadata does not prove a foreign row is unreadable.**

The targeted table `public.order_intake_orders` has authenticated `SELECT` and a real RLS policy requiring `auth.uid()` plus `workspace_id=current_workspace_id(auth.uid())` and the caller's Order Intake module access. Unlike module-access `SECURITY DEFINER` RPCs, the new test performs an ordinary caller-JWT PostgREST table `GET`.

## B. Two genuinely different signed users — one existing foreign row

Open `https://wass-psti.github.io/APSYNTRACRM/#/security` under **existing user A** with legitimate Order Intake access and at least one **existing order** (do not create one for this test).

1. Click **1. Capture existing authorized row** in **B3 · Genuine foreign-workspace table RLS**. It issues one limited `GET /rest/v1/order_intake_orders?select=id,workspace_id&workspace_id=eq.<current>&order=id.asc&limit=1`, using only the current signed JWT and publishable key. A `READY` result means the record truly exists and is visible to A in its authoritative workspace. If no existing row can be found, `INCONCLUSIVE`; stop, do not manufacture data.
2. The row ID, user ID and workspace ID are retained **only in volatile JavaScript module memory**, protected by a **15-minute expiry**. No localStorage, sessionStorage, clipboard, server write or telemetry. Do not reload the tab (a reload deliberately clears the reference).
3. Choose **Prepare current-session revocation test**, then **Confirm: locally sign out and test revoked JWT**. This is an explicit signed-user action and calls the current-session-only `POST /auth/v1/logout?scope=local`, never the default global signout. Other device sessions remain unaffected. It attempts a previously valid B3 read before logout and retries the exact in-memory JWT afterward. The user must sign back in.
4. In the **same tab without refreshing**, sign in as a **different existing legitimate user B** whose authoritative active workspace is **different** from A's. Open Security.
5. Click **2. Test after signing in as foreign-workspace user**. The client requires a fresh GoTrue verified user, genuine `api.context()`, a different signed actor, a different workspace, and a still-valid owner fixture. It then issues **direct PostgREST GET** by the exact existing record ID, using B's own JWT. **Only HTTP 200 plus an empty JSON array** after an owner-positive control qualifies as targeted foreign-row denial. A visible row is **FAIL**, while 403, network error, absence of fixture, same user or same workspace is **INCONCLUSIVE/BLOCKED**.
6. Click **Copy nonsecret targeted-RLS report**, and **Copy nonsecret session-revocation result**; share those two sanitized JSON reports. They contain only status/stage, table name, checked booleans and zero-write/zero-identifier counters. Do **not** share raw JWTs, emails, record IDs, workspace IDs, session IDs, secrets or screenshots of account credentials.

If you have no existing user B belonging to a different workspace, this remains **PENDING**. Do not create or reassign a production user solely to satisfy acceptance.

## C. Exact scope of revoked-session test

For the local-revocation test to return **PASS**:

- A's exact old JWT must have more than 30 seconds of remaining lifetime and first be accepted via the already deployed real B3 signed-HTTPS read path (strict 200 server checkpoint, four checks, 12 modules).
- The current-session-only `/auth/v1/logout?scope=local` must be acknowledged successfully.
- The same previously valid old JWT, retained in memory for one request only, must receive **HTTP 401** from the production B3 Edge route after logout.
- A post-logout 200 is **FAIL**, and transport/CORS errors, 403, missing logout acknowledgement, token near expiration or missing positive control are **INCONCLUSIVE** — never counted as PASS.

This tests the **B3 sensitive endpoint's** session-row invalidation. Supabase documents that ordinary signed JWTs remain cryptographically valid until expiry; sensitive APIs requiring immediate revocation must additionally check the JWT `session_id` against `auth.sessions`. **Do not generalize a B3 401 into all CRM endpoints or any other provider.** See [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions) and [local versus global logout scope](https://supabase.com/docs/guides/auth/signout).

## D. Security invariants

- The acceptance UI calls only existing pinned public HTTPS APIs with the **current** user JWT; never substitutes admin keys, a fake JWT, SQL `SET ROLE`, forged `request.jwt.claims`, `SECURITY DEFINER` results or untrusted workspace metadata.
- The only non-read action is the **user-confirmed, current-session-only logout**; there are no SQL changes, test account creation, domain record writes or provider calls. The regular app Logout behavior remains unchanged outside this special test.
- The owner row reference exists in memory for at most 15 minutes and is destroyed after denial success/failure, explicit discard, session expiry or page reload. Never export the reference to logs or other users.
- A targeted RLS `PASS` proves **one row, one table**, with two real separate actor+workspace contexts. It **does not** certify all 17 watched tables, 45 dependent RPC consumers, cross-actor entitlement privacy, or workspace switching.
- The signed local revocation result is retained only in current SPA memory so user B can copy it later; a page refresh clears it. If the app is reloaded between identities, the procedure must be repeated.
- No periodic checks, background agents, telemetry or monitoring are installed.

## E. Evidence ledger and strict acceptance

| Proof | Current interpretation |
| --- | --- |
| Earlier real signed-user B3 12/12 read | **PASS**, operator-supplied sanitized report |
| All 17 watched public tables have RLS enabled | **VERIFIED — metadata only** |
| Two-principal foreign existing Order Intake row denial | **PENDING genuine operator run** |
| B3 endpoint old JWT denied after acknowledged local logout | **PENDING genuine operator run** |
| Independent RLS on *other* 16 watched tables | **PENDING, outside this one-table proof** |
| Production cross-actor RPC privacy and 45-consumer cutover | **PENDING, separate production approval** |

CI may mark **synthetic contract pass** when mocks meet these rules. Such a result is **not** accepted as production RLS/revocation evidence. Maintain **CP-WS-02D/B3 at 7/10 (70%)** until verified real negative reports; do not silently upgrade the score or claim production readiness.
