# CP-ROLE-VIS01 — Bootstrap Role Configuration visual modernization

**Scope:** Twenty annotated areas of the signed `#/role-configuration` page, including the page frame, topbar, role title/refresh, staged-only notice, four live statistics, five-tab navigation, CRM platform authorization and permission ceiling, central role catalog, role search and table, proposal action buttons.

## Existing architecture and protected behavior

APSYNTRA CRM production serves same-origin ES modules and CSS on GitHub Pages. This checkpoint preserves that existing runtime instead of introducing a Vite/TypeScript migration, Motion dependency, a Three.js/WebGL/GLSL canvas or continuous rendering work in an administration page. SVG icons, CSS variables, responsive CSS and interruptible native Web Animations API are used where useful.

**The role interface remains bootstrap-only.** An unverified identity receives the existing `Access unavailable` denial without any role or membership data; the app's backend-authoritative `roleConfig.bootstrapVerified()` gate remains untouched. The `STAGED ONLY` banner retains its exact meaning: no production role, account membership, permission, bootstrap identity, or board access is changed by a proposal. Immutable reference roles remain protected and uneditable.

- `frontend/role-configuration-ui.js`: wraps verified content in `.aps-role-configuration`, adds a semantic hero and decorative static SVG, reuses the existing authoritative counts for four enhanced statistic cards, improves accessibility of the five tab buttons using `aria-pressed`, adds CSS hooks for CRM permission ceilings, role catalog heading, staged reference explanation, role search, proposal actions and responsive tables. Original role proposals, filters, identifiers and status mapping remain unchanged.
- `frontend/role-configuration-experience.css`: route-scoped styling only. Premium navy-indigo header, readable staged-only warning, count cards, keyboard focus, responsive tabs, table horizontal scrolling, accessible status cells, search, and contrast/reduced-motion options. Scoped to `#app .aps-role-configuration` and `#app .aps-role-config-shell` so no other board, admin, financial or security view is restyled.
- `frontend/role-configuration-visuals.js`: allowlisted static SVG icons and one-shot short native presentation animations, skipped when hidden or reduced motion requested. Cancels on view re-render/navigation/logout; no animation timer, network calls, telemetry or GPU rendering loop.
- `frontend/app.js`: only adds the isolated shell class and animation mount/cleanup. Existing signed backend handlers, modal validations, proposal submissions, tab routing and permission checks remain unchanged.
- `index.html`: loads one same-origin stylesheet without changing CSP or build pipeline.
- `scripts/pages-smoke.mjs`: exact-commit live Pages SHA checks include the two new role visual assets.
- `frontend/tests/role-configuration-experience.test.mjs`: seven regression tests covering the twenty annotations' principal features, bootstrap denial, protected role boundaries, staged-only semantics, preserved proposal actions, counts, data escaping, accessibility and animation lifecycle.

## Acceptance scope and remaining work

Run full frontend regression, disposable Postgres workflows and exact-commit Pages smoke. Their passing verifies only those automated checks, not genuine signed-user acceptance. Browser acceptance still requires a real bootstrap administrator sign-in and separate nonbootstrap denial, clicking all five tabs, role searching and all staged proposal modal flows under authorized nonproduction conditions, 320/390/768/1094/1366/1440px viewport checks, 200% zoom, keyboard focus, contrast and reduced motion. Real 120 FPS needs high-refresh-rate frame-pacing evidence and is not claimed from source review.

Do not promote any role proposal to an actual permission change as part of this visual checkpoint. Record implementation, tests, deployment and signed browser acceptance independently.
