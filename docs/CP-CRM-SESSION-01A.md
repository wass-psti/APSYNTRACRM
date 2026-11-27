# CP-CRM-SESSION-01A — Definitive Auth Recovery and Failure Classification

## Status

**COMPLETE — implementation, regression suite, isolated Chromium acceptance, GitHub Pages deployment, and production signed-session refresh verified on 2026-11-27.**

Verified implementation commit: `ffb4c4236500aa3b879f715f1bc116814ddca719`.

## Scope

Implement deterministic Supabase Auth failure classification and reliable local session recovery while preserving the existing AuthClient API, Supabase Auth SDK refresh authority, browser persistence, cross-tab synchronization, and workspace-context recovery behavior.

No database migration, Supabase configuration change, role or permission change, workspace membership change, or business workflow change is part of this milestone.

## Confirmed provider behavior

The repository pins `@supabase/auth-js` 2.119.2. Its bundled implementation distinguishes:

- `AuthRetryableFetchError`: recoverable transport failure.
- `AuthSessionMissingError`: missing session, status 400.
- `AuthInvalidTokenResponseError`: malformed token/session response, status 500.
- `AuthRefreshDiscardedError`: refresh discarded because session state changed, status 409.
- `refresh_token_not_found`, `refresh_token_already_used`, and `session_expired`: definitive refresh failures.

HTTP status alone is not sufficient to determine whether a session should be invalidated.

## Implementation

Added `frontend/auth/failure-classification.js` with operation-aware classifications for invalid identity, invalid refresh token, transport failure, service unavailability, rate limiting, timeout, malformed response, storage failure, workspace-context denial, concurrent session change, cancellation, and credential rejection.

Updated `frontend/session.js` to preserve valid tokens on explicitly recoverable provider reads, invalidate only definitive failures, complete expiration on null-session results, preserve the last usable session on malformed responses, reconcile discarded refresh results with a newer valid session, and prevent older restore snapshots from overwriting a newer provider event.

Updated `frontend/startup-recovery-policy.js` and `frontend/platform-sync.js` to use the shared classifier for bounded startup retry and workspace-context recovery. Startup retry honors provider Retry-After guidance and does not stack a second retry when the request layer has already retried.

## Verified acceptance evidence

### GitHub Actions

- Workflow: [APSYNTRA CRM Frontend Validation](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45988497647) — **SUCCESS**.
- Full Node frontend regression: **4,057 / 4,057 PASS**.
- Focused classification, provider lifecycle, and startup recovery tests: included in the full passing suite.
- Existing TradeLink regression tests: **57 / 57 PASS**.
- JavaScript syntax checks and pinned Auth browser-module rebuild: **PASS**.
- CP-CRM-LOAD-01D Chromium navigation acceptance: **PASS**.
- CP-CRM-SESSION-01A isolated Chromium acceptance: **PASS** for transient token preservation, definitive refresh-token invalidation, null-session expiration, and malformed-response preservation.
- Disposable PostgreSQL acceptance jobs and global-search RPC acceptance: **SUCCESS**.
- Live Pages asset comparison against the main commit: **SUCCESS**.

### GitHub Pages deployment

[Pages build and deployment](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45988496864) — **SUCCESS** for the verified implementation commit.

The deployed `frontend/auth/failure-classification.js`, `frontend/session.js`, and `frontend/startup-recovery-policy.js` were read from the production Pages origin and matched the implemented classification and recovery logic.

### Production browser session

A production Chromium browser using the existing signed-in browser profile was refreshed after deployment.

Verified after refresh:

- Route remained `#/time-tracker`.
- The **Secure session** indicator was visible.
- The authenticated top-bar sign-out control was present.
- No sign-in form or login redirect was displayed.
- The deployed failure-classification module was loaded by the page.

The pre-existing read-only Log Details dialog closed as a normal consequence of refreshing the page. No clock-in or clock-out control was clicked or manually submitted during acceptance.

## Scope and execution constraints

- Supabase remains the only automatic token-refresh authority.
- No competing refresh timer or additional polling was introduced.
- No business-record mutation is automatically replayed.
- No database schema, RPC, RLS, role, permission, or membership changes were introduced.
- No Supabase Auth project settings were changed.
- No new dependency was added.
- No gradient descent, backpropagation, training, retraining, fine-tuning, or model-parameter update path was added or executed.

## Final result

All CP-CRM-SESSION-01A implementation and automated acceptance criteria are **VERIFIED**. Production signed-session continuity after refresh is **VERIFIED**. No further implementation milestone is required for this scope.
