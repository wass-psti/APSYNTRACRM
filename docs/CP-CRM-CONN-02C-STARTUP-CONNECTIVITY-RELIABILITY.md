# CP-CRM-CONN-02C — Startup and Connectivity Reliability

**Date:** 2026-11-19
**Status:** IMPLEMENTED — local unit, browser and build verification PASS; PR #558 checks and deployed acceptance pending
**Repository:** wass-psti/APSYNTRACRM
**Base commit:** 2e45559 (merge of PR #557, CP-CRM-CONN-02B)
**Supabase project:** jtlusodorfnyzgyuewkz

## Objective

Resolve startup instability without changing the existing authorization model. Attribute CORS preflight latency, preserve safe request deduplication, recover from transient startup failures, and keep normal sign-in usable when browser storage is unavailable.

## Findings and root causes

### 1. CORS preflight amplification

AuthClient.call() originally forced cache: 'no-store' for every request. Chromium consequently issued a new OPTIONS preflight for repeated identical REST RPC POSTs even though Supabase returned Access-Control-Max-Age: 3600.

CP-CRM-CONN-02B was merged in PR #557 before this milestone. It uses the browser's default fetch cache mode only for POST requests explicitly classified as read-only REST RPCs. CP02C tightened the internal handoff after full regression exposed that a caller-supplied requestKind: 'read' hint alone was insufficient: DomainApi now passes a separate eligibility flag only when the existing BOARD_READ_RPC allowlist recognizes the RPC, and AuthClient requires that flag. Unreviewed RPCs, authenticated GETs, token exchanges, mutations, and non-RPC requests remain no-store. The application does not cache completed RPC results and no second RPC allowlist was created.

The disposable Chromium acceptance compares both modes: two identical read-only RPC POSTs cause two OPTIONS requests with no-store, but only one OPTIONS request with default; both POSTs still reach the API. The test uses an invalid synthetic JWT and receives 401 before RPC execution.

### 2. Storage failures could interrupt sign-in or cleanup

AuthClient.save() previously allowed sessionStorage.setItem() exceptions to escape after the provider had issued a valid token. That could make the login flow report failure even though an in-memory session had already been created. clear() also allowed a storage removal exception to escape after clearing memory.

Session storage is now treated as persistence rather than the identity authority:

- A successful provider sign-in remains usable in the current tab when storage writes fail.
- In-memory sign-out and token clearing complete even when storage removal fails.
- If storage reads fail but this AuthClient already holds a session, the session is re-verified with the provider.
- If storage is unavailable and no in-memory session exists, startup returns to the normal sign-in screen; it does not fabricate or restore an identity.

A browser reload may require the user to sign in again when the browser cannot persist the session. No local token is accepted as proof of identity without the existing provider verification.

### 3. Request deduplication and startup single-flight

The following existing single-flight mechanisms were inspected and regression-tested:

- AuthClient.getVerifiedUser() coalesces overlapping identity verification for the same user and token.
- AuthClient.refresh() shares one refresh-token exchange.
- DomainApi.context() and DomainApi.boards() coalesce identical overlapping startup reads.
- DomainApi.rpc() coalesces only allowlisted read-only RPCs; settled results are not reused.
- Writes are not deduplicated or automatically replayed.
- PlatformSync.connect() shares one authentication attempt and one socket.
- boot() and the startup guard prevent overlapping initialization.

No new completed-result cache or broad request-sharing policy was introduced.

### 4. Transient startup recovery

The existing bounded recovery policy remains in force:

- One retry for a transient startup read failure, with a bounded delay.
- No retry for invalid/revoked sessions, permission denials, conflicts, or semantic errors.
- No automatic write replay.
- A valid in-memory session is preserved across indeterminate network failures.
- The user retry action and browser online event can restart the verified startup flow.
- A failed static entry dependency exposes a reload action; a disposable Chromium test injects one HTTP 503 for a module, invokes the recovery action, and verifies the application reaches the normal sign-in state on the next load.

## Latency attribution

The companion CP-CRM-CONN-02B gateway review observed normal preflight P95 around 5–8 ms, P99 around 3,178 ms, and an extreme maximum of 64,894 ms, concentrated at Cloudflare CEB with a smaller HKG cluster. The managed gateway returned HTTP 200 with Access-Control-Max-Age: 3600 and the expected CORS headers in direct probes.

The merged CP02B change removes avoidable repeated preflights. It does not prove that the external CEB/HKG edge tail has been resolved. Provider-side attribution of the extreme edge-only request IDs remains a separate dependency; no matching Auth, PostgREST, or PostgreSQL log entries were found in the reviewed sample.

## Files changed

- frontend/session.js
- frontend/data.js
- frontend/tests/service-reliability.test.mjs
- frontend/tests/startup-session-storage-recovery.test.mjs
- scripts/cp-crm-conn02c-startup-recovery-acceptance.mjs
- package.json

## Acceptance matrix

- [x] CORS cache classification is limited to read-only REST RPC POSTs (base behavior from merged PR #557).
- [x] Unreviewed RPCs cannot opt into preflight reuse by supplying a generic read hint.
- [x] Authenticated GETs, token operations, writes, unknown calls, and non-RPC requests remain no-store.
- [x] Concurrent identity verification and token refresh are coalesced.
- [x] Identical context and board-list reads are coalesced and returned as isolated values.
- [x] Completed reads are not cached; mutations are not deduplicated.
- [x] Normal sign-in remains functional through the UI with synthetic provider responses when browser storage writes fail; workspace loads.
- [x] Storage read/write/remove failures do not clear a valid in-memory session or prevent in-memory sign-out.
- [x] Transient signed startup failures preserve the session and recover within the existing retry bound.
- [x] Duplicate initialization is prevented by the existing boot/startup guards.
- [x] Static module failure recovery passes in disposable Chromium.
- [x] Signed-session startup recovers after two transient verification failures; repeated online events do not start duplicate boot flows.
- [x] Focused connection/startup regression passes (48/48).
- [x] Full frontend regression passes (2,752/2,752; 0 failures, 0 skipped).
- [x] Disposable Chromium CORS acceptance passes: repeated read-only RPC requests reduce OPTIONS from 2 to 1 while both POST requests reach the API.
- [x] Disposable Chromium startup acceptance passes: one injected entry-module HTTP 503 recovers to the sign-in screen.
- [x] Disposable Chromium signed-session acceptance passes: two transient verification failures recover to AUTHENTICATED; repeated online events do not duplicate startup.
- [x] Disposable Chromium sign-in acceptance passes when sessionStorage writes fail; workspace loads.
- [x] Production build, syntax, lint, and Prettier format checks pass.
- [ ] PR #558 required checks complete and merge.
- [ ] Deployed signed-user acceptance confirms real account login, workspace loading, and board reads.
- [ ] Post-deployment gateway sample confirms reduced OPTIONS-to-read-RPC ratio.
- [ ] Provider-side CEB/HKG extreme tail is attributed or escalated with trace IDs.

## Scope boundaries

No Supabase CORS configuration, database schema, migration, credentials, roles, permissions, workspace policy, or production data were changed. No new Supabase project was created. Existing server-side identity verification and access checks remain authoritative. No telemetry, polling loop, background agent, or automatic mutation replay was added.
