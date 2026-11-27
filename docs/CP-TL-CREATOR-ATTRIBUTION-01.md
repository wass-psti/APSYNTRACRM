# CP-TL-CREATOR-ATTRIBUTION-01 — Original Creator Attribution

## Root cause

The TradeLink editor passed the current authenticated user's `actorName` into the Verification & Approval Workflow creator display for both new and saved documents. The server read API already returned `created_by_name`, resolved from the original document's immutable `created_by` identity and profile. The editor ignored that saved value and rendered the viewer instead.

## Correction

- Saved documents now display the server-resolved `row.created_by_name`.
- New, unsaved documents continue to show the current authenticated user as the pending creator.
- If a saved creator profile name is unavailable, the UI displays `Original creator unavailable`; it never substitutes the viewer.
- The same creator binding is used by Quotation, PO, Electronic SI, Packing List, Delivery Receipt, and Payment AR workflows.
- No creator column, ownership migration, save behavior, revision behavior, or authorization policy is changed.

## Data contract

- `created_by`: immutable original creator account ID.
- `created_by_name`: server-resolved display name/email for `created_by`.
- `updated_by`: most recent editor account ID.

## Acceptance

The regression test opens a saved document as Alex while the saved record identifies Dionny as its creator. It verifies Dionny remains displayed in every document module, that untrusted content cannot override the creator, that a missing profile name never falls back to Alex, and that a new unsaved document still displays the current user as pending creator.

No training, retraining, gradient descent, backpropagation, or model-parameter update path is introduced.
