# CP-TT-AUTO-CLOCKOUT-02C — Controlled production restoration and attendance reconciliation

**Date:** 2026-11-20 (Asia/Manila)
**Source:** PR #630 merged to main at commit 5ca0f045.
**Scope:** Restore atomic Attendance Board projection and reconcile only three verified post-activation missing projections. No new role, policy, privilege, workspace restriction, attendance timestamp, GPS evidence, or employee identity.

## Verified implementation

- PostgreSQL 17 acceptance passed for the corrected migration and after merging to main.
- A collision with the already-applied CRM migration version 20261120150000 was detected before activation. The corrected migration used the unique version 20261120170000 and CI passed.
- The production linked Supabase CLI dry run listed precisely one pending migration. The controlled push applied 20261120170000_cp_tt_auto_clockout_02c_atomic_board_projection_restore.sql.
- The remote ledger records that exact migration version and name.
- The live signed attendance RPC MD5 changed from 4894b2319d8f75efa9c70e0ff3d2da27 to 054e92372e8139441fe7064eda4939da.
- The original atomic private.tt_board_projection_upsert call is restored and the dynamic employee department catalog check remains present. No permission changes were made.
- Post-merge GitHub Pages and disposable PG17 CI passed. Generic frontend CI failed on the missing forward migration manifest entry; the manifest is corrected in this evidence commit.

## Controlled production reconciliation

Immediately before reconciliation, three post-activation signed Clock-In records had genuine captured browser GPS, manual audits at revisions 59, 60 and 61, working scheduler registrations and no projections.

A single locked, scoped database transaction required the exact three record IDs and checked employee identity, original Clock-In timestamp, GPS source evidence, audit and active scheduler lineage. Existing private projection logic created only the missing Board data at original source revisions.

### Readback

- Three of three records now have exactly one private Board projection and matching in-progress Board item.
- All three Board items have six populated typed values; no shift or hours were fabricated.
- Original Clock-In timestamps and GPS evidence are unchanged.
- Canonical shared attendance revision remained 61, unchanged by projection-only repair.
- Active attendance: 20; projected active: 19; unprojected historical: 1; monitored active missing projection: 0.
- Scheduler check after repair: 747 succeeded runs, 18 monitoring sessions, zero scheduler session errors.
- No automatic Clock-Out audit events and no approved OT today.

## Remaining acceptance

1. Natural nine-hour threshold and grace expiry. Earliest threshold at last inspection: 16:33:20 PHT on 2026-11-20, with 17:03:20 PHT grace expiry if there is no applicable approved OT.
2. Actual server Clock-Out and readback of authoritative attendance, audit, projection, Board item/typed values and credited working duration.
3. Genuine signed Employee browser session, persisted signed schedule, refresh/reopen behavior, and Board synchronization. Current selected browser session is System Admin and has no Clock-In department.
4. Genuine employee overtime request approval, applied cutoff and natural OT endpoint closeout.

No test production attendance was fabricated, modified or prematurely expired. The pre-activation historical record remains untouched.

**Result:** Controlled production repair and scoped data reconciliation VERIFIED. Genuine signed-employee browser and natural Clock-Out/approved-OT production closeout PENDING.
