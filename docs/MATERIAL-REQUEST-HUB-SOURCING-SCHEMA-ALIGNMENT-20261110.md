# Material Request Hub — Material Sourcing schema alignment

**Scope:** APSYNTRA CRM Material Request Hub board `617c4c0f-e343-4b3b-8456-50d47dcbaf99`, existing WatchdogWorkspace/Supabase project only.

## Verified production baseline (read-only, November 10, 2026)

- Board: `Material Request Hub`, active.
- Existing group: `Main group`, ID `21566a87-b287-4a61-b521-bb233956e09e`, position 0. **Never rename, replace, delete, or move it** in this alignment.
- Existing custom columns: 8, all retained: Source Record ID, Source Revision, Sync State, Request Ref, Request Date, Quantity, Approval Status, Stock Ref.
- Existing board items: 0 at inspection time. This is time-sensitive; must re-read before any actual mutation.
- Server RPC `wm_board_schema_mutate`: signed board-management check, optimistic `updated_at` check, max 30 custom columns, event audit, one column mutation per call.
- Board projection uses `boardGridColumns` and module allowlist with `allowCustom`; custom columns may become visible to ordinary authorized board readers unless a separate field-access contract is established.

## Reference mapping

Primary Item/title presentation target: **Part number**. This is display text only, not an ID or title data rewrite. The screenshots show an Engineering Services group, but **the actual group remains exactly Main group**.

Existing `Quantity` is reused. The additional 22 columns, in reference order, are defined by `frontend/material-sourcing-schema-plan.js` with numeric/date/text/dropdown/people types and explicit exposure classification. 8 existing + 22 new = **30** supported custom columns; the primary Item is separate.

Source Type labels: Local, Import. Currency labels: PHP, USD, EUR. No reference rows, prices, vendors, identities, or exchange-rate values are imported.

## Security and activation blockers

The authoritative `board-manifest.js` marks **Requester identity** and **Cost and supplier contract** as restricted domain information. The existing generic board-column projection does not implement an independently verified field-level RBAC/RLS contract for these commercial/personnel fields. Merely setting column `visible=false` is **not** authorization and must not be used as a substitute.

Consequently, adding the sensitive reference columns as ordinary board fields is **BLOCKED** until backend data-access and field-scoping contracts are separately verified, including denied/read paths, workspace isolation, role revocation, and audit. No direct SQL or bypass of `wm_board_schema_mutate` is permitted. Pricing, vendor, requester and accounting fields require this review before exposure.

The five marked derived fields (PHP Equivalent, Shipping Cost PHP Equivalent, Landed Buying Cost, Total Landed Buying, Total Cost (VAT-IN)) are **numeric placeholders only in the proposed schema**. No automatic formulas are implemented; currency precision, exchange-rate source/version, date, VAT basis and rounding require explicit business acceptance. No financial values are fabricated.

**Production schema changes are not executed by this milestone.** The manifest and planner are deliberately read-only; authorized activation requires separate review of a production board mutation and evidence of safe field permissions. Never deploy or run an automatic batch merely because tests pass.

## Evidence and acceptance

- Unit tests: `node --test frontend/tests/material-sourcing-schema-plan.test.mjs frontend/tests/board-structure-admin.test.mjs frontend/tests/board-column-catalog.test.mjs`.
- Existing `Quantity` is never duplicated. Group ID/name and all eight domain columns remain unchanged in the test fixture.
- Plan fails closed for wrong board, changed group identity/title, domain-type drift, duplicate names or capacity overrun.
- No database migration, group mutation, item creation, role/permission changes, telemetry, or new project.
- After a future approved signed activation, re-read the board, compare each saved column type/config and count, confirm unchanged group ID/name and eight original column IDs, verify normal/denied access, and check board horizontal scrolling and persisted values. Do not claim these checks until observed.

**Milestone result:** Reference-to-schema design prepared and verified locally; production alignment **BLOCKED** by field-authorization and financial-semantics prerequisites. Do not create a new arbitrary priority until these are resolved.
