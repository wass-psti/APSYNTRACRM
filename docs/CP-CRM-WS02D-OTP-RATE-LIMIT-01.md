# CP-CRM-WS02D-OTP-RATE-LIMIT-01 — Staging OTP Request Cooldown and Provider 429 Recovery

## Finding

The isolated staging invitation helper received GoTrue \`POST /auth/v1/otp\` HTTP 429 responses with \`error_code=over_email_send_rate_limit\` and \`error=429: email rate limit exceeded\`.

Read-only staging logs for 2026-11-21 06:00–08:10 UTC show three rejected OTP endpoint requests for the inviter account at:

- 06:08:13.854 UTC
- 06:08:45.592 UTC
- 06:09:08.182 UTC

The gateway log aggregation also records three HTTP 200 OTP endpoint responses in the same 55-second period. The rejected requests were 23–32 seconds apart. No \`Retry-After\` response header was present. Production had no matching \`/auth/v1/otp\` 429 in the same inspected window. No invitation Edge Function or Resend request was involved in this failure.

## Root cause

The staging helper's OTP button issued a new GoTrue email request on every click. It did not disable both OTP buttons while a request was in flight, impose a cooldown after a successful send, persist a cooldown across refreshes/tabs, or apply a recovery delay after a 429. Repeated requests therefore reached GoTrue before its email-send quota allowed another message.

## Implementation

- Added \`frontend/ws02d-otp-request-control.js\` as a small staging-only request controller.
- Apply a shared 60-second cooldown after a successful OTP email request.
- On HTTP 429, honor a valid \`Retry-After\` header; when the provider omits it, apply progressive local backoff of 60s, 120s, 240s, 480s, then 900s maximum.
- Persist only cooldown timestamps, backoff count, and a short-lived in-flight lock in localStorage. No email, password, OTP, access token, invitation token, or other account data is stored.
- Share cooldown and in-flight state across both account slots and same-origin tabs; release the lock on completion and allow an abandoned lock to expire after 60 seconds.
- Disable both OTP request buttons during an in-flight request or cooldown and display the remaining wait.
- Do not automatically retry any email request. Ambiguous network/408/5xx outcomes receive a one-minute reconciliation cooldown to avoid duplicate sends.
- Keep password sign-in available; it does not send an email. OTP verification and the invitation lifecycle remain unchanged.
- Preserve graceful behavior when browser storage is unavailable; the provider remains the authoritative rate limiter.

## Verification

- Unit coverage includes \`Retry-After\` seconds and HTTP dates, duplicate in-flight prevention, cross-tab lock, lock expiry, persisted cooldown after refresh, progressive 429 backoff, maximum backoff, uncertain outcomes, storage failures, and malformed stored state.
- Page-level coverage confirms the exact staging endpoint, shared account cooldown, persistent 429 handling, no automatic retry, and existing eight-digit OTP verification contract.
- No provider rate-limit configuration was changed. No new email was sent during this implementation. No production data, credentials, roles, or invitation records were changed.

## Acceptance boundary

This change prevents the staging helper from needlessly generating repeated OTP requests from the same browser profile. It does not raise or bypass GoTrue's email quota and cannot coordinate independent devices or browsers. If the provider still returns 429 after the local cooldown, its response remains authoritative and the next cooldown increases. A successful GoTrue response means request acceptance, not guaranteed inbox receipt.
