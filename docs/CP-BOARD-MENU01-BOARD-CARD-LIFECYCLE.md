# CP-BOARD-MENU01 — Board card Edit, recoverable Delete and Restore

**Status: STAGED / production lifecycle RPC NOT DEPLOYED.** The board card feature switch remains `BOARD_CARD_LIFECYCLE_ENABLED=false` until a separately scoped production schema and permission-change approval.

## Root cause

The existing three-dot marker was a noninteractive `<span>` inside an `<a class="board-card">` link. The API already exposed `wm_update_board`, `wm_set_board_status` and `wm_delete_board_permanently`, but the first allowed ordinary `edit` access (not board `manage`), and the older functions did not distinguish the 12 provisioned APSYNTRA application boards or the APSYNTRA QA board from user-created boards. A frontend-only dropdown could not satisfy the requested authorization and protected-board rules.

## Implementation

- `frontend/board-card-lifecycle.js`: default-disabled session-aware manager client with board identity, original `updated_at` CAS, strict confirmation, input validation, response identity checks, and explicit module/QA protection. No local-only persistence.
- `frontend/app.js`: card link and menu are separate interactive elements, avoiding nested clickable controls; menu uses native `details/summary` for mouse, touch and keyboard. Edit opens prepopulated fields; Delete requires the exact board name and explains that all contents are retained; Restore is available on the new Trash view. The current page refreshes data from server-side lists without reloading the document. Menu closes on outside click, Escape, and action.
- `frontend/styles.css`: scoped dropdown placement, keyboard-focus outlines, open-card stacking, responsive menu width; board grid layout and scroll rules unchanged.
- `sql/cp-board-menu01-staged-lifecycle.sql`: immutable protection snapshot for current `[APSYNTRA:MODULE:*]` domain boards and APSYNTRA QA, plus dynamic protection of later tagged boards; one transactional, signed-session CAS API `wm_board_card_mutate` for `edit`, `trash`, `restore`. Only effective board managers may call it; schema-drift and stale updated-at errors fail closed. It audits successful changes and never permanently deletes board items.
- In the same staged migration, preserve the old RPC names but harden `wm_update_board` and `wm_set_board_status` to require live signed sessions and manager authority and reject protected boards. **Revoke `wm_delete_board_permanently` from ordinary clients**, because this feature provides only reversible trash.
- `sql/cp-board-menu01-fail-closed-rollback.sql`: disables the new card writer and leaves protection, hardened legacy paths, board content, audit and trashed items intact. It does not restore weaker privilege grants.

## Production compatibility and scope

Existing board IDs, groups, column schemas, items, memberships, file metadata, TimeTracker/FRT/module data and authentication providers are unchanged. Newly provisioned module-marked boards are protected without client role assumptions. The UI does not infer server RBAC from an email, profile label or card ownership alone.

**Release caveat:** The existing legacy board writer API has no CAS token, though the staged hardened wrapper enforces signed-manager and protected-board checks. All *new menu* actions require the exact `updated_at` token. Review downstream consumers before applying legacy hardening. Permanent delete intentionally becomes unavailable to normal authenticated API callers.

## Evidence and gates

- GitHub workflow `.github/workflows/apsyntra-board-menu.yml` exercises disposable PostgreSQL 17 source-fingerprint preflight, manager edit, stale-denial, name conflicts, exact-name confirmation, reversible trash/restore, audit integrity, denial for protected boards/editor/foreign workspace/expired session, and fail-closed rollback.
- Frontend tests cover action payloads, default-off behavior, protection, denial and role filtering, XSS-safe markup and UI event/restore wiring.
- **Production: NO CHANGE**. SQL is a candidate. The new lifecycle feature remains disabled until the explicit owner approval for this *new* schema/function permission-change scope, successful production preflight, and genuine signed-user integration.
- Never execute permanent deletion as a fallback for trash failure. Do not delete boards, records or dependencies during acceptance tests.
- After controlled activation, confirm genuine signed manager/editor/viewer requests and production rollback readiness; then enable the frontend flag and run live Pages browser regression.
