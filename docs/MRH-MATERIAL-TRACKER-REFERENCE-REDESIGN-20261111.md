# Material Request Hub — Reference-Inspired Material Tracker Redesign

Date: 2026-11-11. Source: two supplied screenshots of current APSYNTRA CRM Material Tracker and Monday.com Material Sourcing reference.

## Implemented
- New Material Sourcing hero with hierarchy, refresh button, pale content canvas, six metrics, truthful Local/Import/Unknown source-mix donut, exchange-rate information strip, All Items header, Add Material action for authorized editors, and compact search/filter toolbar.
- Dense horizontally scrolling signed Material Tracker table with Created, source type, RFQ, description, brand, quantity, due date and lead time. Preserves original Main group and item detail drawer routing.
- Source filters, overdue checkbox and search remain functional. Authorized Add Material uses existing signed item creation without changing roles or backend.
- Working CSV export for currently filtered public records only, with spreadsheet formula neutralization and no protected supplier, requester or financial data.
- Buying total, exchange rates and cost breakdown values remain marked restricted/unavailable (never copied or guessed from the reference). Source mix is counts, not speculative cost.
- Responsive styling at desktop, tablet and phone sizes; horizontally scrolling table prevents full-page overflow.

## Verification
- JavaScript syntax, CSS bundle check, full frontend unit regression; source data allowlist, XSS escaping, filters, no invented finance metrics, public CSV contract and conditional create action.
- Chromium viewport checks at 1440, 960 and 390 pixels: all six cards, source chart, original group, authorized action and no document-level horizontal overflow; inner table scroll at narrower widths.
- No production data, original board groups, column schema, workspace permissions or signed RPCs changed.

## Follow-up dependencies
- Actual financial totals and exchange rates require signed finance data and verified rate providers.
- Source-specific bulk import, configurable columns/views and PDF/Excel reports require real backend/UI contracts, not decorative buttons.
