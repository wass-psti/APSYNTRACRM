# CP-TT-GROUP01 — TimeTracker Attendance empty-group deletion remediation

**Production decision:** NO-GO for actual deletion until the dedicated production change and authorization gate is satisfied. This checkpoint does **not** change production SQL, grants, TimeTracker records, groups, memberships, or roles. A reversible, per-browser **Hide empty group** action is usable now.

## Confirmed root cause

On the existing production TimeTracker Attendance board, two groups exist: `Main group` at position 0 and `Main Group II` at position 1. Read-only PostgreSQL inspection found **zero active or archived work-board items in either group**, and the board contains no group-scoped item rows. The existing `wm_board_group_cas` RPC rejects all protected-board `delete_empty` actions using `private.wm_board_is_protected`; the frontend deliberately disables the corresponding button. The legacy `wm_delete_board_group` RPC is revoked for authenticated users because its group foreign key has `ON DELETE CASCADE` and could destroy records. These are security controls, not a frontend event bug.

## Implemented safe response

1. **Immediately available non-destructive workaround:** On the protected TimeTracker board, a signed user who can open group actions may choose **Hide empty group (this browser)** on a nonprimary group with no stored (including archived) work-board items. Hidden-group IDs are persisted in a user/workspace/board-scoped browser preference; the database is **not** modified. **Show hidden empty groups** restores the view. A group with any stored item is always shown, regardless of an older hide preference. The first group remains visible. This action is explicitly called *Hide*, never *Delete*.
2. **Staged permanent deletion:** `sql/cp-tt-group01-managed-delete-staged.sql` introduces a new narrowly scoped RPC `wm_managed_board_delete_empty_group(uuid,uuid,timestamptz,text)`. It is **not** a replacement or relaxation of the protected generic group RPC. It requires a live GoTrue session, platform administrator classification **and** effective board `manage`, matching workspace/RBAC, exact TimeTracker module marker/name, active board, nonprimary group, exact confirmation title, updated-at CAS, multiple remaining groups, and **zero active or archived work-board items**. The transaction acquires the established board-scoped advisory lock and group row lock, refuses drift, deletes just the verified empty group, adjusts group positions, records a signed audit event and returns an exact receipt. The preflight refuses unreviewed group foreign-key dependencies.
3. **Fail-closed rollback:** `sql/cp-tt-group01-fail-closed-rollback.sql` revokes execution of the new RPC, preserving audit/history and the legacy group's revoked permission. It intentionally does **not** restore the unsafe cascading deletion function.
4. **Frontend readiness:** `frontend/managed-time-tracker-groups.js` includes a guarded, signed, receipt-checked client for that RPC, but `MANAGED_TT_GROUP_DELETE_ENABLED=false` until the separately authorized production rollout and genuine signed browser acceptance. The UI continues to show **Delete group — awaiting approval** alongside the usable Hide action while activation is blocked. Ordinary-board atomic group deletion remains unchanged.

## Disposable validation requirements

Run the dedicated GitHub Actions PostgreSQL 17 workflow `.github/workflows/apsyntra-tt-group01.yml`, using synthetic group IDs, item records, sessions and roles only. Required evidence: exact authorized empty nonprimary group removal; unchanged item count; `group.deleted_empty` audit; primary, archived, stale revision, mismatched confirmation, nonadmin owner, viewer, foreign workspace, expired and revoked session denials; deny the legacy cascading RPC; rollback revokes the new RPC. Frontend tests also cover the default-off client and reversible browser preferences.

## Mandatory production gates

- Independent review of the exact staged SQL source and fail-closed rollback, including TimeTracker domain integration, group concurrency, PostgreSQL privileges, and the sign-in/session helper.
- **Separate explicit production permission/schema/function change approval** from the authorized operator, naming both reviewed SQL files (and immutable commit/digest).
- Verify the approved migration was applied, current function definition and grants match the reviewed version, and no additional foreign-key or application dependencies were introduced.
- Only then enable the frontend flag in a separate scoped commit and perform genuine signed platform-admin and nonadmin HTTPS acceptance; check the actual group count, signed `group.deleted_empty` audit, persistence after refresh, and that other TimeTracker workflows and all 12 application boards remain unaffected.
- Never run the raw legacy delete RPC, directly delete a group using an elevated database connection, or relax an application-owned board's protections to make the UI button clickable.

**Success classification:** The reversible Hide action may be accepted through browser UI verification after Pages deploy. Actual protected-group **Delete** remains **IMPLEMENTED-UNVERIFIED / BLOCKED PRODUCTION ACTIVATION** until those gates pass.
