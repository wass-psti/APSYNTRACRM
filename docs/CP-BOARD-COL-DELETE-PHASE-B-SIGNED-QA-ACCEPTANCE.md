# CP-BOARD-COL-DELETE — Phase B signed QA acceptance

**Date:** 2026-11-06  
**Status:** STAGED / DISPOSABLE VERIFIED / GENUINE SIGNED ACCEPTANCE PENDING.

## Verified baseline

Phase A production migration `20261106002107` remains installed, with its three recovery RPC definitions unchanged. The server flags `delete_enabled` and `restore_enabled` are both false; recovery snapshots contain zero rows; Contacts / Status I still has four values. The live database has no Phase B scope table and no currently eligible QA-named board. No real session or production board write was made in Phase B.

## Staged work

- `sql/cp-board-col-delete-phase-b-qa-scope-candidate.sql`: dormant, exact-source-locked addition for one approved QA board, one signed actor, a maximum one-hour expiry and existing board-manager checks. The current broad activation flags remain disabled. This candidate has NOT been installed in production.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-acceptance.sql`: controlled synthetic signed-role tests covering four cells, scope and Viewer denials, expired scope, Activity events, restoration and rollback.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-reset.sql`: restores original function definitions in disposable PostgreSQL.
- `frontend/board-column-recovery.js` and `frontend/app.js`: QA-only interface guard; the recovery feature switch remains false and Contacts is ineligible.

[PostgreSQL run #42137611502](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42137611502): SUCCESS. Logs confirm both the QA scoped delete/restore Activity rollback test and preservation of the original function sources.

[Frontend Validation #42138438191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138438191): SUCCESS, including the QA-only UI checks, existing client behavior, and other frontend regression suites. [Pages deployment #42138437582](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138437582): SUCCESS. A previous frontend run failed due to an outdated test assertion for the former global UI flag; the test was updated for the QA-board predicate and all suites passed on the corrective commit.

A subsequent production read-only inspection confirmed three unchanged Phase A RPC fingerprints, **both activation flags still false**, no QA scope deployment, zero recovery snapshots, and **all four Contacts / Status I rows present**.

Synthetic PostgreSQL session tests are not proof of genuine GoTrue browser authentication or post-refresh persistence.

## Pending production gates

**B1:** Separate scoped approval for installing the board-specific security migration, initially disabled.  
**B2:** Separate approval for an ordinary QA board fixture operated by an existing signed board manager in the current workspace, not Contacts.  
**B3:** Controlled, time-bounded activation restricted to that board and actor following verified B1 installation.  
**B4:** Genuine browser-session deletion, refresh/reopen, Activity restoration and authorization-denial acceptance.  
**B5:** Confirm restoration, disable the activation settings, remove temporary scope as appropriate, and preserve audit and recovery data.

Phase C deletion of Contacts / Status I is not authorized by Phase B. No live QA fixture or signed browser test is claimed here.

**Next required gate:** B1 controlled board-scoped authorization migration approval, followed by B2 genuine signed-user QA fixture approval.
