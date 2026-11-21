# CP-CRM-WORKSPACE-INVITE-RESUME-07 — Independent Staging Session Handoff

## Scope

Continue from deployed CP06 against the existing isolated staging project `jeqwjlxubntsddeauvqa`. No new project, account, workspace, role hierarchy, or production activation.

## Implementation

- The staging acceptance page already supports inviter-only issuance and recipient-only acceptance in separate browser contexts.
- The server-side acceptance runner previously contradicted that UI contract: `send` required both JWTs to identify the recipient email, and `accept` required the inviter JWT to perform an immediate manager readback.
- `send` now requires only the inviter JWT plus a validated recipient email. It verifies the inviter's signed identity, performs signed readiness, issues one invitation, and confirms the pending invitation plus submitted delivery ledger through the inviter's own manager readback.
- `accept` now requires only the recipient JWT plus the original token from the recipient's inbox. It verifies the recipient's signed GoTrue identity and returns the trusted acceptance receipt without depending on the inviter session.
- `verifyAcceptance` is a separate inviter-only readback operation. It verifies the accepted invitation after the recipient has completed acceptance on their own device.
- The optional `pair` operation remains a diagnostic; it is no longer a prerequisite for either account's workflow.
- The staging CLI now requires only the account session relevant to each operation. JWTs and inbox tokens remain environment-only and are never printed.

## Existing staging baseline observed

- Two existing confirmed Auth users and their separate workspace memberships are present.
- Inviter workspace: `6a051705-e141-44d2-bb87-cf8a124ab17e`.
- Recipient workspace: `71bc9c8e-a2c4-4a08-8cc1-80a6034ce264`.
- The staging SQL invitation feature flag and advanced-role flag are OFF.
- No invitation, delivery, or invitation-event records exist at baseline.
- `ws02d-invite`, `ws02d-accept`, and `ws02d-manage` are deployed ACTIVE with JWT verification enabled.
- The staging Magic Link/OTP template uses `{{ .Token }}`. A stray trailing `>` in its HTML body was observed; it does not change the token placeholder and was not edited in this implementation.
- The Edge secrets inventory contains the expected staging SMTP, callback, database URL, publishable-key, and activation secret names; values were not read or exposed. This confirms secret-name presence, not valid SMTP authentication or database connectivity.
- A prior signed `ws02d-manage` readiness attempt returned HTTP 503 (`EDGE_FUNCTION_ERROR`). The function log stream showed worker shutdown but no actionable exception detail. This is not a readiness PASS and must be rechecked with a fresh inviter session before activation.

## Acceptance still pending

The local code change cannot establish a real GoTrue session or read a recipient's inbox. The staging invitation SQL flag remains OFF. Both account holders must sign in independently in their own browser contexts. First resolve and recheck the signed readiness HTTP 503; only after readiness returns a valid, authorized result should the staging-only delivery gates be considered for activation. Then issue one real invitation, confirm provider submission and inbox receipt separately, accept from the recipient context, and perform inviter readback plus the read-only exact-workspace membership query in `sql/staging/cp-crm-workspace-invite-resume-07-membership-readback.sql`. Do not infer delivery from HTTP submission alone. Do not retry an uncertain send or acceptance.

## Non-goals

- No production database or Edge Function changes.
- No production frontend flag activation.
- No new authorization model or elevated role.
- No direct database credential or provider secret in the browser or repository.
