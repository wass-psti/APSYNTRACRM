# CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01

## Objective

Standardize the TradeLink document party label as **Client Name**, expose the persisted client name in All Documents, and make document retrieval consistently use the immutable creation timestamp.

## Implementation

### Persisted identity

- Keep `tradelink_documents.content.customerName` unchanged.
- Return that persisted value as the read-model field `clientName`.
- Return the authoritative `tradelink_documents.created_at` value as `createdAt`.
- Keep `document_number`, document IDs, Board-item links, revisions, and numbering sequences unchanged.
- No customer-name column rename, data backfill, or document-table shape change was introduced.
- Scope reconciliation: this already-applied migration adds an index and replaces existing RPC definitions; it is retained as the existing deployed baseline rather than rolled back. It is the sole one-time migration exception for this workstream. CP-01B introduces no further migration, table, column, data backfill, role, permission, or RLS change.

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
- Initial production data audit at migration deployment: 25 documents; all 25 had non-empty `customerName`; no missing `created_at`; 24 had `updated_at > created_at`.
- Follow-up read-only production audit after subsequent live document activity: 27 documents; 26 have non-empty `customerName`; one document has no persisted customer identity; zero have missing `created_at`.
- The record `Q-011133` has no `customerName`, `clientName`, or `customer` value in its persisted JSON, and its linked Board item title is only the document number. The UI and saved preview correctly show an em dash for this absent value. No customer identity was inferred or backfilled.
- Database postflight: migration recorded, creation index present, public RPC remains invoker, private page helper is definer, authenticated execution present, anonymous execution absent.

## CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01B acceptance

- PR #807 contains the frontend and SQL implementation; PR #808 records the migration source hash; PR #809 corrects the follow-up production audit. All three are merged.
- The production Pages deployment for the merged closeout passed.
- Production browser: the signed account is an existing assigned secondary reviewer on `CP-TL-08C-QA-20261112-01`; that document is already Approved, so this verifies assigned-document readback but does not exercise a pending reviewer action or a reviewer-only User session.
- Production currently contains 15 active documents and 27 total including archived records, below the 50-row page size. A production second page therefore cannot be exercised without creating production fixtures, which this milestone does not permit.
- Disposable PostgreSQL 17 acceptance now creates 54 synthetic records, verifies reviewer-only 50+2, creator/reviewer 50+3, and manager 50+4 pages, creator/reviewer overlap without duplication, UUID tie-breaking for identical `created_at` values, and an edit that advances `updated_at` without changing `created_at` or list position. All fixture writes are rolled back.
- Follow-up production audit: 27 documents; 26 have non-empty `customerName`, one (`Q-011133`) has no persisted client identity, and zero have missing `created_at`. The UI correctly displays an em dash for the missing value.

A separate signed browser session for a TradeLink `User` reviewer with a pending assigned document remains outstanding. No production document creation or update was used as a test fixture.

## Inference-only constraint

No gradient descent, backpropagation, model training, retraining, fine-tuning, parameter updates, or training dependencies were introduced or executed.
