# CP-BOARD-COL01 — Genuine HTTPS signed-session activation gate

**Classification: STAGED / NO PRODUCTION DDL.** This checkpoint does not represent live activation or any executed authenticated acceptance without valid designated test-account credentials and genuine HTTPS evidence.

## Verified requirement and why earlier tests were insufficient
The original `work_board_access` relies on a valid signed JWT and live board membership, but does not check the JWT's `session_id` against `auth.sessions`. Supabase documents that a revoked session's **access JWT remains valid until `exp`**, even when refresh tokens are revoked. The previous disposable SQL tests changed `request.jwt.claim.sub`, not genuine GoTrue tokens; they cannot certify real logout/expiry enforcement. Sources: [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions) and [Supabase signout](https://supabase.com/docs/guides/auth/signout).

## Controlled remedy staged in SQL, not applied live
The candidate creates `wm_col01_session_active()`, a `SECURITY DEFINER` helper with an empty search path. It validates the signed `auth.jwt().session_id` as a UUID, checks the session's existence in private `auth.sessions`, ties it to `auth.uid()`, and denies expired `not_after` sessions. All five sensitive CP-BOARD-COL01 RPCs (board membership writer, invitation directory, item updates reader, item files reader, event cursor reader) now use it **in addition to** existing `work_board_access`. The helper has authenticated-only EXECUTE; anon and PUBLIC are denied. Database role/Storage policies are untouched.

Other legacy Work Management RPCs and `work_board_access` itself still do not enforce immediate GoTrue logout. Broader hardening would require a separately reviewed architecture change; the CP-BOARD-COL01 candidate must not be advertised as globally fixing all outstanding JWTs.

## Real HTTPS acceptance runner
`node scripts/cp-board-col01-signed-http.mjs` conducts protocol-level checks without writing board records or memberships. It requires an approved origin, publishable key, **two dedicated** password-auth test accounts, one known member board and a known foreign-workspace board.

Set these values through a private environment/secret manager — **never commit, paste in chat, echo in logs, or save** passwords or bearer tokens:

- `COL01_PROJECT_REF`, `COL01_SUPABASE_URL`, `COL01_PUBLISHABLE_KEY`
- `COL01_WORKSPACE_ID`, `COL01_BOARD_ID`, `COL01_FOREIGN_BOARD_ID`
- `COL01_ADMIN_EMAIL`, `COL01_ADMIN_PASSWORD`, `COL01_MEMBER_EMAIL`, `COL01_MEMBER_PASSWORD`
- `COL01_PRODUCTION_READ_ONLY=ACKNOWLEDGED` is required to read from the production reference.
- To verify **GoTrue logout revocation**, set `COL01_REVOKE_DISPOSABLE_SESSION=YES` and `COL01_TEST_ACCOUNTS_DISPOSABLE=YES`. The runner logs into the designated test account, verifies the new COL01 event-reader RPC succeeds, logs out **only this newly issued session**, then verifies the same bearer is denied. The runner always closes its other newly issued sessions; do not use legitimate employee sessions.
- To verify **real token expiry**, supply `COL01_NEAR_EXPIRY_ACCESS_TOKEN` from the same dedicated member account with 2–45 seconds remaining. The runner verifies the token against GoTrue **before it expires** and against the restricted RPC, waits until just after expiry, then verifies both deny it. A fabricated or already-expired JWT alone cannot establish token lineage.

The runner emits only named PASS/FAIL/PENDING results, never tokens, email addresses, passwords or user IDs. Tests with mocked HTTP transport validate the harness logic, **not** genuine cloud authorization. A `VERIFIED` runner result is accepted only when all six checks are PASS against genuine HTTPS.

## Signed acceptance invariants
- Bootstrap/authorized administrator has `work_board_access(...,'manage') = true`.
- A distinct nonadministrator has `view = true` and `manage = false` on the test board.
- Both accounts are denied on the foreign-workspace board.
- The manager-only workspace invitation directory must not disclose cross-workspace users.
- Signout revokes the explicitly COL01-protected read path despite an otherwise unexpired access JWT.
- Expired signed JWTs are denied by GoTrue and PostgREST.
- Production membership/role changes never occur in the runner.
- Authorized RPC calls and Storage actions continue to use existing signed identity and data isolation.

## Production release hold
No actual nonproduction deployment of the new functions or signed cloud test credentials are available to this Chat run. The connected Chat browser is not controllable in this session; the browser connector returned an originating-context error. Therefore: no test was executed with real bearer credentials and **production authorization DDL is not permitted to activate yet**. Passing CI and schema preflight do not substitute for genuine HTTPS acceptance.

The prior guarded rollback restores the original writer and now also drops the additive session-check helper after the four additive RPCs. The disposable PostgreSQL suite simulates a removed session row while JWT identity claims remain present and checks COL01 endpoints reject that actor.

After genuine nonproduction signed tests, review the changed `SECURITY DEFINER` function, `auth.sessions` schema and project JWT signing configuration, plus concurrent invitation/revocation behavior. Capture security-review signoff and separately approved production permission activation, run the SELECT-only preflight again, then execute transactional SQL and verify post-deployment access and rollback.
