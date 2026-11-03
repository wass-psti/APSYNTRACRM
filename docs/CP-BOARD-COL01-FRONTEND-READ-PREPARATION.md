# CP-BOARD-COL01 — Frontend read-only integration preparation

**Status:** Frontend-only and explicitly **disabled**. No production backend, SQL, grants, RLS, accounts, roles or storage configuration changed.

The board-item drawer now integrates a signed read-only adapter for `wm_list_board_item_updates` and `wm_list_board_item_files`. Until the independent security review, production authorization migration, genuine revoked/expired GoTrue signed HTTPS checks and Pages acceptance are verified, `BOARD_COL01_ITEM_READS_ENABLED=false`. In that state **no new collaboration RPC requests occur** and the drawer displays a pending-activation message.

Once separately approved, the adapter requests up to 50 records from each server-scoped RPC, rejects mismatched item identifiers and malformed payloads, and escapes user-provided text. File rendering omits Storage keys, URLs and download controls. A denied API call fails closed with no table-read fallback or partially rendered data. The app revalidates signed board access before loading and rechecks actor/workspace/board identity after asynchronous resolution.

`frontend/tests/board-collaboration.test.mjs` covers disabled network silence, authorized mocked RPC shape, cross-item denial, malformed responses, HTML escaping and no permission-changing API. Tests do **not** constitute real cloud authorization acceptance. Do not enable the gate solely because frontend CI passes.

The shared Work Management backend and [independent approval gate](https://github.com/wass-psti/APSYNTRACRM/issues/29) remain unchanged.
