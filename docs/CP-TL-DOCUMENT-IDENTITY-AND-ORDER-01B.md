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

- The active signed browser account is an assigned secondary reviewer on an existing TradeLink QA document.
- The assigned QA document is already Approved and both review timestamps are recorded. Its preview is read-only and does not require or trigger a review mutation.
- Production has 15 active documents and 27 total documents including archived records; neither reaches the 50-row page size.
- A separate User-role reviewer session with a pending assigned document is not available in the connected browser. This is a remaining runtime acceptance dependency, not a demonstrated code defect.

## Production data integrity

- 27 documents total; 26 have a persisted `customerName`; one (`Q-011133`) has no client identity in its persisted JSON or linked Board item title.
- Zero documents are missing `created_at`.
- The absent client identity remains blank in storage and is rendered as an em dash. No value was inferred or backfilled.

## Inference-only constraint

No gradient descent, backpropagation, model training, retraining, fine-tuning, iterative parameter updates, or training dependencies are introduced or executed.

## Status

Disposable pagination and edit-position acceptance: **VERIFIED**.

Production reviewer-assigned readback: **VERIFIED for the current assigned Approved QA document**.

Reviewer-only User browser acceptance and a production second-page observation: **PENDING** because no suitable signed session or 50+ production records are available. No production fixtures will be created to force those conditions.
