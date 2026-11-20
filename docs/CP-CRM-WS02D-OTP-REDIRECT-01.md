# CP-CRM-WS02D-OTP-REDIRECT-01 — Staging numeric email OTP and redirect resolution

## Verified root cause

The staging-only browser at `frontend/ws02d-staging-signin.html` calls GoTrue `POST /auth/v1/otp` with `create_user:false` and verifies with `POST /auth/v1/verify`, `type:'email'`. The delivered screenshots show the default Supabase Auth email **Your sign-in link**, so the server is emitting a magic-link template, not the expected numeric code. Supabase's OTP endpoint intentionally supports both variants: the **Magic Link** email template determines whether the recipient sees `{{ .ConfirmationURL }}` (link) or `{{ .Token }}` (numeric code). This is not a missing frontend OTP flag.

Previous emailed links navigated to `WatchdogAutomationWorkManagement` instead of `APSYNTRACRM`, consistent with an incorrect staging Auth Site URL/redirect configuration. The page previously omitted the `redirect_to` query parameter, allowing the project Site URL fallback.

Sources: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://supabase.com/docs/guides/auth/auth-email-templates

## Implemented code fix

- The isolated staging frontend now requests GoTrue OTP with an explicit, URL-encoded, allowlisted `redirect_to=https://wass-psti.github.io/APSYNTRACRM/frontend/ws02d-staging-signin.html`.
- It continues to use `create_user:false` and `verifyOtp`-equivalent `type:'email'`, preserving identity/session validation and password sign-in.
- It tells the operator that email delivery acceptance does not mean a numeric code was actually rendered, and identifies exactly which staging template must be configured.
- Clear malformed, invalid, expired, consumed OTP, and provider rate-limit messages. No logging of bearer tokens, magic URLs or codes.
- No changes to production CRM login, registration, password reset, or production Supabase Auth configuration.

## Mandatory staging Auth email-template correction (hosted project setting)

In staging Supabase project `jeqwjlxubntsddeauvqa` only:

1. Authentication → Email Templates → **Magic Link**. Save a numeric-code-only template, e.g.:

```html
<h2>APSYNTRA staging sign-in code</h2>
<p>Enter this one-time code on the staging sign-in page:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this, ignore this message.</p>
```

Do not include `{{ .ConfirmationURL }}`, `{{ .TokenHash }}`, or a clickable sign-in link in this template. This adjustment changes the format of **staging passwordless sign-in emails only**; leave Confirmation, Invite, Recovery, and other templates unchanged.

2. Authentication → URL Configuration: Site URL should point to `https://wass-psti.github.io/APSYNTRACRM/frontend/ws02d-staging-signin.html`. Add that exact URL to the staging redirect allowlist. Do not modify production URL configuration.
3. Request a fresh numeric code from the staging page, inspect the genuine email, and enter the code on that same page. Never paste token, code or magic link into chat.
4. Verify that the signed GoTrue session belongs to the correct verified account. Test a wrong code and a genuinely expired code separately, observing the provider's response. Avoid repeated real wrong-code submissions that could cause throttling.
5. Retest both inviter and recipient, signed workspace invitation delivery, acceptance, membership persistence, and refresh/relogin after staging invitation activation is separately approved and verified.

## Verification evidence and limitations

Automated tests verify browser request path and fallback redirect, no user creation, exact email OTP verification type, malformed-code rejection, and a denied-code error. These are **mocked transport tests**; they do not prove numeric email content, authentic accepted OTP, real expiry, or inbox delivery.

As of code implementation, the connected Supabase management interface has no Auth email-template read/update operation available. No usable management API credential was available to inspect or patch the template; the public management endpoint correctly returned HTTP 401. Thus hosted template correction remains **PENDING OPERATOR ACTION** and must not be marked completed from frontend test results alone.
