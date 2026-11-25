# CP-TL-USER-MANUAL-UI-01 — TradeLink User Manual

## Objective
Replace the compact User Manual popover with a dedicated, readable, responsive help screen.

## Scope
- Add canonical `#/tradelink/manual` navigation and active state.
- Organize current guidance into seven topics: lifecycle, reviews, creation and numbering, dates, quotation status, print/PDF, and analytics/receivables.
- Add a topic index, concise summaries, searchable topics, a three-step quick start and responsive guidance cards.\n- Keep in-page topic jumps inside the canonical manual route; topic links do not alter the application hash route.
- Preserve workflow and reporting statements without changing document behavior or data sources.

## Non-goals
No database, API, RPC, workflow, authorization or persistence changes.

## Acceptance
- Manual opens as a dedicated screen from TradeLink navigation.
- Existing guidance is retained and grouped by topic.
- Existing routes remain intact.
- Responsive layout, keyboard focus and reduced-motion preferences are supported.
