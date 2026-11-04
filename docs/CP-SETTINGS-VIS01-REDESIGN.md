# CP-SETTINGS-VIS01 — Settings / Account & security redesign

## Scope

Six annotated regions on the signed `#/settings` route: Settings content, topbar, session/account indicator, heading, profile information and session security. Uses the existing sidebar design without modifying other routes.

## Implementation

- `frontend/app.js`: Adds a Settings-scoped wrapper and route class, semantic labeled hero, account profile grid, compact identity card and security notices. Existing snapshot fields remain escaped, and all original `data-action` controls remain bound to the existing event system: `copy-token`, `logout`, `board-tt-signed-verify`, `verify-backend`. The signed verification results still render only from the established application state.
- `frontend/settings-experience.css`: A route-scoped enterprise style layer for the header, cards, avatar, profile details and read-only verification sections. Responsive two-column-to-one-column collapse avoids the original excessively tall empty profile panel. No global CSS replacement.
- `frontend/settings-visuals.js`: Static, fixed SVG icons and cancellable, one-shot native Web Animations API entrance motion. Animations use compositor-friendly opacity/transform only, stop on route change, and skip when hidden or when reduced motion is requested. No continuous render loop, network call, canvas/WebGL context or telemetry.
- `index.html`: One new same-origin, CSP-compatible stylesheet.
- `scripts/pages-smoke.mjs`: Exact deployed-commit verification includes both new experience assets.
- `frontend/tests/settings-experience.test.mjs`: Includes direct fixture rendering of the real Settings function and regression checks for identity data, escaping, token secrecy, all four action bindings, dynamically populated verification results, responsive styling, static icons and animation cleanup.

## Architecture and authorization

Preserve APSYNTRA CRM's existing production JavaScript ES-module architecture and GitHub Pages deployment pipeline. The requested modern frontend stack is applied selectively: HTML5, CSS3 and custom properties, transforms, SVG, WAAPI and the existing build/deploy workflow. A TypeScript/Vite migration or Three.js/WebGL2/GLSL engine on an account-security page is not technically justified by these six annotations and would introduce additional dependencies and runtime risk.

No Supabase Auth configuration, access token retrieval/copy behavior, session storage, credential logic, server RPC, workspace authorization, role assignment, database schema, permission policy or acceptance execution path is modified. The existing confirmation before copying a short-lived bearer token remains mandatory; token values are not placed into the DOM or logs by this presentation change.

## Verification boundaries

**Automated acceptance**: frontend tests; build and validation as defined by existing CI; disposable PostgreSQL regressions; exact-commit GitHub Pages smoke and successful Pages deployment. These verify implementation and release only after jobs finish successfully.

**Still requires signed visual/runtime inspection**: desktop/mobile layout at 320, 390, 768, 1094 and 1366px, 200% zoom, keyboard and screen-reader walkthrough, token-copy confirmation (without disclosing token), profile and session states, read-only verification execution, unsupported features, animation lifecycle and measured high-refresh-rate frame pacing. Do not claim 120 FPS or production signed interaction acceptance on static test evidence alone.
