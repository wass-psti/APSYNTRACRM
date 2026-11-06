# CP-BOARD-COL-DELETE / Phase B — Foreign-workspace and controlled session-denial protocol

**Baseline:** 2026-11-06. **Execution:** Read-only prerequisite inspection VERIFIED; genuine foreign-workspace, revoked-session, and expired-session acceptance **NOT YET CERTIFIED**.

## Safety boundary

- This protocol is an acceptance procedure, **not** authorization to create identities, alter production workspace memberships, change roles, revoke sessions, rotate credentials, activate recoverable deletion, or remove any data. Each such action requires a separate scoped approval and may require a dedicated nonproduction acceptance environment.
- Reuse the existing **WatchdogWorkspace Supabase project** only; do not create a new Supabase project. Do not touch the Contacts / `Status I` column.
- QA board: `8491b933-8aa7-4b10-816c-46b6758531f3`; QA workspace: `00000000-0000-4000-8000-000000000001`. Existing B5 recovery activation must remain **FALSE/FALSE** and private QA scope **empty**.
- Never collect, paste, persist, log, or export raw JWTs, refresh tokens, credentials, session IDs, personally identifying details, or archived private recovery cell contents as acceptance evidence. No background polling, scheduled jobs, or telemetry.

## Verified prerequisites

- Previously accepted genuine signed manager `SIGNED_MANAGER` denial: **PASS** (distinct user-submitted sanitized report).
- Previously accepted genuine signed HR `SIGNED_NONMEMBER`, `managerBoundary:PASS`, `nonmemberRead:PASS`: **PASS** (distinct user-submitted sanitized report).
- `sql/tests/cp-board-col-delete-phase-b-foreign-session-prerequisite.sql` checks live QA/default-deny state, workspace membership aggregate, original source fingerprints of the signed-session, recovery-index, board-access, and board-reader functions, restored QA values, and preservation of Contacts cells. It **never** certifies a signed session.
- At last executed inspection: two workspace records, one additional workspace record, **zero active foreign-workspace profiles**, and 36 eligible same-workspace low-privilege profiles. This is a dependency blocker, not a failed security denial.
- The backend `private.wm_board_config_session_active()` function requires a valid `auth.uid()`, a properly formed JWT `session_id`, and a matching row in `auth.sessions` whose `not_after` (if set) is in the future. A PostgreSQL source fingerprint check establishes the checked implementation is unchanged, **not** that a revoked/expired real session was exercised.
- Per the current Supabase Auth session documentation, an access JWT and a refresh token have different lifetimes and revocation behavior. In particular, a successful logout or invalid refresh token alone is **not** automatically evidence that an already-issued JWT failed server-side authorization.

## Case F — genuine foreign-workspace denial

**Prerequisite:** A legitimately authorized user with an existing real GoTrue account and an active membership in a *different* workspace must be available through normal identity and workspace administration. It is not currently available. **Do not provision or move a user simply to produce a PASS unless separately approved.**

When the prerequisite is met, the actual user must sign in through the ordinary CRM login. Run **Security → Verify signed recovery denial**. A case can be accepted only with a freshly produced sanitized report containing:

- `status:PASS`, `caseType:SIGNED_FOREIGN_WORKSPACE`, `managerBoundary:PASS`, `nonmemberRead:PASS`, `foreignWorkspace:PASS`, `writeAttempts:0`, `activationChanged:false`.
- `acceptanceBoundary:SIGNED_FOREIGN_WORKSPACE_QA_READ_AND_RECOVERY_DENIAL`.
- Genuine `auth.getVerifiedUser()` and `api.context()` before and after; the authenticated workspace differs from the immutable QA workspace. The backend denies both `work_board_access(...,'manage')` and `work_board_access(...,'view')`; `wm_get_board` and the recovery index deny access.
- Separate read-only database state confirmation after the test. A `SIGNED_NONMEMBER` in the *same* workspace is insufficient.

**Current classification:** `BLOCKED_NO_GENUINE_ACTIVE_FOREIGN_WORKSPACE_IDENTITY`.

## Case R — controlled revoked-session denial

**Prerequisite:** Separately approved controlled session-revocation scenario using only an eligible disposable *nonproduction session* whose owner and impact are understood. This protocol itself performs no revocation or logout and does not ask for any user’s password or token. Never revoke a real employee's normal production session for QA.

Required evidence, only if separately authorized:

- Before revocation, verify the session is genuinely active through GoTrue and the backend; capture only redacted observations and a nonsecret correlation tag, not the JWT or session ID.
- After the authorized revocation event, exercise the **same originally issued access JWT** from an isolated, ephemeral in-memory test context using a *direct read-only* recovery-index request. Do **not** let `AuthClient.authorized()` silently refresh the JWT or retry unauthorized requests; that would test a *new* session rather than the revoked one. Never export the token.
- Require gateway rejection (e.g. 401) **or** a server-side `42501` `COL_RECOVERY_LIST_AUTHORIZATION_DENIED` from `private.wm_board_config_session_active()`. Treat `COL_RECOVERY_LIST_NOT_ACTIVATED` alone as an active-session B5 default-off denial, **not** revoked-session evidence.
- Verify the original session truly became invalid according to the provider/session contract. A refresh-token revocation without server-side access-token invalidation is inconclusive until expiration.
- Confirm no recovery writes, and B5 QA/Contacts preservation again after the test.

**Current classification:** `PENDING_CONTROLLED_GENUINE_REVOKED_SESSION`. No session revoked during this checkpoint.

## Case E — controlled expired-session denial

**Prerequisite:** An existing authorized nonproduction session naturally reaches its actual JWT expiration in a controlled test. Neither the system clock nor token claims may be falsified to assert genuine expiration.

Required evidence, only if a safely controlled eligible session is available:

- Record a redacted, **nonsecret** statement that the original access JWT was issued and its actual expiration elapsed; no raw token, session ID or claims are logged.
- Submit a direct **read-only** recovery-index request with the **same expired token** without automatic refresh, token renewal or `authorized()` retry. The gateway should reject the expired JWT (typically HTTP 401). Do not treat a successful refreshed session or B5 default-off `42501` as expired-session proof.
- Separately distinguish a session lifetime/`auth.sessions.not_after` expiry from JWT `exp`: test and label only the mechanism actually exercised.
- Confirm no recovery writes and repeat the canonical B5 preservation verifier.

**Current classification:** `PENDING_CONTROLLED_GENUINE_EXPIRED_SESSION`.

## Post-test integrity and certificate boundaries

Re-run **`sql/tests/cp-board-col-delete-b5-final-readonly-acceptance.sql`** after each accepted session case; require `B5_DEACTIVATION_AND_FINAL_PRESERVATION_VERIFIED`. If baseline drift, unexpected access, or uncertain network outcomes appear, stop and preserve logs/records without retrying mutations.

**Evidence classification:** Under the five-category denial acceptance inventory, signed manager **PASS**, signed HR nonmember/nonmanager **PASS**, foreign workspace **BLOCKED PREREQUISITE**, revoked session **PENDING**, expired session **PENDING**. In-memory unit tests, SQL source audits, no-JWT role simulations and membership counts do not convert pending genuine-session categories into verified PASS.
