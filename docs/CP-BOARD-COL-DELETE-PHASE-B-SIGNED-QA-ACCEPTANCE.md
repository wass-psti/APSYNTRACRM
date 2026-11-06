# CP-BOARD-COL-DELETE — Phase B signed QA acceptance

**Date:** 2026-11-06  
**Status:** **B1 PRODUCTION MIGRATION COMPLETE AND VERIFIED** / B2–B5 GENUINE SIGNED ACCEPTANCE PENDING.

## Verified baseline

Phase A production migration `20261106002107` remains installed. The **B1** migration `20261106005756` now adds the private QA scope table and board/actor/expiry guards to each of its three recovery RPCs. Both server activation flags remain `false`, the QA scope and recovery snapshots remain empty, and Contacts / Status I still has four stored values. No real signed QA session, QA board creation, or production board deletion/restoration was performed in B1.

## Staged work

- `sql/cp-board-col-delete-phase-b-qa-scope-candidate.sql`: **INSTALLED IN PRODUCTION UNDER APPROVED B1**, as managed migration `cp_board_col_delete_phase_b1_scoped_qa_guard_20261106`. The source-fingerprint-locked change limits each recovery RPC to one approved QA board, one signed actor, and a maximum 60-minute expiry, while retaining both global flags disabled.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-acceptance.sql`: controlled synthetic signed-role tests covering four cells, scope and Viewer denials, expired scope, Activity events, restoration and rollback.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-reset.sql`: restores original function definitions in disposable PostgreSQL.
- `frontend/board-column-recovery.js` and `frontend/app.js`: QA-only interface guard; the recovery feature switch remains false and Contacts is ineligible.

[PostgreSQL run #42137611502](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42137611502): SUCCESS. Logs confirm both the QA scoped delete/restore Activity rollback test and preservation of the original function sources.

[Frontend Validation #42138438191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138438191): SUCCESS, including the QA-only UI checks, existing client behavior, and other frontend regression suites. [Pages deployment #42138437582](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138437582): SUCCESS. A previous frontend run failed due to an outdated test assertion for the former global UI flag; the test was updated for the QA-board predicate and all suites passed on the corrective commit.

**Before B1**, the production inspection confirmed three original Phase A RPC fingerprints. **After B1**, production read-only verification confirmed three QA-scoped RPCs with signed-session, board-manager, QA-marker, identity, and expiry checks preserved; a private RLS-enabled QA table with zero scope rows; both flags disabled; zero recovery snapshots; and **all four Contacts / Status I values intact**.

Synthetic PostgreSQL session tests are not proof of genuine GoTrue browser authentication or post-refresh persistence.

## B1 production installation and authorization evidence (2026-11-06)

The user explicitly authorized **B1 only**. The source-locked candidate was applied through Supabase managed migration, removing the file's outer transaction wrappers so the migration runner owned the transaction. The server returned `success:true`; Supabase migration history now shows **166** migrations, including version `20261106005756`, name `cp_board_col_delete_phase_b1_scoped_qa_guard_20261106`.

**Actual production SQL checks:**

- `CP_BOARD_COL_DELETE_PHASE_B1_PRODUCTION_QA_SCOPE_DEFAULT_DENY_VERIFIED` — PASSED, including all three updated RPCs retaining original signed-session, `manage` authorization, global-activation, nonexpired QA-board/actor checks, required QA name marker, and anonymous execution denial.
- The only new table, `private.wm_recoverable_column_qa_scope`, has **RLS enabled**, no `anon` or `authenticated` direct table privileges, and **zero rows**. No new QA board or authorized actor was created.
- Both existing server activation flags are still `false`; zero archived column/cell snapshots exist. The frontend recovery feature flag remains `false`.
- Contacts board still has **five columns**; its custom **Status I** column remains present with **four persisted cell rows**.
- Reran the unchanged Phase A production postinstallation verifier: `PHASE_A_POSTINSTALL_DEFAULT_OFF_RLS_GRANTS_AND_SOURCE_VERIFIED` — PASSED.
- Supabase reports `ACTIVE_HEALTHY` PostgreSQL 17.6. Existing database-wide advisor warnings persist, including some unrelated callable security-definer functions; B1 added a scope restriction to its three purpose-specific RPCs and does not claim to remediate the entire project.

**Limits:** The postchecks verify installed source, RLS and permissions. They do not count as a genuine GoTrue-browser signed manager session, a live QA fixture, refresh persistence, or Activity restoration. The saved Phase B test suite remains the evidence for disposable four-row recovery only.

---

## Pending production gates

**B1:** **COMPLETE / VERIFIED.** User approved and production managed migration recorded as `20261106005756`. Current exact RPC fingerprints: delete `c9306ac46991b67bbfc1817cf197b5b5`; list `51a6f2574597107396e298277111e1c6`; restore `d569201323f80d9e5f8e08d7cdeffab5`.  
**B2:** Separate approval for an ordinary QA board fixture operated by an existing signed board manager in the current workspace, not Contacts.  
**B3:** Controlled, time-bounded activation restricted to that board and actor following verified B1 installation.  
**B4:** Genuine browser-session deletion, refresh/reopen, Activity restoration and authorization-denial acceptance.  
**B5:** Confirm restoration, disable the activation settings, remove temporary scope as appropriate, and preserve audit and recovery data.

Phase C deletion of Contacts / Status I is not authorized by Phase B. No live QA fixture or signed browser test is claimed here.

**Next required gate:** B2 — controlled ordinary QA board fixture and genuine signed-user access, followed by separately authorized B3 time-limited activation. B1 is COMPLETE; neither B2 nor B3 is implied by the B1 approval.
