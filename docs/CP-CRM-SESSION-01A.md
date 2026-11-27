# CP-CRM-SESSION-01A — Definitive Auth Recovery and Failure Classification

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

Updated `frontend/session.js` to preserve valid tokens on recoverable provider reads, invalidate only definitive failures, complete expiration on null-session results, preserve the last usable session on malformed responses, and reconcile discarded refresh results with a newer valid session.

Updated `frontend/startup-recovery-policy.js` and `frontend/platform-sync.js` to use the same classifier for bounded startup retry and workspace-context recovery.

Automated acceptance includes classification unit tests, provider lifecycle regression tests, startup/workspace classification tests, isolated Chromium recovery cases, and the existing full frontend suite.

## Scope and execution constraints

- Supabase remains the only automatic token-refresh authority.
- No competing refresh timer or additional polling was introduced.
- No business-record mutation is automatically replayed.
- No database schema, RPC, RLS, role, permission, or membership changes were introduced.
- No new dependency was added.
- No gradient descent, backpropagation, training, retraining, fine-tuning, or model-parameter update path was added or executed.

## Verification status

GitHub Actions and production deployment evidence will be added after the implementation commit completes.
