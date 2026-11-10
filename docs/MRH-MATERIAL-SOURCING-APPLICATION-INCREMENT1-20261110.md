# Material Request Hub — Material Sourcing Application, Increment 1
**November 10, 2026 — signed part creation and private item-level sourcing fields**

## Scope / reference
Eight user-provided Monday.com reference screenshots establish part-number rows, horizontal column groups, source type, brand, quantity, RFQ, vendor, prices, currencies, shipping, totals and lead time. They are **visual/field references only**, not authorization to import records or duplicate the Monday dataset.

Board: `617c4c0f-e343-4b3b-8456-50d47dcbaf99`. Original `Main group` title and ID `21566a87-b287-4a61-b521-bb233956e09e` are immutable in this increment. No sample rows or group renames.

## Implementation

- `frontend/material-sourcing-application.js`: dedicated, opt-in Material Sourcing item operations using only the existing authorized WatchdogWorkspace backend. New part-number creation revalidates actor, active workspace, board EDIT, domain ADMIN role, and original group before the existing audited `wm_add_board_item` RPC; rereads its receipt and never retries ambiguous writes automatically.
- Private field reads use **only** `mrh_sourcing_sensitive_read(board_id,item_id)`, not `wm_get_board` or generic cell values. Both before and after the network response the client verifies user, workspace, board view, and domain ADMIN. Invalid response schemas and expired/revoked sessions fail closed.
- Private field edits use `mrh_sourcing_sensitive_write` for one of the **eleven** server-allowed fields with exact item scope, typed validation and expected revision. A write result is confirmed by a fresh protected read. No sensitive input is placed in localStorage, CSV exports, public board cells or telemetry.
- The existing board's **New part number** action is available to signed editors on the Material Request Hub board; the authoritative module role check prevents non-ADMIN creation through this client. It creates the record only on deliberate user submission. No background or automatic data writes.
- Existing item details drawer gains responsive, keyboard-accessible protected fields for current signed ADMIN. A denied user receives no secret field data. The protected DOM is cleared when an item drawer is closed or the session, board, or workspace changes.
- Derived financial outputs — PHP Equivalent, Shipping Cost PHP Equivalent, Landed Buying Cost, Total Landed Buying, Total Cost (VAT-IN) — remain deliberately disabled. Currency rates, allocation rules, tax basis and rounding have not been assumed.
- Existing Material Sourcing schema alignment button remains separately signed and explicitly confirmed; this increment does not activate ordinary columns, change RLS/RBAC, or install a new backend.

## Verification and limitations

Run `node --test frontend/tests/*.test.mjs` plus the repository's frontend/SQL CI. Tests include valid and denied roles, foreign workspace, revoked sessions, invalid values, stale versions, HTML escaping, original group preservation, no generic cell disclosure, and signed part creation.

**Acceptance limitations**: The actual production board contained 0 items and 8 original custom columns in the last authoritative check. Therefore production part creation, protected value persistence after refresh, and signed non-ADMIN denial are **PENDING**; passing tests do not establish live production functionality. No user accounts or mock production documents were created. Full Monday screenshot column parity and financial formulas remain subsequent requirements.

**Next evidence-based increment** (only if not already satisfied): signed live ADMIN part-create / reload / protected price CAS acceptance plus non-ADMIN and cross-workspace denial, then structured reference-column projection and validated finance semantics. Stop if evidence establishes closure; do not create unrelated roadmap checkpoints.
