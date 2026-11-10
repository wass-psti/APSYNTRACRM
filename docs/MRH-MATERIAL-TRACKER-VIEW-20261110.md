# Material Request Hub — Material Tracker Frontend Increment

Date: 2026-11-10. Scope: new read-only Material Tracker tab using screenshot references supplied in conversation.

## Invariants
- Existing board ID: 617c4c0f-e343-4b3b-8456-50d47dcbaf99.
- Original group: Main group; exact original ID 21566a87-b287-4a61-b521-bb233956e09e, unchanged.
- All eight original board columns are retained. No user role, RLS, production item, sourcing field, or group mutation.
- Material records are drawn only from the existing signed, workspace-authorized board response; reference screenshot rows are not imported.

## Implemented frontend
- Material Tracker application tab at route #/boards/617c4c0f-e343-4b3b-8456-50d47dcbaf99/sourcing.
- Responsive heading and metrics for currently loaded materials, Local, Import, overdue; mark incomplete pagination.
- Search by part number, material description, brand or RFQ; filter Source Type and due-date overdue.
- Horizontally scrollable table with Part number, Material description, Brand, Quantity, Source Type, RFQ Ref No, Date required, Lead (weeks).
- Open the selected item through the existing authorized board detail drawer, where private sourcing RPCs and domain ADMIN authorization remain separate.
- In-memory filters scoped to user, workspace and board; no persistent storage of filters or source fields.
- Browser inputs re-render only tracker subtree rather than all CRM views; safe HTML escaping and keyboard controls.

## Security boundary
Restricted prices, requester identity, supplier details, VAT, FX, and derived financial calculations are not read from the private vault or displayed in this tracker. Vendor filtering, finance summaries and exports are not activated until separately field-authorized workflows are proven. Empty boards remain empty; data are never invented.

## Tests and remaining acceptance
Focused tests cover exact original group identity, public-field allowlists, malicious HTML escaping, search, Local/Import and overdue filters, partial pagination, no secret rendering, empty state and the scoped route. Run all frontend tests, CSS bundle check, Chromium/CI before merge.
Actual signed production browse and record save/reload acceptance remain separate; no operational item writes were performed.

## Next concrete requirement (only if still missing)
Signed Material Tracker interactive acceptance and field-scoped item details/task/activity integration, followed by validated procurement finance formulas and controlled column persistence. Do not bypass group preservation, server authorization or role configuration.