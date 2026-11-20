# CP-TB-INDEPENDENT-NATIVE-02 — APSYNTRA CRM Native TalkBox Workflows

Date: November 20, 2026. Repository: wass-psti/APSYNTRACRM.

## Scope and architecture

Native TalkBox continues to use APSYNTRA CRM's own signed Toolbox Issues RPCs, existing workspace context, private Supabase Storage and production project. monday.com is reference material only and does not participate in application runtime, hosting, authentication, database, or synchronization. No new Supabase project, authorization restrictions, RLS policy or role grants were introduced.

## Implemented and validated frontend features

- Existing toolbox_issues_users RPC supplies the signed workspace member directory. Issue assignee selection accepts only currently returned CRM UUID identities, supports multiple members, uses issue-version optimistic concurrency and verifies a second signed issue GET.
- Native running time tracking persists the UTC start timestamp and accumulated seconds within the existing issue timeTracking JSON, with version-checked start and stop, duplicate prevention, error handling for reversed clocks, second-read verification, and refresh/reopen continuity. It does not depend on browser background timers; actual elapsed duration is calculated on stop. Local client time is used and has not been certified as an authoritative server-clock measurement.
- Native subtask deletion uses the existing deployed delete_subitem RPC, asks for explicit user confirmation, verifies the selected issue contained the child, and checks that the child has disappeared on a fresh signed issue GET.
- Existing native private file download now uses the documented authenticated Storage GET endpoint. This fixes the previous mismatch with the Storage POST/DELETE endpoint paths.
- Previously added native issue filtering now retains its filter across paginated list hydration instead of dropping it during hydration.

## Pending production backend activation, already staged in code

The current production database contains the existing users, update_issue, and delete_subitem RPCs. It does NOT contain toolbox_issues_native_v2_capabilities, toolbox_issues_reply_update, or toolbox_issues_unregister_attachment.

A non-deployed SQL candidate exists at supabase/migration-candidates/cp_tb_independent_native_02_thread_and_media.sql. It introduces source-independent parent-reply identities and a reply creation RPC, and soft-deleted attachment metadata plus a retryable unregister RPC. It retains original discussion authors/timestamps, the existing access check, and existing record ownership. The private binary delete is a separate authenticated Storage operation. The candidate is NOT in the executable migrations directory and has NOT been applied to production.

The frontend detects a signed native_v2_capabilities response and hides reply/removal controls until the corresponding RPCs are actually deployed. No false claim that those features are currently available is made. The client and UI include draft integration paths and negative controls for absent capabilities, parent mismatch, registration mismatch, and uncertain binary deletion.

## Verification and exclusions

Local synthetic tests verify native workspace-user identity validation, multi-assignee readback, issue CAS, running timer persistence, duplicate clock start, simultaneous session conflicts, subtask deletion, reply-parent matching, Storage deletion acknowledgement, signed Storage GET readback, and capability-gated UI. The full regression, build, lint and style checks are required before release.

The signed production database was inspected READ ONLY to confirm which Toolbox RPCs already exist. No real issue was created/edited/deleted, no original asset was uploaded or removed, and no production database schema, credential or role was changed.

Not yet accepted: SQL candidate deployment and isolated PostgreSQL integration, real two-account signed write/reopen/refresh, server-clock authority for timers, end-to-end reply and file removal, and complete operational parity. Build/CI pass by themselves are not production acceptance.

## Next solid milestone

CP-TB-INDEPENDENT-NATIVE-02B — Isolated PostgreSQL Thread and Attachment Lifecycle Acceptance, Approved Backend Activation, Two-Account Cross-Session Readback, and Final Native TalkBox Functional Parity.

Production schema activation and any live destructive or material data writes require separate explicit approval. No additional role restrictions or external monday.com connection are necessary.
