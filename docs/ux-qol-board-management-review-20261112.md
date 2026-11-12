# APSYNTRA CRM — UX/QoL review (2026-11-12)

## Verified priority and completed scope

**P0 — Board move-to-Trash confirmation** (`frontend/app.js`, `frontend/board-card-lifecycle.js`). Current UI demanded manually retyping a potentially long board name although the operation is reversible through the Trash tab. Replaced this with an explicit, board-named **Move to Trash** modal, a visible recovery statement, Cancel-first initial focus, a distinct destructive submit style, and an operation-specific success toast. The confirmed snapshot's exact original name is sent to the **unchanged** `wm_board_card_mutate` RPC; signed board-manage permission, original board updated-at CAS, protected-board exclusion, workspace identity checks and post-write receipts remain authoritative. No permanent delete API is introduced.

**P1 — Shared modal feedback and keyboard focus** (`frontend/app.js`). Existing no-input dialogs could open without moving keyboard focus into the modal and success always said "Changes saved", including moving an entire board to Trash. The shared component now selects a safe Cancel control for destructive operations, a fallback Cancel control for no-input dialogs, and accepts an optional explicit success message; Enter cannot submit a destructive dialog merely because it opened. Create Board now has a precise button label and a creation-specific success toast. Existing dialog buttons and focus trap are preserved.

## Additional friction reviewed — intentionally not expanded into unrelated changes

| Workflow / observed UX | Next appropriate action | Why excluded from this increment |
|---|---|---|
| Set board column width uses `window.prompt` with pixel arithmetic | Replace with keyboard-friendly inline number/slider control with reset and preview, using existing per-user layout persistence | Non-destructive QoL, independently testable; avoid mixing unrelated column behavior with board Trash release |
| Advanced board column management uses a few browser prompts | Consolidate only reversible display changes into shared accessible dialogs | Physical schema operations and saved values have different integrity requirements |
| Delete one item requires exact title text | First add a server-side revision/CAS guarantee before considering simpler destructive confirmation | Item deletion is permanent; current item RPC lacks server-side row-revision CAS |
| Populated custom-column deletion requires explicit phrase | Keep exact deletion confirmation and transactional recovery until the complete signed behavior is verified | Deletion affects persisted cells; separate from reversible board Trash |
| Empty group deletion uses `window.confirm`; managed TimeTracker group uses an exact phrase | Consistent accessible dialog could replace the browser confirm where no more risk exists | Actual group deletion is irreversible; preserve each board module's established checks |
| Workspace/role changes and technical QA operations include explicit approvals | Keep authorization and QA-scoped acknowledgements | Privilege, workspace isolation, or production risk; not ordinary UX friction |
| Board creation and board-card restoration | Existing create navigates to the board; restore returns the board to Active and displays success. Updated the generic creation label/toast only | No remaining blocker warranting broader changes |

## Acceptance criteria

- Authorized user can select **Move to Trash**, see the exact escaped target and consequences, confirm once, and restore from Trash without manually typing the name.
- Cancel, Escape, and backdrop dismissal make no writes. The destructive action is never the initially focused control.
- A duplicate submit cannot dispatch a second operation while the first is pending; stale revision or denied access remains a server error and the dialog remains available to dismiss.
- All other board, item, group, role, storage and authentication contracts remain untouched.
- Signed production browser move/restore still requires a designated disposable QA board; never delete or trash a business board just to prove acceptance.
