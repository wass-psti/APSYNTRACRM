# CP-CRM-WORKSPACE-INVITE-STAGING-SIGNIN-01

## Scope

Staging-only browser acceptance entry point: `frontend/ws02d-staging-signin.html` hosted under the existing GitHub Pages origin. It uses **only** isolated Supabase project `jeqwjlxubntsddeauvqa`; the production CRM remains unchanged.

The staging Auth users `lmsenagan@watchdogautomation.com.ph` and `jspagsuguiron@watchdogautomation.com.ph` were confirmed but did not yet have signed GoTrue sessions at implementation start. The server-side staging onboarding SQL `sql/staging/cp-crm-workspace-invite-01d-verified-user-onboarding.sql` deliberately requires exactly two confirmed GoTrue accounts with live sessions.

## Operator flow

1. Each authorized account holder uses the staging sign-in page. Choose existing account password or request an email code **only if the configured Auth template supports one**. Neither passwords nor JWTs should ever be sent to chat or terminal logs.
2. Click **Verify both genuine signed users** in the same browser tab after sign-ins. Access tokens remain exclusively in tab memory, not in storage, URL, logs or rendered text. Close the tab to clear them.
3. Inspect staging `auth.sessions` and confirm two independent verified live sessions. Run the guarded `01d` SQL onboarding using the two known emails through controlled staging SQL execution. No artificial accounts and no direct Auth table writes.
4. Confirm isolated profiles/workspaces/memberships; enable the **staging** SQL/Edge invitation gates only after provider configuration and the intended recipients are verified.
5. Enter the isolated inviter workspace UUID, send one invitation, inspect recipient mailbox, supply the inbox token **in this browser page**, accept under the recipient's signed session, and verify workspace membership across a new session.
6. Keep production cutover gated on real provider submission, inbox receipt, accepted membership, duplicate/idempotency and role-preservation evidence.

## Safety

No change to production frontend login code, Supabase project, Auth verification, RBAC, role grants or production data. The separate static entry point exposes only a public Supabase publishable key. No service-role or private secrets are embedded. Staging credentials and access tokens never leave browser memory except for HTTPS calls to staging GoTrue and the trusted Edge functions. A successful page sign-in does not itself certify SMTP delivery or membership persistence.

## Current status

IMPLEMENTED-UNVERIFIED live sign-in pending authorized operators. Production cutover NOT EXECUTED.
