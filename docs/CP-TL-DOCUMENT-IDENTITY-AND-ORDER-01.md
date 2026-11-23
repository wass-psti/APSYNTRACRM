# CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01

## Objective

Standardize the TradeLink document party label as **Client Name**, expose the persisted client name in All Documents, and make document retrieval consistently use the immutable creation timestamp.

## Implementation

### Persisted identity

- Keep `tradelink_documents.content.customerName` unchanged.
- Return that persisted value as the read-model field `clientName`.
- Return the authoritative `tradelink_documents.created_at` value as `createdAt`.
- Keep `document_number`, document IDs, Board-item links, revisions, and numbering sequences unchanged.
- No customer-name column rename, data backfill, or document-table migration was introduced.

### Chronological ordering

All active TradeLink list sources now use:

```sql
ORDER BY created_at DESC, id DESC
```

The server page cursor is the pair `(created_at, id)`. The page query merges the existing manager, creator, and assigned-reviewer visibility sets before applying filters, ordering, and the cursor. This avoids duplicate reviewer rows and repeated records across pages.

The page helper reuses the existing `tl03_can_manage`, `tl03_can_create_draft`, and `tl03_can_review` predicates. No role, RLS policy, workspace membership, or document workflow rules were changed.

The existing assigned-document endpoint remains available and now also returns `createdAt` and `clientName`.

### User interface

- Quotation editor label: **Client Name**.
- Saved quotation preview label: **Client Name**.
- Saved quotation output label: **CLIENT NAME**.
- All Documents columns include **Document Number** and **Client Name**.
- The list shows the persisted creation time and retains the separate last-updated timestamp.
- The default list sort is Date created, descending.
- Post-save reconciliation sorts by the server-returned creation timestamp.
- CSV export includes Client Name and Created At.

## Database migration

- Migration: `20261123080322_cp_tl_document_identity_order_01.sql`
- Existing Supabase project: `jtlusodorfnyzgyuewkz`
- Applied successfully and recorded in the Supabase migration history.
- Added index: `tl03_document_created(board_id, created_at DESC, id DESC)`.
- Updated `tl03_documents_list`, `tl03_documents_page`, and `private.tl03_assigned_documents`.
- Added private paginated read helper `private.tl03_documents_page`; the public RPC remains SECURITY INVOKER.
- Existing document data and numbering sequence were not modified.

## Verification

- TradeLink-focused tests: 441 passed.
- Full repository tests: 3,509 passed, 0 failed.
- `npm run check`: passed.
- `npm run build`: passed. Existing large-bundle warning remains; no build failure.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Production data audit: 25 documents; all 25 have non-empty `customerName`; no missing `created_at`; 24 have `updated_at > created_at`.
- Database postflight: migration recorded, creation index present, public RPC remains invoker, private page helper is definer, authenticated execution present, anonymous execution absent.

## Remaining acceptance

The database migration is deployed. Frontend changes still require the normal GitHub review/merge and Pages deployment. After deployment, perform a read-only signed-browser acceptance for:

1. Client Name in the Quotation editor and saved preview.
2. Document Number and Client Name in All Documents.
3. Newest-first order after initial load and refresh.
4. Creator/reviewer merged list ordering and deduplication.
5. Page-cursor continuity where a second page exists.
6. Editing a document without moving its creation position.

No production document creation or update was used as a test fixture.

## Inference-only constraint

No gradient descent, backpropagation, model training, retraining, fine-tuning, parameter updates, or training dependencies were introduced or executed.
