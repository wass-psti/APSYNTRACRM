# CP-CRM-UI-REDESIGN-01 — Uiverse-inspired APSYNTRA visual foundation

## Objective and design-source review

Reference: https://uiverse.io/elements (community UI patterns under MIT; https://github.com/uiverse-io/galaxy). The implementation **adapts visual interaction principles** in original CSS rather than copying component source or installing unreviewed third-party packages. The project retains its native HTML, CSS, JS ES modules, styling bundle, state management and browser routes. No third-party material was copied into this change, so no component-specific asset attribution is required.

## Frontend audit

- Architecture: a single `index.html`, the existing JavaScript ES-module application and route-specific CSS layers built into `frontend/apsyntra-styles.bundle.css` from `scripts/priority5-style-manifest.mjs`.
- Current visual foundations: `frontend/soft-minimalist.css`, `frontend/enterprise-ui-refinement.css`, `frontend/application-ui-refinement.css`, plus per-module styles. These already incorporate some Uiverse-inspired treatment, but the cascade has multiple locally repeated radius, shadow, border, focus and motion values.
- Risk: wholesale replacement of HTML or layout geometry could regress board-row clicks, horizontally scrollable groups, floating overlays, startup/session verification, performance and module-specific visual identities.
- Design choice: one final shared visual CSS layer, no new runtime scripts, no CSS imports, no package dependencies, no new events, no permissions or authorization changes.

## Implemented

- Central `--uv-*` design tokens for controls, surfaces, borders, depth, accent, focus and transition timing, with light/dark mode.
- Consistent non-moving primary/secondary button hover and pressed feedback, visible focus, disabled state, and field hover/focus/invalid treatment.
- Sidebar active/hover states, workspace switcher, top bar, panel and card elevation, native module surfaces, dialogs, dropdowns, menus, notifications, search, role configuration, settings and workspace cards.
- Breakpoint-aware wrapping, reduced motion, preserving original row metrics and popover positioning.
- Manifest integration into the single pre-existing CSS request and deterministic bundle regeneration. The URL query version changes to force visual asset refresh after deployment.
- Two previous CSS order tests updated to assert their layers remain correctly ordered before the new shared design layer.

## Acceptance evidence

- Focused source assertions: token coverage, cascade order, visual-only invariants and deterministic bundle.
- Isolated Chromium computed-style/keyboard tests at 390, 768 and 1440 CSS pixels: 30 assertions covering nav, controls, disabled/focus, menu keyboard behavior, dark mode, reduced motion and no viewport overflow.
- Existing UI fixture: 27 visual, keyboard and accessibility assertions at 390, 768 and 1440 CSS pixels.
- Full application suite and build: record results from the current PR/CI, do not infer from this document.

## Unfinished acceptance (not certified)

This is the **shared visual foundation**, not proof that every native app screen has been visually redesigned or manually inspected. Production signed route-by-route screenshots, genuine device touch behavior, full multi-account workflows, modal/search accessibility across every module, and before/after UX approval remain outside this code-only milestone. Defer those independently and do not characterize a build or CSS fixture as production acceptance. No production data, authentication, roles, RLS, APIs or module workflow behavior is changed.
