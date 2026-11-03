# CP-BOARD-ROW01 — Genuine signed-session fixture acceptance

**Status:** IMPLEMENTED-UNVERIFIED (browser acceptance), until an independently authorized disposable ordinary board and real signed operator are available.

## Scope and prerequisites

This runner is an explicit in-app operator action. It uses existing signed GoTrue and central board RPCs, never SQL admin credentials, and never modifies domain-managed records. It cannot run against the reserved APSYNTRA QA board or the existing Contacts board.

A dedicated **ordinary, active, empty board** must already be approved and configured with the **exact** name `APSYNTRA ROW01 QA` and exact description `[APSYNTRA:ROW01:FIXTURE:v1]`. It must have exactly one group and zero existing board items. This marker is an operator/test scoping requirement, **not** a replacement for server-side RBAC or authorization to create a production test board. Production board creation or changing an existing board description needs its own applicable approval.

Before any write, the runner checks the actual GoTrue user, active workspace, scoped board detail, ordinary-board classification and server `edit` permission. It refuses an occupied fixture or an existing unfinished acceptance journal. **No test fixture is created automatically.**

## Operator execution on deployed GitHub Pages

1. With the authorized, genuine signed user, visit the approved fixture board's **Board items** view. Its ROW01 acceptance panel appears only for the exact fixture.
2. Select **Start controlled signed ROW01 acceptance**, review the confirmation and accept it. One uniquely named QA record is created through `wm_add_board_item`; a fresh board read must confirm its identity and ownership. The record title is edited using `wm_set_board_cell_if_current` with NULL column ID and matching old title, and another read verifies persistence.
3. Submit an obsolete expected title against that same cell. The server must deny it with HTTP 409 and SQLSTATE `PT409`; a fresh read must confirm the new title was not overwritten.
4. The panel reports `AWAITING_RELOAD`. **Reload the entire browser tab** (not only the board Refresh button). Under the same signed user and workspace, select **Verify browser reload, audit and cleanup**. The record must still have the edited title after the reload and independently retrieved board read.
5. The runner deletes **only** the exact test item whose server item ID, board, group, `created_by`, and unique QA title match the journal. It verifies absence and then reads `wm_list_board_events` to confirm `item.created`, `item.cell_updated`, and `item.deleted` for that record and signed actor. Copy the **nonsecret result** for the checkpoint report.
6. Independently reconcile the audit in an approved, read-only Supabase inspection and verify no residual test item remains before final acceptance.

A short-lived journal stores only the relevant fixture UUIDs, signed actor UUID, QA item ID/title, creation timestamp and a browser-boot marker in this tab's `sessionStorage`. It stores **no JWT, password, bearer token, or personal record payload**. The app never executes QA writes automatically on page load or after reload. If the user signs out, switches workspaces, loses access, closes the tab, or the network fails, the journal/item must be reviewed and recovered manually. The runner never retries an uncertain create and never deletes any record whose exact owned-test identity cannot be confirmed. The test may temporarily leave its test item if finalization is not completed.

## Acceptance classification and limitations

- Signed fixture eligibility, identity, create/read, inline CAS edit, exact stale-conflict denial, browser-reload persistence, owned-item cleanup and audit must all pass on the deployed site to classify the positive write path as **VERIFIED**.
- Negative role/write denial requires a separate genuine noneditor session in a properly approved test scenario. A mocked denial is **not** signed evidence.
- Immediate session revocation, expired JWT, foreign workspace access, concurrent write races, and complete module-specific workflows are **not covered** by this ROW01 happy-path runner; track them in their independent security checkpoints.
- No unapproved production SQL, RLS, roles, workspace memberships, credentials, operational business records or attendance data may be changed.
- GitHub frontend/isolated Postgres tests establish **implementation and regression evidence only**. They do not establish a real signed browser PASS.

## Current production preflight — November 3, 2026

Read-only inspection of the existing Supabase project found **zero** boards with the exact ROW01 fixture marker. The currently open `Contacts` board has four items; the zero-item `APSYNTRA QA` board is protected. Neither is an eligible fixture. As a result, no signed ROW01 mutation acceptance was performed in this checkpoint. A separately approved and identified empty ordinary fixture is required before executing steps 1–6.
