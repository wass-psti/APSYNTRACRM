# Material Request Hub — Secure Sourcing Field Authorization and Controlled Board Activation

**November 10, 2026 — implementation evidence / controlled activation boundary**

## Root cause confirmed in live existing backend

The existing `public.wm_get_board(uuid)` SECURITY DEFINER function only checks `public.work_board_access(board,'view')` and then returns **every** `work_board_columns` row and `work_board_item_values.value` for that board. The generic frontend filter is not a server authorization mechanism. A board viewer can observe values through the HTTP response even if a UI hides them. Thus prices, account terms, vendor details and requestor identities MUST NOT be written into the generic board value table under the current contract.

Existing Material Request Hub business role checks in the source DB use `private.material_request_hub_current_role(workspace_id)`, which verifies enabled active module membership, active workspace membership, and active profile. No permission changes were made or proposed for existing platform roles.

## Implemented in source code (not activated in live data)

- `frontend/board-grid.js` now fails closed for the known restricted Material Sourcing column names, even when `allowCustom=true`. This is frontend defense in depth only, not data security.
- `frontend/material-sourcing-controlled-activation.js` implements a **not-wired** explicit-approval, signed manager-only, revision-protected activation operation for the **six ordinary fields** only. After each successful RPC, it refetches authoritative board state and checks column identity/type, exact original group ID/name, session/workspace and privileges. It never auto-retries an ambiguous mutation or creates restricted or derived financial fields.
- `sql/mrh-sourcing-sensitive-vault-CANDIDATE-NOT-APPLIED.sql` is a review-only security candidate. It stages separate `private`-schema cell storage and per-request authorization RPCs, with a default ADMIN-only module role ceiling, board-view/edit requirement, workspace and item binding, RLS enabled, no direct table grants, optimistic revisions, and value-free audit metadata. It does **not** modify `wm_get_board`, generic board data, or existing permissions.
- Derived fields **PHP Equivalent, Shipping Cost PHP Equivalent, Landed Buying Cost, Total Landed Buying, Total Cost (VAT-IN)** are deliberately not writable via the candidate RPC. Currency/VAT/exchange-rate semantics need verified business rules before calculation or population.
- Tests prove public-column activation is idempotent in a mock authoritative API, denies foreign workspace or changed group, and does not emit blind write retries. Disposable PostgreSQL verifies role denials, auth expiration, direct table grant denial, invalid currency, stale revision rejection, authorized reads/writes and RLS enablement.

## Actual production baseline remains untouched

Target board `617c4c0f-e343-4b3b-8456-50d47dcbaf99`, original group `Main group` ID `21566a87-b287-4a61-b521-bb233956e09e`, position 0, eight existing columns including Quantity. This source change creates **zero** production columns, groups, items, secrets, role assignments, or RPC installations. No additional Supabase project.

## Outstanding release gates

1. **Material authorization:** Review and explicitly approve the deployed role-to-field matrix. Candidate conservatively permits only active Material Request Hub `ADMIN` members with authoritative board permissions. Determine whether selected APPROVER / REQUESTOR / FINANCE responsibilities require narrow access. Do not infer authorization from general board manager or workspace admin alone.
2. **Security changes:** Separately authorize the production creation of the restricted vault, new RPC EXECUTE grants, and public-column writes. This changes production database schema and permissions and cannot be applied under routine non-destructive code authorization.
3. **Server-side isolation:** Confirm no other direct RPC/REST/realtime/export endpoint can expose restricted values, and ensure future UI uses only the dedicated protected RPC for commercial/requestor data. Existing ordinary board value storage remains prohibited for those fields.
4. **Finance rules:** Establish currency source and timestamp, precision and rounding, VAT basis, shipping allocation, and authoritative formula dependencies; never invent exchange rates or VAT calculations.
5. **Real signed acceptance:** Following separately approved nonproduction/staging deployment, test ADMIN read/write, nonADMIN denied read/write, revoked/expired sessions, cross-workspace/foreign-board requests, concurrency conflicts, audit redaction, and authorized app rendering. Passing a disposable fixture alone is not production acceptance.
6. **Controlled board activation:** Verify current 8 original column IDs/values and exact group title/ID; invoke explicitly authorized six ordinary-column CAS sequence; keep all remaining fields deferred; verify persisted schema and event log. No uncontrolled writes or blind retries.

**Milestone disposition:** Safe source-level access contract and activation mechanism implemented; **full live board activation BLOCKED** by required production security/data approvals and business rules. No additional priority should be invented unless an actual tested defect requires one.
