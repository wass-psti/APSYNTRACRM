# CP-CRM-WS02D-OTP-ACCEPTANCE-03

## Live staging prerequisites (2026-11-21)

Staging Supabase project `jeqwjlxubntsddeauvqa` still has 2 confirmed GoTrue users, 6 active Auth sessions, 2 workspaces and 2 memberships. Private invitation SQL flag remains disabled. Invitations and deliveries are both zero. Staging Edge `ws02d-invite` v7, `ws02d-manage` v5 and `ws02d-accept` v6 are deployed with JWT gateway verification.

A temporary-directory, read-only `supabase config pull` confirmed the staging Auth Site URL and allowlist correctly include `https://wass-psti.github.io/APSYNTRACRM/frontend/ws02d-staging-signin.html`, with `auth.email.otp_length=8`, `otp_expiry=3600`, and `max_frequency=1m0s`. An obsolete Work Management URL is still in the staging allowlist; its presence does not prove use. The hosted email-template **body** was not returned by the CLI; it is not proven that `{{ .Token }}` replaced the magic-link template. No authenticated management API for reading the hosted template or accessing the two business email inboxes was available.

## Scoped implementation

Updated the staging-only sign-in HTML to enforce exactly eight numeric characters at the verification form, consistent with live Auth configuration. The existing `POST /auth/v1/verify` with `type:'email'` and `create_user:false` request remain unchanged. Added a focused regression verifying that six-digit inputs cannot be submitted and that eight-digit verification is properly transmitted. No production code or session/password behavior changed.

## Real-world acceptance gates

1. Operator verifies the staging **Magic Link** email template displays `{{ .Token }}` and not `{{ .ConfirmationURL }}`. Use staging Dashboard Authentication → Email Templates → Magic Link.
2. Each account holder requests **one** fresh code from the staging test page. Confirm the email actually contains an eight-digit numeric code, not a link.
3. Each enters the received code only in their own browser session, observes authenticated confirmation, and verifies the GoTrue session. Do not paste codes, access/refresh tokens, or sign-in URLs into chat.
4. Verify an invalid code and an actually expired code are denied in controlled testing. UI contract simulations alone do not certify live denial. Respect one-minute provider send interval; do not bypass rate limits.
5. After genuine signed OTP and inbox delivery evidence, verify invitation sender readiness. Activate isolated staging SQL/Edge gates via a controlled change, send one invitation to the already verified recipient, confirm SiteGround accepted it and the recipient inbox received it; then accept under the recipient session and read back persistent membership.
6. Production stays unchanged until end-to-end staging acceptance.

## Outcome

**VERIFIED:** GoTrue user/session/workspace readback, staging Auth URL and eight-digit settings, staging-only frontend contracts and published test page before change.

**IMPLEMENTED:** Eight-digit input enforcement (source changes).

**PENDING:** Confirmed numeric email delivery, genuine OTP verification and invalid/expired responses, staging invitation gate activation and persistent membership acceptance. No production cutover or role/permission changes.
