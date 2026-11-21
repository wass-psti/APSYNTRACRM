# CP-CRM-UI-REFINEMENT-01 — Shared CRM UI modernization

## Objective and constraints

Modernize APSYNTRA CRM's shared frontend presentation using the CSS-first, interactive-state ideas demonstrated in Uiverse's button, card, input, and tooltip collections. Reuse the existing soft-minimalist design system, CSS custom properties, current HTML/ES modules, and deterministic CSS bundle. No copied third-party code or runtime libraries. Preserve business logic, module navigation, attendance, permissions, database/API contracts, existing menu positioning, and board scroll geometry.

Reference studied: https://uiverse.io/elements (buttons, cards, inputs, loaders, tooltips, forms). The actual styles in this change are original APSYNTRA adaptations.

## Initial audit — existing production browser, read-only

At a browser width of **1275px**, the following routes were inspected by navigating an existing signed-in Chromium tab and restoring its original `#/overview` route. Navigation only; no form submissions, database mutations, or account changes.

| Route inspected          | Observable surface                           | Page overflow |
| ------------------------ | -------------------------------------------- | ------------- |
| `#/overview`             | Dashboard, five shared card/panel elements   | 0px           |
| `#/boards`               | Boards and filter controls                   | 0px           |
| `#/fm1`                  | FM1 Ticketing and shared navigation          | 0px           |
| `#/time-tracker`         | TimeTracker Attendance                       | 0px           |
| `#/fund-tracker`         | Fund Tracker                                 | 0px           |
| `#/fueltrack`            | FuelTrack+ route, limited content observed   | 0px           |
| `#/tradelink`            | Routed to Quotation Draft                    | 0px           |
| `#/user-role-management` | Teams / roles route                          | 0px           |
| `#/settings`             | Account & security, forms and profile panels | 0px           |

This does **not** constitute exhaustive coverage of every workspace, privileged page, every board item, every app subview, or all responsive breakpoints. The signed-in employee's available navigation constrained the audit. Other application-specific workflows and menus must not be assumed visually certified solely from this read-only traversal.

## Audit observations

- The existing `soft-minimalist.css` provides usable semantic tokens, surfaces, typography, controls, and focus rules.
- Later styles (`monday-inspired-ui.css`, module CSS, board and search styles) introduce different radii, borders, shadows, hover states, and component densities, reducing cross-route visual consistency.
- Native TimeTracker, FM1, Fund Tracker, TradeLink, FuelTrack+, and TalkBox already have their own branding; these must not be overwritten with a new framework.
- Board tables have fixed row sizing and virtualized/group scrolling contracts. Do not change those dimensions, positioning, or scroll containers during decorative refinement.
- Current desktop shell had no page-level horizontal overflow; isolated local responsive fixtures are needed for consistency checks at smaller widths.

## Implemented refinement

1. New `frontend/enterprise-ui-refinement.css`, loaded **last** through the existing deterministic `priority5-style-manifest.mjs` and generated CSS bundle.
2. Reusable color, edge, elevation, focus, radius, and transition tokens supporting light and dark appearances.
3. Refined primary/secondary button states, inputs and validation focus, sidebar links, headers, dashboard cards, board surfaces, active row focus, dialog edges, popover shadows, and toast surfaces.
4. Cohesive shadow treatment across recognized native module panels: FM1, TimeTracker, FuelTrack+, TradeLink, Fund Tracker, TalkBox, and the workspace browser.
5. Visible keyboard focus with a reduced-motion override; limited to color, borders, and shadows rather than endless animations or layout movement.
6. Responsive min-width and wrap safeguards that avoid altering table widths and board-level scrolling.

## Acceptance and safeguards

- The CSS bundle must exactly match manifest sources and retain the new layer in final position.
- The existing regression suites, type/syntax checks, lint, production build, FM1 and TimeTracker browser acceptance must pass.
- Dedicated Playwright acceptance checks calculated styles on desktop (1440px), tablet (768px), and mobile (390px), checking no page overflow in representative fixtures, component surfaces, focus visibility, reduced motion, and dark tokens.
- No new dependencies; no frontend JS behavior changes, authentication changes, migrations, API modifications, or new access rules.

## Remaining limitations / next acceptance scope

- The full set of role-specific and per-module visual states cannot be certified from an employee account and fixture tests alone. Independently review other authorized accounts/roles and deeper workflows when those sessions are legitimately available.
- Additional per-module component redesigns (e.g., complex TradeLink forms, dynamic board menus, nested dialogs, and high-density mobile tables) require dedicated screenshot/interaction acceptance and should follow their existing module conventions instead of a global selector rewrite.
- Existing larger-than-500KB Vite bundle warnings are pre-existing and are outside this visual-only change.
- Production deployment is distinct from merge/build success and must be verified separately.
