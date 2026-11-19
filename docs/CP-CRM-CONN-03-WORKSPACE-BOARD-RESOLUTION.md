# CP-CRM-CONN-03 — Signed Employee Workspace Context, Empty Board Catalog, and Native Application Resolution

**Date:** 2026-11-19  
**Repository:** `wass-psti/APSYNTRACRM`  
**Supabase project:** `jtlusodorfnyzgyuewkz`  
**Status:** Root cause confirmed; production permission/data change intentionally held for explicit approval  
**Scope:** TimeTracker, Fund Tracker, FuelTrack+, TradeLink

## 1. Executive finding

The employee's workspace context and four application-role assignments resolve correctly in the database. The native application board catalog is empty because the employee has no `work_board_members` rows for the four canonical application boards.

The application-role setter and board-membership setter are separate operations. `public.wm_admin_set_application_role(...)` writes the application role in `public.module_role_assignments` (or delegates to the domain-specific role setter) and does not create a `public.work_board_members` row. `public.apsyntra_role_manage_user_access(...)` explicitly branches between `p_scope='module'` and `p_scope='board'`; only the board branch writes `work_board_members`.

The four applications discover their existing board through `db.boards('active')`, then resolve the board from the returned catalog. `public.wm_list_boards('active')` returns only active boards in `public.current_workspace_id(auth.uid())` for which the caller is a platform administrator or has a `work_board_members` row. The generic board access RPC, `public.work_board_access(...)`, also requires a board membership for a non-platform administrator. Therefore an enabled application role alone does not currently make the native board discoverable or readable.

This is a separation between application-role assignment and native board membership, not a missing workspace or missing board record.

## 2. Target employee evidence

The investigated employee is an active profile with one active membership in **Work Management**. The database's `public.current_workspace_id(user_id)` fallback resolves to the existing Work Management workspace.

A read-only SQL claim simulation using the employee's existing Auth session row set transaction-local `request.jwt.claim.sub` and `request.jwt.claims`, then evaluated the same context and board RPCs. It returned:

| Check                                                       | Result                              |
| ----------------------------------------------------------- | ----------------------------------- |
| `current_workspace_id(auth.uid())`                          | Work Management workspace UUID      |
| `wm_auth_access_context().workspace_id`                     | Same Work Management workspace UUID |
| `has_module_access('time-tracker', auth.uid())`             | `true`                              |
| `has_module_access('fund-released-tracker', auth.uid())`    | `true`                              |
| `has_module_access('fueltrack-plus', auth.uid())`           | `true`                              |
| `has_module_access('tradelink', auth.uid())`                | `true`                              |
| `wm_list_boards('active')`                                  | 0 rows                              |
| `work_board_access(<canonical board>, 'view')` for all four | `false`                             |

This was a transaction-local database claim simulation, not a fresh employee browser login. The currently selected Chromium session was an administrator session; no new employee credentials were requested, extracted, or used.

The employee's four existing module assignments are enabled:

| Module ID               | Existing role | Enabled |
| ----------------------- | ------------- | ------- |
| `time-tracker`          | `Employee`    | Yes     |
| `fund-released-tracker` | `REQUESTOR`   | Yes     |
| `fueltrack-plus`        | `User`        | Yes     |
| `tradelink`             | `User`        | Yes     |

The employee has zero `work_board_members` rows across the 265 active boards in Work Management.

## 3. Canonical board records verified

All four canonical board records already exist, are active, and belong to Work Management. No board creation or replacement is required.

| Application  | Canonical board ID                     | Board status | Employee board membership |
| ------------ | -------------------------------------- | ------------ | ------------------------- |
| TimeTracker  | `46bf4ee7-368a-4c35-842c-8593ea1f6ac3` | active       | absent                    |
| Fund Tracker | `f36da8fe-8d9d-4629-9938-12533cb3ca39` | active       | absent                    |
| FuelTrack+   | `7af78b3f-67bf-4600-9aa1-9006d19d486e` | active       | absent                    |
| TradeLink    | `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` | active       | absent                    |

The canonical IDs match the frontend constants/resolvers. Duplicate names and trashed historical board records exist, but they are not the cause of this employee's empty active catalog.

## 4. Root-cause chain

1. The employee is an active Work Management workspace member.
2. The employee has enabled module assignments for all four applications.
3. The application-role setter writes those module assignments but does not provision native board membership.
4. The employee has no membership rows for the four canonical application boards.
5. `public.wm_list_boards('active')` excludes those boards for the employee.
6. `frontend/data.js` receives an empty board array.
7. The four route resolvers search that array for the existing board and return `null`.
8. The application routes display “board not found” and stop before native board initialization.
9. Even a direct board read would fail `public.work_board_access(...)` because the board membership is absent.

The displayed “board not found” message is downstream and imprecise: the records exist, but the signed employee cannot discover or read them under the current separate board-membership contract.

## 5. Population impact in Work Management

A read-only aggregate of active profiles, active Work Management memberships, enabled module assignments, and corresponding canonical board memberships found:

| Application  | Active assigned users | Missing board membership | Existing board membership |
| ------------ | --------------------: | -----------------------: | ------------------------: |
| TimeTracker  |                    39 |                       35 |                         2 |
| Fund Tracker |                    36 |                       34 |                         2 |
| FuelTrack+   |                    39 |                       35 |                         2 |
| TradeLink    |                    39 |                       34 |                         3 |

There are **35 distinct non-platform-admin users** with at least one missing corresponding native-board membership. This is a population-level issue, not isolated to the one employee used for the initial reproduction.

## 6. Functional code assessment

- Workspace selection/resolution: the target employee's database context resolves to the correct existing Work Management workspace in the read-only claim simulation.
- Application assignments: all four enabled module assignments resolve through `has_module_access`.
- Board catalog: correctly filters by existing `work_board_members` membership; the target has none.
- Board access: `work_board_access` correctly returns false without a board membership.
- Native route resolvers: use the board list and canonical IDs; they do not create boards. No canonical ID mismatch was found.
- No evidence supports changing `current_workspace_id`, `wm_auth_access_context`, RLS, role hierarchy, or generic board access semantics as a shortcut.

## 7. Required implementation decision

The business expectation is that assigning a user to a native application should make that application's existing board discoverable and readable. The current data model treats application-role assignment and board membership as independent grants. The implementation must make that relationship explicit rather than bypassing the board access contract.

Recommended next milestone: **CP-CRM-CONN-03A — Native Application Assignment-to-Board Membership Provisioning and Existing Assignment Reconciliation**.

Proposed behavior, subject to explicit approval for the permission change:

1. For an enabled application assignment, add `viewer` membership only to that application's existing canonical board in the selected active workspace when no board membership exists.
2. Preserve any existing `owner` or `editor` board membership; never downgrade or overwrite manually assigned roles.
3. Track which viewer memberships were provisioned by the application assignment flow so revocation removes only the membership created by that flow, never an independent board grant.
4. Keep module-role assignments authoritative for application-specific business capabilities. Board viewer membership provides board discovery/read access only; it does not grant edit/manage rights.
5. Do not create boards, duplicate board records, modify workspace membership, change RLS, weaken `work_board_access`, or bypass signed-session checks.
6. Reconcile only users with an enabled matching module assignment and an active membership in the target workspace; exclude protected platform administrators and inactive users.
7. Add disposable tests for assignment, re-assignment, revocation, manual owner/editor preservation, multiple workspaces, missing/trashed board, and idempotency.
8. Verify all four native routes with an actual signed employee session after the permission model is explicitly approved and deployed.

The current assignment population indicates up to 35 distinct users and 138 per-application missing memberships across the four modules (overlap between users is expected). No backfill was executed.

## 8. Changes and verification performed in this investigation

- Read-only inspection of the existing Supabase project `jtlusodorfnyzgyuewkz`.
- Read-only function-definition inspection for `current_workspace_id`, `wm_auth_access_context`, `wm_list_boards`, `work_board_access`, `has_module_access`, `module_role_for`, `wm_admin_set_application_role`, and `apsyntra_role_manage_user_access`.
- Read-only SQL claim simulation using an existing Auth session row; transaction-local settings only.
- Read-only comparison of module assignments, workspace memberships, canonical board records, and board memberships.
- Frontend route/resolver inspection for all four native applications.
- No production row, role, permission, board membership, workspace, credential, schema, or RLS changes.
- No migration or new Supabase project.

## 9. Acceptance status

| Criterion                                                    | Status                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Existing employee workspace identified                       | VERIFIED (read-only database claim simulation)                         |
| Four module assignments confirmed enabled                    | VERIFIED                                                               |
| Four canonical boards confirmed present and active           | VERIFIED                                                               |
| Missing native board memberships confirmed                   | VERIFIED                                                               |
| Native route failure chain identified                        | VERIFIED                                                               |
| Actual employee browser session re-tested in this turn       | PENDING (selected browser session was administrator)                   |
| Permission-provisioning design approved                      | PENDING                                                                |
| Existing assigned users reconciled                           | BLOCKED pending explicit permission-change approval                    |
| Four native applications accepted in signed employee session | BLOCKED pending board-access provisioning and live employee acceptance |

**Decision:** CP-CRM-CONN-03 investigation is complete. The functional failure is fully attributed to missing native board memberships after successful application-role assignment. The corrective step necessarily changes production permission records and therefore is not executed without explicit approval. No authorization policy or restriction was weakened.
