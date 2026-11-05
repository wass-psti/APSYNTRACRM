# CP-BOARD-INLINE-01 and CP-BOARD-BULK contextual increment

Date: 2026-11-05
Repository: `wass-psti/APSYNTRACRM`
Status: IMPLEMENTED — AUTOMATED CI / DEPLOYMENT VERIFIED — GENUINE SIGNED-BROWSER ACCEPTANCE PENDING

## Evidence and scoped milestones

**Contextual board columns**
- Column-header three-dot menus no longer redirect custom column edits or deletion through `openBoardStructure()`. They open scoped forms directly on the current board.
- Primary `Item` title column is renameable using `wm_board_ui_save` but cannot be deleted.
- Custom columns support contextual rename, same-type option/configuration editing, compatible type conversion on empty fields only, server-authorized visibility changes, bounded width, drag/reorder, local hide/restore via the existing Columns panel, and deletion of *empty* custom fields after typing `DELETE <exact name>`.
- Deletion of populated custom columns is deliberately denied before mutation. The backend also protects nonempty, domain, primary, and relationship-sensitive columns.
- The redundant toolbar **Manage columns** control was replaced by **Add column**, opening a small in-place dialog. Advanced board view settings remain reachable from Board options; no capability was silently deleted.
- Every contextual schema write reuses the existing board structure client, server-side manager authorization, verified active signed session, board/workspace identity, expected revision (CAS), and board audit behavior.
- Escape dismissal, focus trapping, focus restoration, and contextual keyboard controls are supported by the existing overlay/menu and revised modal behavior. A board data refresh occurs after a successful write; there is no full-page navigation.

**Bulk selection and actions**
- The selection toolbar retains row, group-visible Select All, Shift-range, cross-filter selection scope, CSV export, and clear-selection.
- For an ordinary authorized board, one **Bulk actions…** dialog now exposes the only currently supported atomic write operations: **Status update** and **Archive**. It operates on 1–50 selected items and uses the existing signed server `wm_board_bulk_mutate` RPC with per-item revision CAS and audit.
- Server-side `wm_board_bulk_mutate` and `wm_board_group_cas` are present in production. Read-only metadata confirms authenticated EXECUTE, not anonymous EXECUTE, checks for active signed session, protected boards, and expected revisions.
- The client also forbids generic mutations on every named APSYNTRA module board, including TimeTracker Attendance, even if a module marker is absent. Its generic atomic writer **cannot** be reused for restricted GPS, attendance, payroll, OT, or domain-owned fields.
- Ambiguous network/server/receipt outcomes after a bulk mutation are nonretryable and clear the current selection and activation before refresh; definitive 4xx authorization/CAS denials remain distinct.
- The existing atomic backend supports `restore` but archived-item selection/restore UI is still pending.
- Bulk custom field editing, dates, assignees, and multi-record delete do **not** yet have an approved backend batch contract. They are PENDING, not silently simulated by unsafe frontend loops.
- For TimeTracker the safe, currently available batch actions are selection, permitted read/export, and clearing the selection. TimeTracker-specific bulk writes require a new domain-reviewed backend contract and separate activation.

## Files changed

- `frontend/board-inline-context.js` — contextual field eligibility, stored-value checks, type-change guard and exact deletion confirmation.
- `frontend/app.js` — focused column CRUD dialogs and removal of routing to Manage Columns; one contextual atomic bulk-actions dialog, selection state and error recovery; accessible modal focus/keyboard behavior.
- `frontend/board-bulk02-client.js` — stronger domain exclusion and uncertainty handling for signed atomic actions.
- `frontend/styles.css` — visually consistent contextual modal hidden-field and focus behavior.
- `frontend/tests/board-inline-context.test.mjs` — ordinary manager and domain denial, safe type conversion, deletion safeguards, contextual UI mapping.
- `frontend/tests/board-bulk-contextual.test.mjs` — denied TimeTracker mutations, uncertain commit and definitive CAS outcomes, safe action options.
- `frontend/tests/board-virtual-columns-and-bulk.test.mjs` — updated toolbar workflow contract.
- `scripts/pages-smoke.mjs` — verifies both new/modified frontend modules ship with Pages.

## Tests and deployment

- [Frontend Validation — 1011/1011 tests and all disposable PostgreSQL jobs PASS](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41986825000).
- [GitHub Pages code deployment — SUCCESS for the same code commit](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41986824615).
- Code checkpoint: `2a05917a9a11c3e39dd750e10ab1649ae5043add`.
- Live, signed-browser acceptance has **not** been completed in this chat; connected browser inspection was unavailable from the originating session. Do not infer production item mutation or persisted audit acceptance from source/CI success.

## Scope and acceptance tracker

| Requirement | Classification |
| --- | --- |
| Contextual column rename/create/edit/delete and separate deletion confirmation | VERIFIED by automated tests |
| Primary Item/domain authorization, manager ceiling, CAS, no data-loss conversion | VERIFIED by automated tests and existing server contracts |
| No mandatory Manage Columns navigation | VERIFIED by static regression |
| Keyboard/Escape, focus and board-level regression | VERIFIED by automated tests; manual accessibility acceptance pending |
| Build, CI and deployed Pages source assets | VERIFIED |
| Genuine signed-browser CRUD, persistence after refresh, concurrent denial and audit | PENDING |
| Existing board/group/row/cell/bulk workflows | IMPLEMENTED-UNVERIFIED in genuine browser |
| Generic atomic Status / Archive | VERIFIED by contract/automated tests; signed mutation still pending |
| TimeTracker protected domain bulk writes | BLOCKED pending a domain-specific authorized writer |
| Bulk arbitrary custom fields, assignments, dates, delete and archived-item restore UI | PENDING |

**CP-BOARD-INLINE-01 milestone: 4/5 stage criteria (80%)** — implementation, automated security regression, CI, and deployment verified; real signed-browser acceptance outstanding. This percentage does not describe the whole requested board/bulk system.

## Next required gates

**CP-BOARD-INLINE-02 — Unified Board Contextual Actions.** Complete equivalently contextual board, group, row and cell controls and test manager/editor denials, without overhauling existing working features.

**CP-BOARD-INLINE-03 — Redundant Workflow Removal.** Keep advanced view management discoverable while removing only superseded Manage Columns controls and redirects.

**CP-BOARD-INLINE-04 — Genuine Signed-Session Persistence, Concurrency and Audit Acceptance.** Test ordinary-board column create/rename/change/hide/delete through Pages, reload, audit, restricted user, foreign workspace, stale revisions and denied protected module attempts.

**CP-BOARD-BULK03 — Authorized Domain-Specific Bulk Mutation Contracts.** Separately design, stage and security-test TimeTracker attendance review bulk workflows. Do not permit generic attendance, GPS, payroll or OT mutations. For ordinary boards, stage additional typed field/date/assignment/delete atomic contracts and obtain separate approval before any production schema/permission activation.

No production database data, roles, SQL, RLS, credentials or policy mutations were performed for this increment.
