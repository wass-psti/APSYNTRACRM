# Material Request Hub — Material Sourcing Reference-Aligned Redesign

Date: November 11, 2026.

## Reference comparison and intentional differences

The supplied monday.com Material Sourcing screenshot is a visual design reference, not an authorized source of operational records, financial figures, live exchange rates, group identities or commercial fields. The prior APSYNTRA Material Tracker was a compact, white four-card summary; the new layout uses a full procurement workspace with a white application header, pale slate canvas, six responsive metric/source cards, a contextual finance/rates information strip, view tabs, dense filter toolbar, grouped row and horizontally scrollable item grid.

The reference includes financial totals and exchange rates, 24 additional columns, bulk import, 70 Engineering Services records and vendor data. Those values and features are not fabricated or silently made public. Finance is labeled Restricted; source breakdown is calculated only from authorized public Local/Import values; unavailable protected metrics are not shown as rates; the Bulk Import tab explicitly indicates unavailable rather than using an inert action.

## Functional integration

- The existing dedicated Material Tracker route and signed board-item data projection remain unchanged.
- Public field allowlist is enforced by materialTrackerRows. Includes part number, public creation date, Source Type, RFQ, description, brand, quantity, required date, and lead weeks only where the verified column exists.
- Exact original Main group name, UUID and row association remain intact. No screenshot records, group renames, role changes, schema changes, or storage changes.
- Clicking the Part number still opens existing signed protected item Details / Tasks / Activity.
- Add Material uses the existing mrh-new-part handler only when signed board edit access exists. Public search, source dropdown, overdue filter, refresh and scroll work as before.
- The SVG source ring uses CSP-compliant SVG numeric attributes and external CSS; no dynamic inline styles or HTML from untrusted records.

## Verification

- Full frontend suite: 1,613 / 1,613 PASS including new reference hierarchy, no fake rates, scope, create permission, HTML semantics and style tests.
- Node syntax checks for frontend/app.js and frontend/material-sourcing-tracker.js PASS.
- Deterministic CSS bundle check PASS.
- Isolated Chromium render at 1440px, 1100px, 768px and 390px: six cards render, responsive grid changes 6 -> 3 -> 2 columns, accessible item action and Main group remain visible, no document-level horizontal overflow, table has its own horizontal scroll, no inline styles.

## Remaining separate functionality

Full protected financial dashboard figures, currency-rate provider integration, secure bulk import, editable public sourcing fields and expanded data grid need their own verified backend/data contracts. The redesign makes no claim that these services are already activated.

The redesign scope is complete when CI, protected merge and GitHub Pages deployed hashes pass.
