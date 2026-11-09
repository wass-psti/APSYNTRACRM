# CP-WS-02D/C — Guarded Workspace Invitation Client

**Status: Implemented, production sending disabled.** This increment adds a real, bounded browser-to-trusted-boundary transport contract without claiming that the missing live server infrastructure exists.

## Root cause

The `Invite members` dialog was intentionally a review-only mock of the workflow, with no production invitation-send wiring. Private token issuance, trusted delivery, recipient acceptance and role ceilings were built as dormant SQL/Node candidates, not installed or signed-accepted on the production Supabase project. The Admin and Viewer options in the preview are not safe to grant until all domain write ceilings are integrated.

## Implementation

- `frontend/workspace-invitation-client.js`: `WS02D_INVITE_CLIENT_ENABLED=false` hard stop; single `member` recipient; stable UUID request ID; fresh GoTrue user and authoritative workspace context; authenticated POST only to the approved project's `/functions/v1/ws02d-invite`; validated nonsecret receipts; no automatic retry on ambiguous network or reconciliation errors. Does not send email or mutate membership directly.
- `frontend/workspace-ui.js`: existing draft review remains the default. A guarded, explicit Send action is wired for a *future* activated server contract, with no duplicate request while pending, no silent multiple-recipient send and fail-closed feedback. The original modal's role preview remains intact.
- `frontend/app.js`: injects the client into both signed launch paths with the disabled feature flag. No token, secret or email is stored locally. All provider calls remain server-side.
- Tests verify disabled-by-default and denied paths, member-only sends, actor/scope checks, malformed receipts, redacted errors, and no automatic retry. The existing frontend suite remains unchanged except for updated assertions of the new conditional send branch.

## Outstanding production blockers

1. Verify current production invitation schema and policies using an authorized Supabase connection; this integration could not access a linked Supabase project in this session.
2. Finish board/domain `AND` role-ceiling integration and signed Viewer write-denial coverage; **do not** activate Admin or Viewer invitation roles before this.
3. Deploy a trusted server route with actual GoTrue session-revocation verification, authorized private issuer invocation, durable delivery outcome ledger, provider secrets, quotas, denial audits and email templates. The existing HTTP module is a candidate, not a deployed route.
4. Implement and test recipient-side token acceptance and lifecycle state transitions, including decline, expiry, revoke, resend reconciliation, one-time use and replay denial.
5. Confirm backup/rollback and obtain separate approval for production DDL, grants, email provider and actual invitation sends. Use isolated signed test identities for runtime acceptance.
6. After the live backend is verified, enable the frontend flag in a separately reviewed change. The browser is never permitted to decide inviter authority.

Do not report this stage as successful invitation delivery or production readiness. No production data, role or permission changes are part of this increment.
