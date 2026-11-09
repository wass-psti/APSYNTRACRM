# CP-WS-02D/D — Trusted Invitation Lifecycle Activation

**Status:** staged server and lifecycle increments implemented; production sending/acceptance **BLOCKED** by absent live grants, provider and signed integration evidence. No production migration or email was executed.

## Baseline and cause

The invitation send UI and typed client were merged under PR #132, but their `WS02D_INVITE_CLIENT_ENABLED=false` flag correctly prevents use. The HTTP issuer and trusted backend actor/session verifiers remain dormant, the private issuance/accept/revoke functions are staged rather than an approved installed production API, the email provider is unconfigured, and not all domain mutation ceilings are signed-verified. The recipient email link currently points to a hash route which has not been activated in the browser.

## This increment

- `server/ws02d-invitation-accept-http-boundary.mjs`: default-off, strict-origin, strict-JSON, bounded-body one-time token acceptance HTTP boundary. Requires an independently verified live GoTrue actor and a trusted recipient-specific SQL adapter. The database must perform its own verified email/token/scope/one-time checks. No bearer tokens, emails or raw provider outputs are returned; unexpected and denied receipts fail closed.
- `server/tests/ws02d-invitation-accept-http-boundary.test.mjs`: origin, method, malformed/oversized tokens, revoked sessions, foreign/expired/replayed denials, safe receipts and no-leak regression coverage.
- `sql/cp-ws02d-d-invitation-decline-candidate.sql`: private verified-email, locked, single-use decline transaction; independently verifies live signed session; default-deny client grants; audited without creating membership.
- `sql/cp-ws02d-d-expiry-maintenance-candidate.sql`: private bounded atomic expiry with `FOR UPDATE SKIP LOCKED` and distinct system lifecycle audit table, separate from actor-initiated action events. No public execution grant and no scheduler activated.
- SQL disposable acceptance tests cover recipient binding, denial, replay, idempotent expiration, no memberships, and rollback. Both staged SQL files require installation only in an isolated disposable test database until separately approved for production.

## Strict activation dependencies

1. **Production verification and change approval:** obtain current live Supabase schema/RPC/permissions inventory, backup and rollback evidence, and explicit production approval for DDL, private function/grant changes and any role/permission modifications. No new project.
2. **Role ceilings:** finish and independently verify all relevant board and application `AND`-integrated role ceilings; do not permit Admin/Viewer issuance while incomplete. Only `member` is staged for send/accept.
3. **Trusted backend deployment:** connect real verified GoTrue `getUser`, session revocation checks, private recipient-bound issuer/accept/revoke/decline calls with signed caller context, durable audit and provider outcome ledger. A service-role impersonation or browser-side SMTP call is not permitted. Configure an approved sender/domain provider and server-side credentials.
4. **Recipient UX:** implement the fragment-token landing route, remove bearer token from browser history and telemetry surfaces, verify signed user email before acceptance, and return a safe success/failure state. Keep disabled until endpoint and strict nonce/replay checks are deployed.
5. **Expiry scheduling and delivery lifecycle:** deploy authorized bounded expiry maintenance with an approved schedule; add resilient resend/reissue and provider reconciliation without exposing or resending a nonrecoverable token. Mock tests are not proof of real email delivery.
6. **Genuine signed acceptance:** use isolated authorized identities to verify valid owner send, nonowner/foreign denial, recipient matching, accepted/declined/revoked/expired/replayed denial, signed session revocation, concurrent acceptance, all audit persistence, refresh and session isolation. No uncontrolled production fixtures.

**Release invariant:** disabled client/server flags remain false until these conditions have evidence. No production data, Auth, roles, memberships, email configuration or RLS were modified by this increment.
