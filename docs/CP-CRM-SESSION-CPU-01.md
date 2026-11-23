# CP-CRM-SESSION-CPU-01 — Intelligent Session Continuity and CPU Optimization

## Status

Implementation is complete locally and focused unit/browser acceptance passes. Production deployment and post-deployment production CPU comparison are not claimed.

## Production discovery

Supabase Auth logs for the 24 hours preceding implementation showed:

- 6,182 successful /user requests.
- 130 successful /token refresh requests.
- 34 /user responses with HTTP 403.
- 10 /token responses with HTTP 400.
- Three refresh_token_not_found errors among the observed refresh failures.

These are project-wide totals and are not attributed to a particular user or browser.

The production Auth session settings were inspected without modification. The project had no configured single-session limit, time-box expiration, or inactivity timeout. Access tokens were configured for 3,600 seconds and the refresh-token reuse interval was 10 seconds.

The client implementation had three measurable inefficiencies:

1. AuthClient.getVerifiedUser() deduplicated concurrent calls but did not reuse a completed server verification.
2. Provider-backed AuthClient.token() called provider.getSession() for every token read, even when the in-memory access token was comfortably within its validity period.
3. FuelTrans verifiedUser() called currentSession(), which already obtained a verified user, and then made another /auth/v1/user request.

## Implementation

### Verified identity cache

- Cache a server-verified user for 30 seconds.
- Key the entry by the exact user ID and access token.
- Coalesce concurrent verification requests.
- Invalidate the cache on provider auth events, token changes, session restoration, session replacement, and sign-out.
- Do not cache failed verification responses.
- Support getVerifiedUser({ fresh: true }) for callers that require a new Auth server verification.
- Prevent an older in-flight verification from overwriting a newer session or user event.

### Provider session reads

- Reuse the current in-memory provider session while its access token has more than 90 seconds remaining.
- Near the provider's 90-second expiry margin, reconcile with GoTrueClient.getSession() rather than implementing a competing refresh algorithm.
- Coalesce concurrent provider session reads.
- Bound repeated near-expiry recovery reads to the provider's 30-second refresh cadence while the cached access token remains valid.
- Preserve a still-valid in-memory access token if a recoverable provider/storage read fails.
- Prefer a newer BroadcastChannel auth event over an older in-flight storage snapshot.

### 401 recovery

- On the first 401, read the latest provider session.
- Reuse a different, still-valid access token if another tab already rotated the session.
- Otherwise use the existing deduplicated refresh path.
- Retry the original request at most once, preserving existing request semantics.

### FuelTrans

- Return the user already verified by the host session handshake.
- Remove the duplicate direct /auth/v1/user request.
- Preserve the existing host lifetime, board, workspace, module, and membership behavior.

### Preserved architecture

- Pinned Supabase Auth SDK remains the session and automatic refresh authority.
- Existing autoRefreshToken: true remains enabled.
- No competing refresh timer, continuous polling, new dependency, database migration, RPC change, or Supabase configuration change was introduced.
- Existing request, workspace, role, and permission behavior remains unchanged.
- No model-training or gradient-descent execution paths or dependencies were introduced.

## Acceptance evidence

### Focused tests

- 30-second provider-backed identity cache and explicit fresh verification.
- 1,000 provider-backed token reads without repeated getSession() calls.
- Expiry-margin session reconciliation.
- BroadcastChannel token update wins over an older in-flight provider read.
- Recoverable provider read failure preserves a still-valid in-memory token.
- Cross-tab 401 recovery reuses a newer token without a second refresh.
- Auth events invalidate cached identity.
- Legacy non-provider identity cache and newer-token 401 recovery.
- FuelTrans host-verified identity is reused without another Auth request.
- Existing session migration, restoration, refresh, sign-out, and storage-failure regression tests.

### Isolated Chromium browser acceptance

The two-tab browser test verifies:

- Cross-window sign-in and sign-out.
- Workspace preference synchronization.
- 100 repeated verified-user reads produce one /user request.
- 1,000 valid token reads produce zero provider getSession() calls.
- Cross-tab refresh-token rotation updates the second tab.
- The rotated token invalidates the previous identity cache exactly once.
- One refresh-token exchange is used for the controlled rotation.
- Browser reload and persistent-profile restart restore the session.

Observed token-read benchmark: 1,000 in-memory reads completed in approximately 0.30 ms in the final isolated Chromium test run. This is a local benchmark, not a production CPU percentage.

## Final local verification

- Full Node test suite after rebasing onto the latest main: 3,475 passed, 0 failed.
- Repository ESLint: PASS.
- Additional ESLint for all other modified JavaScript files: PASS.
- Repository Prettier check: PASS.
- Project syntax check: PASS.
- Production Vite build: PASS.
- Two-tab Chromium session-continuity browser acceptance: PASS.
- Changed-file syntax checks and git diff whitespace validation: PASS.

The Vite build emitted the repository's existing large-chunk advisory (some minified chunks exceed 500 kB); the build completed successfully. No unrelated bundle-splitting changes were included.

## Production measurement boundary

The pre-implementation Auth request totals are recorded above. Production CPU, database/RPC workload, and Auth request totals must be measured again after deployment over a comparable usage window. The controlled browser benchmark does not substitute for production telemetry.

## Deployment

The implementation is developed on cp-crm-session-cpu-01, rebased onto origin/main commit 564181c. Production deployment is not claimed until the normal repository integration, CI, and release process succeeds.
