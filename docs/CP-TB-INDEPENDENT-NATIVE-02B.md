# CP-TB-INDEPENDENT-NATIVE-02B — Isolated PostgreSQL Acceptance and Activation Readiness

Date: 2026-11-20. Repository: wass-psti/APSYNTRACRM. Existing production Supabase project: jtlusodorfnyzgyuewkz.

## Verified execution

Production server version was confirmed READ-ONLY as PostgreSQL 17.6. PGlite 0.3.16 embeds real PostgreSQL 17.5, providing a matching-major-version isolated SQL runtime without a new Supabase project, production data, or backend service. The exact engine is pinned and installed OUTSIDE the application dependency graph.

The suite loads eight original deployed Toolbox schema/helper/RPC migration sources with disposable workspace profiles and members. It applies the real candidate SQL, replays its DDL to test idempotency, and executes actual SQL under distinct authenticated users and an anonymous role.

Tests verify: genuine SQL return values for threaded replies including author and parent identity; a second signed user's readback; denial for unknown parent, nested reply, blank text, archived issue, anonymous identity and another workspace; correct soft-delete audit preservation; independent signed issue readback; idempotent repeated unregister; pending-cleanup persistence; refusal to mark Storage purged while its object exists; final authoritative Storage absence verification; and idempotent server confirmation. The test uses disposable Storage metadata rows and never contacts production.

This isolated test found and corrected a real PL/pgSQL variable/table-alias collision in the staged reply function. The candidate preserves all original Toolbox role, access and RLS definitions.

## Recoverable native attachment deletion

The candidate adds deleted_at and storage_purged_at metadata for private files and exposes pendingAttachmentCleanup only to the existing signed issue read path. The UI offers Retry cleanup only when the live capability RPC explicitly confirms attachment removal is deployed.

The removal client unregisters the attachment, checks fresh native readback, deletes the exact scoped private object, verifies the authenticated GET returns HTTP 404, requests backend purge confirmation, and re-reads the issue to confirm both active and pending lists omit it.

The server independently checks storage.objects before accepting the final purge receipt. If DELETE fails after soft-delete, pending state persists through refresh and can be retried without losing the original attachment ID/path. No new authorization restrictions are added.

## Production acceptance gates

The SQL remains exclusively under supabase/migration-candidates, NOT deployable production migrations. The live production project currently lacks these three V2 RPCs, the purge-confirmation RPC, and the new table columns. The user's general implementation authorization does not itself authorize a material production schema activation or destructive Storage writes.

Before production activation: request explicit schema approval; confirm existing project schema and backup/recovery plans; prepare and review a reversible migration through the repository policy; execute full PostgreSQL 17 staging acceptance; then activate only the approved change without weakening existing workspace/RLS/roles.

Final runtime acceptance requires two genuine independently authenticated CRM accounts in a disposable workspace and controlled records. Verify issue creation, reply author/parent persistence after refresh and reopen, cross-account visibility, denied cross-workspace access, private file upload/download/removal/recovery, and timer continuity across sessions. Current timers still use persisted client clock timestamps, not authoritative server-clock measurement.

No monday.com runtime integration, historical source backfill, new Supabase project, new access controls, or production data mutations were performed here.

## Status

- Isolated PostgreSQL 17 migration and signed-role tests: VERIFIED.
- Native client negative paths and pending-cleanup UI: IMPLEMENTED, subject to automated CI.
- Real signed two-account live browser writes: PENDING.
- Production schema deployment and complete native runtime parity: PENDING.
- Next solid milestone: CP-TB-INDEPENDENT-NATIVE-02C — Approved Native V2 Schema Activation, Genuine Signed Two-Account Readback, Server-Clock Timer Reconciliation, and Final Functional Closeout.
