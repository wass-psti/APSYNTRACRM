# Material Request Hub — Material Detail Drawer Redesign

Date: November 11, 2026.

## Reference and scope

Six screenshots show a right-side procurement drawer with fixed item identity and group, Details/Tasks/Activity tabs, grouped Identification, Supplier & Schedule, Pricing & Cost and Calculated Totals, separate content scrolling and bottom actions.

- Scoped Material Request Hub drawer styles leave unrelated board dialogs unchanged.
- Sticky item header and group, tab navigation, and the independent scroll region keep actions visible.
- Public Identification and Supplier & Schedule content comes only from the verified board projection through materialTrackerRows.
- The protected item RPC populates Pricing & Cost and Vendor Details. Private fields are read-only by default; selecting Edit protected fields reveals the existing per-field signed CAS forms. Done editing returns to read-only.
- Calculated Totals explicitly states that verified conversion rates and financial formulas are not configured. No guessed calculations or screenshot operational records.
- Tasks retain signed board-item task RPCs and Activity retains exact item-filtered signed audit. No new auth gates.
- Existing close behavior, dialog semantics, keyboard focus, mobile layout and reduced-motion support remain.
- No change to Supabase schema, permissions, RLS, original Main group, material records or protected data exposure.

## Verification

- Full frontend tests: 1,689/1,689 PASS, including source escaping, read-only/editing, tabs and signed RPC integration.
- Isolated Chromium responsive render at 1440, 1024, 768, 390 and 320: no document overflow, internal scrolling, sticky tabs, persistent footer and no private inputs in default read-only view.
- JavaScript syntax and generated CSS bundle verification PASS.

## Exclusions

The reference's Duplicate, Quotation and Delete controls, unified Edit Save Changes contract and calculated commercial totals are not implemented without verified signed domain contracts. Do not display inert buttons or fabricate calculations. Genuine signed browser regression remains a separate acceptance check.
