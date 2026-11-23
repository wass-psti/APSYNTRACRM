# CP-TL-DOCUMENT-BULK-ACTIONS-01

## Objective

Extend the existing TradeLink All Documents checkbox selection used by Export Selected CSV with Delete Selected, Hide Selected, and Unhide Selected. Keep selection identity exact and make each server-side batch atomic.

## User interface

- Reuse the existing document checkboxes, select-all control, selected-count status, and CSV export action.
- Restore checked state from `selectedDocumentIds` after ordinary UI redraws.
- Clear selection when the server list is reloaded, filters are applied, or pagination changes. This prevents stale IDs from crossing list contexts.
- Keep Hide and Unhide mutually exclusive for mixed visibility selections. Delete can act on any selected non-deleted record.
- Show the visibility filter to the existing manager-capable All Documents view. Non-manager All Documents reads never include hidden rows.

## Persistence behavior

- `hidden_at` / `hidden_by` are reversible visibility metadata. Hide and Unhide do not modify document content, revision, `updated_at`, creation ordering, workflow state, or the linked Board projection.
- `deleted_at` / `deleted_by` represent a terminal delete tombstone. Deleted records disappear from All Documents, assigned-reviewer inboxes, and live document reads. The linked Board item is archived.
- Delete is intentionally not a physical SQL row deletion. Existing document event, review, and immutable revision records use restrictive foreign-key relationships. The tombstone removes the document from live workflows while preserving the audit and revision history. It cannot be restored through Unhide.

## Server contract

- New RPC: `public.tl03_documents_bulk_action(board_id, action, rows)`.
- Actions: `hide`, `unhide`, `delete`.
- Each selected row supplies its document UUID and expected revision.
- The server locks selected rows in deterministic order, validates the entire batch before writing, rejects duplicate IDs and stale revisions, and applies all records in one transaction.
- Batch size is bounded to the existing 50-row All Documents page size.
- Existing manager capability checks and session contracts are reused. No role, permission, or RLS policy changes are introduced.
- The new page RPC overload adds `p_visibility_mode` (`visible`, `hidden`, or `all`). The prior eight-argument RPC remains as a visible-only compatibility wrapper.

## Verification

Run locally:

```bash
node --test frontend/tests/tradelink*test.mjs
bash scripts/cp-tl-document-bulk-actions-disposable.sh
npm test
npm run check
npm run build
node scripts/verify-migration-source-manifest.mjs
```

The disposable PostgreSQL 17 acceptance verifies exact selected-ID isolation, stale-revision all-or-nothing behavior, hide/unhide readback, terminal delete, Board projection archival, reviewer read/write reconciliation, and retention of immutable history.

## Inference-only constraint

No gradient descent, backpropagation, training, retraining, fine-tuning, iterative parameter updates, or model-training dependencies are introduced or executed.

## Deployment note

Migration source: `20261123190000_cp_tl_document_bulk_actions.sql`. Production application must use the existing Supabase project and must not use a blanket `db push` while the local and remote migration ledgers contain unrelated missing/pending versions. Apply this migration independently after confirming its final production version, then deploy the frontend.
