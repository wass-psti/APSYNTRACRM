# CP-TL-UI-REFRESH-02 — TradeLink Workspace Screens

## Objective

Extend the TradeLink light-mode design system to All Documents, Activity, and
Analytics while preserving the existing signed data sources, document actions,
event ordering, calculations, and route behavior.

## Scope

- All Documents: refine repository heading, module filters, search controls,
  advanced filters, date filters, bulk selection, document table, status chips,
  pagination, and row action affordances.
- Activity: improve the signed application-event timeline, event labels,
  timestamps, actor attribution, and loading/empty/error presentation.
- Analytics: improve KPI hierarchy, chart presentation, financial tables,
  numeric alignment, generated-at display, and receivables aging presentation.
- Reuse the existing TradeLink light-mode tokens and append screen styles to
  the TradeLink-scoped refresh stylesheet.
- Keep the existing data sources: tl03_native_activity and
  tl03_analytics_summary, plus the existing signed document repository reads.

## Non-goals

- No new data endpoints, RPCs, database migrations, schema changes, or
  production data mutations.
- No changes to document workflow, calculations, currency grouping, event
  ordering, role/permission behavior, authentication, or API contracts.
- No dark-mode styles or theme controls.
- No new dependencies, background workers, model-training loops, gradient
  descent, backpropagation, or model-parameter updates.

## Acceptance criteria

1. All Documents retains search, module/status filters, date filters, sorting,
   pagination, row actions, reviewer actions, and bulk operations.
2. Activity preserves the existing signed event source, descending event order,
   100-event limit, actor attribution, escaping, and refresh action.
3. Analytics preserves signed aggregate data, all six KPIs, per-currency
   quotation values, tax summaries, receivables aging, and refresh behavior.
4. Loading, empty, unavailable, and error states remain truthful and accessible.
5. All three screens use the same light-mode design tokens; no dark-mode
   selectors or controls are introduced.
6. No page-level horizontal overflow at desktop, tablet, or mobile widths.
   Existing document-table horizontal scrolling remains contained in its table.
7. Keyboard focus, readable contrast, and reduced-motion preferences remain
   supported.
8. All TradeLink tests, CSS bundle verification, and the production build pass.
9. No business logic, data contracts, or database behavior changes are made.
