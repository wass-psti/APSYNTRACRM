# CP-TL-BOARD-ITEMS-01 — TradeLink Board Items first

## Scope
Target existing **TradeLink** board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`, not the TradeLink source application. Source integration stays out of this checkpoint.

Requested display order (exact):
1. **Item** — main record title
2. **Person** — typed `people`, scoped to an authorized user
3. **Workflow Status** — typed `status`: For Approval, Submitted, Approved, Draft
4. **Quote Status** — typed `status`: Submitted, Won, Expired, Closed, Under Negotiation, Delivered, Canceled, On-Hold, Lost, Working on it, Approved
5. **Date** — typed `date`
6. **Files** — reserved attachment display, **uploads not yet implemented**
7. **Amount** — typed `number`

## Verified pre-change live database (read-only, 2026-11-04)
- Board is active, v1 managed TradeLink module, with **one group and zero items**.
- Eight v1 lineage/domain columns exist (Source Record ID, Source Revision, Sync State, Trade Ref, Trade Date, Request Stage, Trade Status, Partner Ref).
- Production board column normalization supports `people`, `status`, `date`, `number`; it **does not** support `attachment`.
- Existing `wm_board_schema_mutate` enforces an active signed session, server-side `work_board_access(...,'manage')`, optimistic concurrency against board updated_at, a 30-column ceiling, value safety and audited custom additions.
- No TradeLink attachment Storage bucket was found; existing TradeLink attachment-reconciliation data is not a native Board Items upload API.

## Implementation
- `frontend/tradelink-board-items.js` defines an exact board-identity-scoped profile and safe status vocabularies.
- `frontend/board-grid.js` renders exactly the seven requested display headers on TradeLink, omitting obsolete lineage/technical columns **from presentation only**, without modifying their stored contracts.
- `frontend/app.js` displays a **Configure TradeLink columns** action only to a server-verified board manager. Activation is never automatic on page load. A click uses the existing signed `BoardStructureClient.mutate` and performs five additive CAS-protected typed column creations, re-reading live details for each step. It resumes safely if interrupted, refuses inconsistent existing fields, and verifies the final snapshot.
- The new `Files` column is a **nonfunctional, explicit placeholder**. It cannot upload, download or attach files. A separate, reviewed private storage/RLS/metadata/permissions lifecycle must exist before activation.
- The Person value is not resolved to a display name until an authorized directory read is integrated; raw user UUIDs are deliberately not displayed.
- Legacy columns, item rows, server permissions, audit records, and v1 module contracts are not deleted or rewritten.

## Acceptance boundary
This commit does **not** claim to have run the signed setup button, changed production schema, or accepted live browser behavior. Run an authorized signed browser activation; confirm five typed custom columns appear with their exact status options and display headers; test denial for nonmanager, revoked session and foreign workspace; then independently verify GitHub Actions, CDN assets and visible state.

**Files upload remains a separate implementation milestone.** Never use a plain URL/text field and claim it is a secure attachment column.
