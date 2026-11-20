# CP-CRM Workspace Invitation — Recipient-side functional activation

## Root-cause review (2026-11-20)

The production workspace invitation form was previously made clickable via PR #656, and the signed-readiness classification corrected via PR #659. Actual production invitation sending remains blocked by missing private WS02D issuance/delivery SQL, missing production `ws02d-manage` Edge route and absent workspace-invitation SMTP Edge credentials. Staging has the private schema and Edge routes but no verified staging users or sender secrets; there is still no basis for genuine inbox acceptance or production cutover.

**A separate genuine frontend defect:** `frontend/app.js` used `WS02D_ACCEPTANCE_ENABLED=false` (from the dormant-by-default acceptance client) for the recipient acceptance view, button handler and acceptance client instance. Thus even a delivered, valid email link would be rendered permanently disabled and membership could not be accepted. The token handoff, GoTrue verification and private signed acceptance transport already existed. A rewrite or new email provider is unnecessary.

## Scoped implementation

- Explicitly opt the **app's recipient link flow** into the existing `WorkspaceInvitationAcceptanceClient` with `enabled:true`; keep the reusable module's default `WS02D_ACCEPTANCE_ENABLED=false` for callers that did not opt in.
- A valid one-time link is still scrubbed from the location bar. The app enables the confirmation button only with a valid volatile token and a signed context; the recipient makes exactly one authenticated `/functions/v1/ws02d-accept` POST with `retryUnauthorized:false`. Edge and private SQL remain authoritative for token matching, expiry, email identity, workspace and membership write.
- On a signed accepted receipt only, clear the token and set accepted state. Refresh the signed workspace catalog so new membership can be selected; if that read fails after the server committed, preserve the accepted receipt (do not misreport as failed). On an uncertain send/accept result, clear the token and require reconciliation, never an automatic replay.
- Preserve existing owner/admin/workspace policy, board permissions, registration controls, and the separate server activation requirements. No production DB/Edge/SMPP secrets, role assignments or access grants modified.

## Verification

- Added focused recipient-enabled path tests for exact token scrubbing, signed request, accepted receipt then refresh ordering, dormant backend uncertainty, and no browser-side membership mutation. Existing default-off module and negative tests remain.
- Local frontend+WS02D regression: 3173 pass, 1 pre-existing fail in `frontend/tests/board-share.test.mjs` after recent board-invite consolidation. On current `origin/main`, the test expects `data-action="board-share-preview"` in `frontend/board/collaboration/invite.js`, whereas the current source no longer contains that action. Neither file was changed by this PR. This is not a recipient-invitation regression; it remains an independent baseline issue requiring a scoped board-share test alignment.
- The production Vite build and migration hash inventory pass. Additional CI outcomes must be reported as observed, not presumed.

**Limitations:** This corrects recipient-side readiness only. Signed two-account staging acceptance, real SMTP provider submission and inbox arrival, actual membership persistence and production WS02D/WS11 installation are **not verified**. Do not call this a fully operational invitation system until these conditions pass. Pending external prerequisites: working authorized SMTP sender credentials in staging Edge secrets, two independent confirmed GoTrue staging users and accessible inboxes, and a reviewed production cutover/rollback.

**Next bounded milestone:** `CP-CRM-WORKSPACE-INVITE-DELIVERY-CUTOVER-01 — Genuine SMTP/Two-Account Staging Acceptance, Controlled Production Backend Deployment, and Signed Recipient Persistence Closeout`. Avoid another UI-only milestone if these prerequisites remain absent.
