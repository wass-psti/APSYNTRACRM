# CP-BOARD-BASE01 — Item-only ordinary-board defaults, configured columns and selected delete

**Scope:** This checkpoint adapts the six annotated Contacts screenshots. The selected-record toolbar gains a controlled **single-item Delete** operation. Ordinary boards created through the APSYNTRA CRM UI use **Item** as their only default data column; **+ Add Column** is a separate command, not a persisted field. Existing boards are not automatically converted, and module-specific schemas remain intact.

## Verified authoritative backend contracts (read-only inspection)

- `wm_create_board` already creates **zero** physical `work_board_columns`, **zero** sample items, and one group. The old Status, Owner, Due Date and Actions headers are client-generated virtual/presentation columns.
- `wm_board_schema_mutate` requires a current GoTrue session, effective board `manage`, board timestamp CAS, and audits column creation/update/deletion. It refuses deletion if stored item values exist, and refuses unsafe type/config changes if values exist. It supports 11 column types.
- `wm_board_ui_save` is signed-manager-only, revision-CAS protected, writes audit, and preserves extra metadata keys in a valid `items` tab JSON object. The new schema marker is `schema_mode: item_only_v1` on that tab. The saved `primary_label` defaults to **Item**, but may be renamed without losing the mode. Unrecognized modes stay on the legacy presentation.
- `wm_delete_board_item` is an existing authenticated RPC that checks board `edit`, locks the board, blocks file-backed item deletion, and writes `item.deleted` audit. It **does not** implement an atomic `expected_updated_at` compare-and-swap. Do not advertise this action as CAS-safe under a concurrent edit.

## Frontend behavior

1. The main UI's **New board** flow calls the existing signed board-creation RPC and then initializes its existing signed board-view settings to `Item` with the mode marker. It verifies current signed user, workspace, ordinary active board, `manage`, and zero items/columns. It does not create any physical default column, demo content, or an unapproved application record.
2. A failed settings write after successful board creation **never retries the create**. It reports the partial state; the authorized board manager can open **Manage columns** and explicitly choose **Use Item-only layout**. This two-RPC flow is **not atomic**. Enforcing a truly indivisible system-wide default across all API clients requires a separately approved backend creation/settings transaction.
3. Ordinary boards with verified `item_only_v1` settings render only **Item** and authorized physical custom columns; Status, Owner, Due Date and Actions are not auto-rendered. The `+ Add Column` table-header button opens the existing server-backed creation workflow for managers.
4. The existing Manage columns panel retains Item's primary schema identity while permitting a persisted display name. Custom columns can be created, renamed, retyped if safe, configured with Status/Dropdown choices, hidden, and deleted only when empty. Their rows and values stay in PostgreSQL. Existing board data and module-defined fields are not modified. For Item-only boards, authorized custom-column order is persisted inside the signed board settings through revision CAS and audit; device-local preferences remain for widths, user-specific visibility and legacy layouts.
5. The selected-record toolbar has **Delete item**, available only with **exactly one selected editable ordinary-board item**. It requires the exact item name in a confirmation dialog, rechecks current GoTrue identity, workspace, server edit permission, item title, board and update timestamp, and then calls the existing signed server delete RPC. A fresh read confirms absence; authoritative item deletion audit is independently checked when available. Multi-item permanent deletion is unavailable; no non-atomic deletion loop is introduced.

## Safety boundaries

- Existing Contacts and every prior ordinary board retain their old presentation unless a manager **explicitly** opts into Item-only mode. No existing columns, values, rows, audit events, or protected domain records are deleted by the default-layout change.
- Deleting a real item is irreversible and may cascade to its item-value records. It occurs **only** after a real user's explicit item-specific dialog confirmation, not from migration, tests, auto-retry, or page initialization.
- The delete RPC lacks server-level revision CAS and independently enforced GoTrue session revocation. A frontend re-read does **not** remove its time-of-check/time-of-use race window. Strict session binding, atomic conflict denial and multi-item all-or-nothing delete require a separately reviewed and authorized backend RPC. This checkpoint does not claim those guarantees.
- Custom column update/delete still follows existing DB CAS and data-preservation checks. Physical column order is not yet written to the server. No authorization grants, production schema changes, or test records are applied by deploying this frontend.

## Acceptance checklist and status

- [x] Source integration for Item-only metadata and explicit Add Column command — **IMPLEMENTED**.
- [x] Existing board presentation defaults remain unchanged until explicit opt-in — **IMPLEMENTED**.
- [x] Signed server column manager retained; primary label renaming preserves mode — **IMPLEMENTED**.
- [x] Single-item confirmed delete action integrated with existing signed RPC — **IMPLEMENTED**.
- [ ] Genuine signed create board, page refresh and sign-out/sign-in persistence — **PENDING live browser evidence**.
- [ ] Live manager/editor/viewer and foreign-workspace denial; item delete audit — **PENDING real signed sessions**.
- [x] Item-only custom-column display order persisted with signed CAS settings and audit — **IMPLEMENTED; live two-session acceptance pending**.
- [ ] Atomic board creation/settings transaction for every API client — **PENDING backend design and separate production permission approval**.
- [ ] Atomic multi-item permanent delete, server-side stale CAS and revocation binding — **BLOCKED until separate backend review/approval**.
- [ ] Measured frame pacing, keyboard accessibility and mobile scroll testing — **PENDING real browser measurement**.

The GitHub CI and deployment results must be recorded against exact commit SHA separately; they cannot substitute for production session acceptance.
