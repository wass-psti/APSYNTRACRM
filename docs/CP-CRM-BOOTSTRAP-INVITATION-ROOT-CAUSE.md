# CP-CRM — Bootstrap Administrator / Workspace Invitation Root Cause

**Investigation: 2026-11-20.** Production delivery is **not activated**. This report does not authorize schema, sender credential, permission or role changes.

## Evidence from the existing production project

The reported signed-account email was examined using targeted read-only queries (email excluded from output logs except in parametrized queries). The existing Supabase Auth identity is confirmed and linked to an active, email-verified profile. Its `platform_role` is `admin_general_manager`; it is present in the **two-record** immutable Bootstrap Administrator registry; the signed CRM effective-role resolver returns **`admin` for both Main Workspace and Work Management**. Current workspace is Work Management, where the account is an active workspace **member**, but in Main Workspace it has **owner** relation. The UI's `Workspace member` is a distinct per-workspace relation and not a downgrade of platform/bootstrap identity. No incorrect role grants or role mutations were proven.

The user-supplied invite-modal screenshot shows the message that the trusted service is unavailable; this was reproduced at the infrastructure layer by an unauthenticated HTTPS POST to existing **production** `ws02d-manage`, which returned **HTTP 404** with provider error **NOT_FOUND**. The production `ws02d-invite` and `ws02d-accept` routes returned **401** to anonymous calls; those responses only show gateway auth enforcement, not signed-user delivery readiness. Production SQL inventory confirms `private.ws02d_invitations`, `private.ws02d_invitation_delivery`, and `private.ws02d_issue(uuid,text,text,uuid)` **do not exist**. Therefore the manager cannot perform the signed readiness check and actual invitation delivery cannot occur. This failure happens before any invitation sender permission evaluation; it cannot be fixed by promoting a user or weakening role boundaries.

The existing staging project has WS02D SQL and Edge functions but still has **zero confirmed GoTrue test users**, missing SMTP Edge secrets, and an off invitation feature flag. Signed staging acceptance and real inbox delivery remain unverified. Production Auth custom SMTP settings are distinct from workspace invitation Edge secret configuration.

## Scoped code correction

- `WorkspaceInvitationManagementClient.readiness()` preserves HTTP 404 as a **specific, non-sensitive error code** `INVITATION_BACKEND_NOT_DEPLOYED` (HTTP status surfaced as 503 for failed service readiness), rather than merging it with 403 authorization denial.
- The existing invite dialog displays a precise deployment explanation for this code: **"Workspace Invitation backend is not deployed. Your account role has not changed. No email was submitted. Contact the system operator to activate the service."** Unauthenticated sessions and actual workspace denials retain their own messages.
- No changes to `auth.uid`, workspace selection, role resolver, signed-user permissions, WS02D SQL candidates, production data, SMTP or feature flags. Tests prove `admin_general_manager` identity, signed `CRM admin` and signed `Workspace member` can legitimately coexist.

## Acceptance and remaining deployment

- Unit and frontend regressions, Vite build and migration manifest checks were executed locally. CI and Pages evidence is recorded in PR comments.
- **Cannot claim full defect resolution:** actual Send Invitation remains unavailable until separately verified SMTP staging acceptance and controlled production deployment of private WS02D/WS11 routines + trusted manager/invite/accept Edge handlers + approved server SMTP and feature configuration. Production user roles require **no mutation** based on this evidence.
- The private candidate `ws02d_sender_authorized` currently defines workspace-owner/WS02D-admin eligibility rather than automatic bootstrap identity across all member workspaces. That is a **separate pending capability-policy decision**, not the cause of the current HTTP 404. Do not silently broaden permissions during unrelated server activation; validate intended sender capability with real signed users before release.

**Next bounded milestone:** `CP-CRM-WORKSPACE-INVITE-BACKEND-02 — Genuine SMTP and Signed Staging Acceptance, Then Controlled Production WS02D/WS11 Deployment and Bootstrap Sender-Capability Verification` (prerequisite: real mailboxes and authorized sender credentials).
