# CP-USER-ROLE-VIS01 — User Role Management visual modernization

**Scope:** Seventeen annotated areas on the signed `#/user-role-management` page. This includes content/topbar/session, header/refresh, bootstrap authorization warning, four server-derived summary metrics, workspace user selector, protected-account notice, CRM platform ceiling, inherited/explicit role card, twelve application assignments, individual board membership table and terminal domain access boundary.

## Architecture and implementation

APSYNTRA CRM production uses same-origin ES modules and CSS on GitHub Pages. This visual checkpoint intentionally preserves its current build/deployment/runtime architecture; no TypeScript/Vite migration, heavy Three.js/WebGL/GLSL scene, duplicated animation engine or telemetry is introduced on the sensitive administration page. SVG, CSS variables and GPU-friendly CSS transforms provide the design, with one-shot native Web Animations API entrance motion.

- `frontend/user-role-management.js`: retained existing server-backed role and membership snapshots and all `data-action` bindings. Added a verified-only `.aps-user-role-management` wrapper and semantic navy-indigo hero, static SVG, warning icon, four responsive metrics, semantic panels, accessible table headers, action styling hooks and bottom boundary notice. Protected-account buttons and disabled guards remain intact, including when CRM backend migration is unavailable.
- `frontend/user-role-experience.css`: CSS scoped exclusively to the user role route, including session header, responsive table scrolling, selected-user form, CRM platform role ceiling, application/board membership rows, disabled buttons, keyboard focus, reduced-motion and high-contrast styles. Other administrative and application pages are unaffected.
- `frontend/user-role-visuals.js`: short presentation-only, cancellable one-shot Web Animations API transitions. No network requests, event listeners, continuous GPU loops or timers; respects hidden-document and reduced-motion preferences.
- `frontend/app.js`: adds a route-local class and visual lifecycle mount/stop. Preserves all existing role management RPCs, signed authorization gates, confirmation dialogs, owner protection, revocation guards and revision checks.
- `index.html`: loads one same-origin stylesheet with unchanged CSP. `scripts/pages-smoke.mjs` adds exact-commit deployment verification for both visual assets.
- `frontend/tests/user-role-experience.test.mjs`: targeted regressions for denied access, loading, selected account, four counts, all twelve modules, board rows, protected and ordinary accounts, CRM fallback, action bindings, output escaping, motion cleanup and responsive accessibility.

## Security invariants

The current User Role Management page differs materially from the adjacent Role Configuration catalog: **its authorized, explicitly confirmed actions update existing production roles and memberships.** This redesign invokes none of those actions. The existing bootstrap-only authorization, server-side rejection of self-promotion or protected accounts, workspace isolation, stale revision denial, authenticated audit records, module-specific role vocabulary, CRM platform role ceilings and separate owner privileges remain authoritative.

No production records, credentials, access policies, role assignments, memberships, database schemas or application contracts were deliberately changed. Displayed counts remain server-backed. A board membership alone never authorizes finance, attendance or other restricted domain records.

## Acceptance and evidence

Automated frontend tests, disposable Postgres CI and exact-commit live Pages smoke must pass before classifying implementation and deployment as VERIFIED. Static tests are not signed-user acceptance.

**Pending live signed browser checks:** bootstrap and nonbootstrap views (without changing production permissions), protected/ordinary user selector states, read-only inspection of all actions, keyboard accessibility, screen-reader labels, 200% zoom, 320/390/768/1094/1366/1440px responsive layouts, reduced-motion, mobile table scroll, and measured high-refresh-rate frame pacing. Do not claim 120 FPS from CI or code inspection alone. Operationally sensitive role mutations require their own authorized acceptance fixture and change controls.
