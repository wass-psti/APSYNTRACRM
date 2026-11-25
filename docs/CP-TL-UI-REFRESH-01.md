# CP-TL-UI-REFRESH-01 — TradeLink Document Workspace Refresh

## Objective

Improve the TradeLink document creation and editing experience across all six
document modules while preserving the existing signed document lifecycle,
field contracts, calculation rules, reviewer assignments, persistence, and
authorization behavior.

## Scope

- Add in-form section navigation for Document, Client, Items/Payment, Totals
  where applicable, Notes, Terms, and Workflow. Navigation scrolls within the
  current editor and does not mutate the hash-based TradeLink route.
- Keep the document action header accessible while users scroll through long
  forms; preserve the existing Save, Templates, and Print PDF actions and their
  existing enabled/disabled conditions.
- Improve form-section hierarchy, labels, spacing, field sizing, and responsive
  layouts.
- Present line-item descriptions, quantities, unit prices, units, totals, and
  row actions in a more consistent grid on desktop and a stacked layout on
  narrow screens.
- Improve the visual grouping of totals and reviewer stages.
- Keep the refreshed TradeLink workspace light-mode only, with keyboard focus
  and reduced-motion preferences.

## Non-goals

- No changes to document payloads, parsing, calculations, numbering, approval
  workflow, review eligibility, permissions, roles, authentication, APIs,
  database schema, or production records.
- No new dependencies, background processes, training loops, or model
  optimization mechanisms.

## Acceptance criteria

1. All six document modules render valid section-navigation links to existing
   sections; totals navigation appears only for priced modules.
2. Existing input names, data-action values, placeholders, and workflow
   controls remain intact.
3. Line-item controls remain usable for priced, physical, delivery, and note
   rows at desktop and narrow viewport widths.
4. The Save action remains visible while scrolling without obscuring the CRM
   global header.
5. The layout has no horizontal overflow at 568px and 390px viewports.
6. The refreshed TradeLink workspace remains light-mode only, with readable
   surfaces, labels, and focus states.
7. Existing TradeLink tests, the full TradeLink test group, CSS bundle
   verification, and production build pass.
8. No business logic or database behavior changes are introduced.
