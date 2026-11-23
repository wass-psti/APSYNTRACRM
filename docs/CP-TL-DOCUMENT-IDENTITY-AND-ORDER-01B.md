# CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01B

## Objective

Reconcile the already-deployed CP-01 migration scope, verify the production reviewer read path available in the current signed session, and establish deterministic pagination continuity across the 50-row server page boundary.

## Scope disposition

- Keep the already-applied `20261123080322_cp_tl_document_identity_order_01.sql` as the existing production baseline.
- Do not roll back its RPC/index changes or rewrite migration history.
- Treat it as the sole one-time migration exception for CP-01.
- No additional migration, table, column, data backfill, permission, role, or RLS change is introduced by CP-01B.
- No production document or Board-item writes are used for acceptance.

## Disposable PostgreSQL 17 acceptance

Command: `bash scripts/cp-tl-document-identity-order-01b-disposable.sh`

The isolated fixture is kept separate from the CP-TL-03B legacy pagination fixture. It applies the existing TradeLink domain/reviewer contracts and the already-deployed CP-01 migration, then creates 54 synthetic documents inside a transaction. It verifies:

| Check                        | Result                                         |
| ---------------------------- | ---------------------------------------------- |
| Reviewer-only view           | 52 assigned rows across 50 + 2 pages           |
| Creator + reviewer view      | 53 unique rows: 52 assigned + 1 creator-only   |
| Creator/reviewer overlap     | One row, no duplication                        |
| Unrelated manager-only row   | Excluded from both reviewer views              |
| Manager keyset pages         | 50 + 4                                         |
| Manager keyset pages         | 50 + 4                                         |
| Equal `created_at` values    | Stable `id DESC` tie-breaker                   |
| Cursor                       | `(created_at, id)`; `createdAt` response field |
| Edit                         | Revision advances to 2                         |
| Creation position after edit | Unchanged                                      |
| Updated timestamp after edit | Advances independently                         |

All synthetic documents, Board projections, and events are rolled back.

## Production signed-browser evidence

- The active signed browser account is an actual assigned secondary reviewer on `CP-TL-08C-QA-20261112-01`; the production review table records that account as the secondary reviewer, and the assigned Approved document is present in the signed All Documents list.
- The same signed account also has the General Manager module role, so this is genuine assigned-reviewer readback but not an isolated reviewer-only account test. The assigned document is already Approved and both review timestamps are recorded; no pending production review action exists for this account, so no production mutation was attempted.
- The live All Documents view contains 15 active records, reports 15 of 15, uses `createdAt DESC`, and its document-number sequence matches the authoritative production SQL query. The Next Page control is disabled because there is no second production page.
- Reviewer-only visibility and the pending assigned-document page path are covered by the disposable PostgreSQL 17 `User`/reviewer fixture (52 rows across 50+2 pages). Production does not have 50+ records, and no production fixtures were created to force a second page.

## Production data integrity

- 27 documents total; 26 have a persisted `customerName`; one (`Q-011133`) has no client identity in its persisted JSON or linked Board item title.
- Zero documents are missing `created_at`.
- The absent client identity remains blank in storage and is rendered as an em dash. No value was inferred or backfilled.

## Inference-only constraint

No gradient descent, backpropagation, model training, retraining, fine-tuning, iterative parameter updates, or training dependencies are introduced or executed.

## Status

- Disposable reviewer-only, creator/reviewer merge, manager pagination, and edit-position acceptance: **VERIFIED**.
- Genuine production assigned-reviewer readback: **VERIFIED** for the current signed reviewer account and its assigned Approved QA document.
- Production list ordering: **VERIFIED** against the authoritative `created_at DESC, id DESC` query.
- A pending review action and a second production page were not available in the live dataset. These are not code defects or reasons to create production fixtures; reviewer-only and 50+ pagination behavior are covered in the disposable PostgreSQL acceptance.
- Mainline frontend validation, the dedicated CP-TL-03B disposable PostgreSQL workflow, and GitHub Pages deployment all passed after test-fixture isolation.
