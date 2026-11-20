# CP-TB-INDEPENDENT-NATIVE-02D — Controlled Production Activation and Runtime Acceptance

Date: November 20, 2026. Existing APSYNTRA CRM project: jtlusodorfnyzgyuewkz, PostgreSQL 17.6.

## Explicit authorized scope

The user specifically requested approved transactional Native V2 production activation for existing native TalkBox. This includes additive reply and attachment lifecycle columns, four Native V2 RPCs, two server-clock timer RPCs, and native issue projections. No other CRM applications, access policies, RLS/RBAC, user accounts, credentials or historical production records are to be modified. monday.com is unrelated to the runtime.

## Before activation

- Production project ACTIVE_HEALTHY, same existing backend and database.
- Source migration history confirmed original native Toolbox migrations already applied, and no Native V2/timer RPCs or additional lifecycle columns installed.
- Source production baseline: 4 issues, 3 discussion updates, 1 subitem and 0 attachment rows.
- Original native issue and update projection SQL fingerprints: 5a53d8b00e2d2856c9e7289248a87c11 and 11d52a420c34126c8b936e46092fa15d.
- Private on-Mac targeted snapshot before alteration: CP-TB-NATIVE-02D-private-production-preactivation-snapshot.json. File mode 0600, SHA-256 592ecabdd2ecbe98b8bd3e95589d03ee342e92e8f8693402f9367028ba0e2f2a. Covers the 4 issues, 3 updates, 1 subitem, 0 attachments, 28 audit records and original two SQL projection definitions. This is targeted recovery evidence, NOT a confirmed full-database backup.
- Exact pre-existing access function and role/RLS contracts left unchanged.
- PostgreSQL 17.5 isolated activation and non-destructive rollback rehearsed 3/3 tests PASS; original signed fixture survives rollback.
- Two explicit transactional migrations add lock_timeout=3s and statement_timeout=30s, expected source-projection digest guard, prior-installation guard, and required V2-before-timer dependency guard.

## Activation

Only these version-controlled SQL migrations may be applied through the existing Supabase managed migration tool, in order:

1. supabase/migrations/20261120101751_cp_tb_native_02d_thread_media_activation.sql
2. supabase/migrations/20261120101929_cp_tb_native_02d_server_timer_activation.sql

Migration source is pinned to the reviewed candidate; no project creation, access widening, data backfill or direct monday.com synchronization. The frontend already dynamically gates V2 controls based on the signed backend capability receipt.

Post-commit checks must establish six exact new RPC names, original issue/update projection compatibility, three expected columns, unchanged four original issue IDs and discussion/subitem rows, no unauthorized grants or security-context weakening, and independent genuine signed browser readback where available.

## Recovery

If post-install checks fail, do not delete historical Toolbox records. Restore the original projection functions and drop only the six new feature RPCs using the reviewed, isolated-tested supabase/migration-candidates/cp_tb_native_02d_rollback_non_destructive.sql. Retain additive columns and any new reply/timer/audit rows to avoid data loss. Rollback is functional deactivation, not a destructive revert of already-created records. If a managed corrective migration is needed, record it as a new version; do not erase migration history.

## Required operational closeout

Feature-parity acceptance requires two independently authenticated real CRM sessions in a controlled disposable workspace, live persisted issue and reply readback across refresh/reopen, private attachment upload/download/removal including retry after interrupted deletion, server-clock timer start/stop across sessions, negative cross-workspace access and audit integrity. Isolated PostgreSQL/synthetic tests alone cannot establish this. No production user/role changes or credentials may be synthesized to make the acceptance pass.

## Final acceptance status

- Transactional migration rehearsal and rollback: VERIFIED in isolated PostgreSQL.
- Production activation: mark only after the live tool reports success and independent readback matches.
- Genuine two-account browser acceptance and final native functional parity: PENDING until evidence is obtained.

## Verified production activation and migration-history alignment

The user-approved production migrations succeeded on November 20, 2026 through Supabase managed migration actions. Actual recorded production versions: 20261120101751 (cp_tb_native_02d_thread_media_activation) and 20261120101929 (cp_tb_native_02d_server_timer_activation). The SQL bodies remain identical; repository filenames have been aligned to these authoritative versions to prevent duplicate replay.

Production readback confirms all six Native V2/timer RPCs and three additive columns, functions owned by postgres, SECURITY DEFINER with empty search_path, authenticated EXECUTE allowed and anon EXECUTE denied. All four original issues, three updates, one subitem, zero attachment records and 28 audit events remain. A private on-Mac preactivation snapshot was independently compared against fresh production rows; every pre-existing stored JSONB field matches, with only the new reply_to_update_id=null field on original update rows. No production test issue was created.

PostgreSQL 17 activation and non-destructive rollback rehearsal: 14/14 PASS. Production backend activation: VERIFIED. Genuine two-account independently signed browser functional acceptance remains BLOCKED: both desktop browsers currently disallow JavaScript automation and no second independently signed user session was established. Final native functional parity is therefore PENDING.

Next milestone: CP-TB-INDEPENDENT-NATIVE-02E — Genuine Two-Account Signed Native TalkBox Workflow Acceptance, Attachment Lifecycle, Timer Continuity, and Final Production Functional Closeout.
