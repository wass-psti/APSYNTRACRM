# CP-CRM-BOARDS-UIVERSE-OVERHAUL-03 — Complete CRM Shell and Boards Visual Redesign

## Objective

Replace the prior incremental board styling with a clearly visible, cohesive APSYNTRA CRM interface. The design is based on a curated Uiverse component vocabulary: navigation, cards, buttons, search inputs, segmented controls, menus, forms, focus states, dark surfaces, and compact interaction feedback.

This implementation corrects the previous visual result: the old sidebar, shell, and board composition were retained too closely. The new layer changes the shared application shell and the Boards catalog/workspace as a coordinated design system.

## Visual implementation

- **Shared application shell:** New dark workspace sidebar, new brand header, workspace switcher surface, application/module navigation, active route treatment, recent-board list, account footer, sticky topbar, search, invite, synchronization and account controls.
- **Boards catalog:** New large workspace heading surface, clear board-status segmented control, dedicated search field, responsive board-card grid, consistent card actions, metadata and hover/focus states.
- **Board workspace:** New board title hierarchy, tabs, unified action toolbar, group headings, grouped table surfaces, table headers, row separators, selected rows, frozen first column, status chips, bulk actions and pagination.
- **Forms and overlays:** Shared control, focus, disabled, popover and modal surfaces for the standard Boards experience.
- **Themes:** Coordinated light and dark tokens, with the same geometry and component hierarchy in both modes.
- **Responsive layout:** Desktop sidebar, compact icon rail, mobile workspace controls, single-column mobile board cards, and independent horizontal scrolling for wide board groups.
- **Motion and stability:** No runtime dependencies, no JavaScript animation loops, no new global listeners, and explicit reduced-motion behavior.

## Uiverse reference approach

The Uiverse library is a community component collection rather than a single ready-made CRM theme. This implementation uses its navigation, card, button, input, dark/minimal, switch, and tooltip patterns as a curated design vocabulary, then applies a consistent APSYNTRA token system and the existing application semantics.

Reference collections:

- [Uiverse Tailwind elements, pages 1–21](https://uiverse.io/elements?t=tailwind&page=1)
- [Uiverse complete elements collection, pages 1–132](https://uiverse.io/elements?page=1)
- [Navigation components](https://uiverse.io/tags/navigation)
- [Card components](https://uiverse.io/tags/card)
- [Button components](https://uiverse.io/tags/button)
- [Input components](https://uiverse.io/tags/input)
- [Dark components](https://uiverse.io/tags/dark)
- [Minimal components](https://uiverse.io/tags/minimal)

## Scope and invariants

- Presentation-only changes.
- No changes to Supabase, database schema, RPCs, RLS, authentication, workspace membership, role assignment, authorization, or business workflows.
- Existing route names, DOM action attributes, board renderers, row selection, table column sizing, frozen columns, horizontal group scrolling, and persistence remain authoritative.
- Native TimeTracker, Fund Tracker, TradeLink, FuelTrack+, TalkBox, and Paseo content keeps its module-specific UI. The shared CRM shell is redesigned consistently around those applications.
- No new package dependencies.

## Verification

- Focused design contract tests: `frontend/tests/cp-crm-boards-uiverse-overhaul-03.test.mjs`
- Responsive browser acceptance: `scripts/cp-crm-boards-uiverse-overhaul-03-browser.mjs`
- Browser acceptance: 345 checks passed locally
- Full frontend regression: 3,340 tests passed locally
- Browser acceptance covers 8 viewport widths (390, 640, 768, 810, 1024, 1280, 1440, 1898), both themes, the catalog and a standard board workspace.
- Acceptance checks cover page overflow, shell/sidebar sizing, sticky topbar, catalog geometry, card count, responsive columns, active route state, horizontal group scrolling, frozen header/first column, selected-row visibility, and theme tokens.
- Visual evidence is stored in `docs/visual/cp-crm-boards-uiverse-overhaul-03/`.

## Visual evidence

- `catalog-light-1440.png`
- `catalog-dark-1440.png`
- `catalog-light-390.png`
- `catalog-dark-390.png`
- `board-light-1440.png`
- `board-dark-1440.png`
- `board-light-390.png`
- `board-dark-390.png`
- `item-drawer-light-1440.png`
- `item-drawer-dark-1440.png`
- `command-search-light-1440.png`
- `command-search-dark-1440.png`

## Release status

Implementation and local verification are complete. GitHub CI, merge, Pages deployment, and signed-in production browser acceptance remain pending.
