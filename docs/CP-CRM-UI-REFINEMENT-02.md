# CP-CRM-UI-REFINEMENT-02 — Native application UI and menu acceptance

## Objective

Extend the deployed shared CRM visual foundation from CP01 into native application buttons, forms, context menus, board tables, and workspace overlays. Use original CSS adapting Uiverse interaction patterns (focus halos, subtle state changes, borders and layered surfaces) without importing external code or packages. Preserve route handlers, business logic, RBAC/RLS, API contracts, attendance, data, board row dimensions, popover anchors, and in-module branding.

## Audit scope and observations

The CP01 signed Chromium read-only audit included Overview, Boards, FM1, TimeTracker, Fund Tracker, FuelTrack+, TradeLink, Teams, and Settings with zero page-level overflow at 1275px. The current selected browser tab also exposes Toolbox Issues / TalkBox. Deep CSS inspection of `frontend/action-menu-experience.css`, `frontend/workspace-ui.css`, `frontend/tradelink-reference-ui.css`, `frontend/fueltrack-v3-application.css`, `frontend/talkbox-application.css`, and TimeTracker/FM1 modules found varied native hover, focus, panel edge and tab contrast treatments.

The CP02 dynamic browser fixture uncovered two false positives due to invalid fixture markup (TalkBox's wide table missing the actual `.tb-scroll` wrapper; TradeLink portal missing its `.aps-tradelink-app` root). Both were corrected to the real DOM contracts instead of hiding overflow or weakening the test. Keyboard testing uncovered an actual selector-specificity issue for focused board menu items and a FuelTrack tab-label contrast issue. CP02 addresses both.

## Implementation

- `frontend/application-ui-refinement.css` is the final CSS source after CP01 in the deterministic style manifest and generated bundle.
- Explicit native button and tab focus outlines for FM1, TimeTracker, TradeLink, FuelTrack+, Fund Tracker, and workspace browser controls.
- Consistent border and lightweight hover states across board popovers, native application panels, menus, select overlays and record tables, with no changes to positions or row sizing.
- Keyboard-focused action menus receive an accessible outline at the correct selector specificity, without modifying their open/close logic.
- FuelTrack idle navigation tab labels have stronger foreground contrast.
- Responsive wrapping is limited to existing flexible headers and toolbar controls. Wide TalkBox and TradeLink tables retain their own horizontal scrolling.
- Dark-mode border tokens and reduced-motion transitions stay consistent with the established design system.
- No JS application behavior, database, sessions, roles, permissions, credentials or external dependency changes.

## Verification

The unit suite `frontend/tests/cp-crm-ui-refinement-02.test.mjs` checks manifest order, bundle consistency, target component coverage and visual-only boundaries. `scripts/cp-crm-ui-refinement-02-browser-acceptance.mjs` exercises actual CSS through Playwright at 390px, 768px and 1440px, including keyboard opening of a native `details` context menu, menu item keyboard focus, unchanged menu trigger width, no page overflow, scrollable table fixture, reduced motion, dark theme tokens, and axe WCAG 2.2 AA checks. FM1 and TimeTracker browser acceptance and the full CRM regression suite are separately required before delivery.

## Remaining certification boundaries

This milestone certifies shared native-component behavior and the tested reference fixtures; it does not claim a pixel-perfect visual audit of every role-restricted view, every nested application screen, every board with 256+ columns, every dynamic menu near all viewport edges, or every financial/attendance scenario. Further live role-specific visual sign-off requires authentic sessions with access to those screens and should avoid creating production records solely for visual testing. No screenshot-based claim is made without an inspected screenshot.
