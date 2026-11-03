# CP-SECURITY-VIS01 — Access Acceptance UI modernization

**Scope:** The fourteen annotated areas on the signed `#/security` route: content, breadcrumbs, signed-session badge/avatar, security title/hero, nine independent signed acceptance checkpoint panels, and the terminal security-boundary notice. No redesign of the sidebar, onboarding, other views or shared authorization logic.

## Architecture and implementation boundary

APSYNTRA CRM is currently deployed as static ES modules and same-origin CSS on GitHub Pages, not a TypeScript/Vite production build. Preserve that established build and deployment contract; do not introduce a separate toolchain, Three.js/WebGL 2/GLSL scene, additional animation dependency, continuously animated background, or telemetry on the security acceptance page. Native CSS transforms, SVG and the Web Animations API provide the required restrained visual polish.

- `frontend/board-security-ui.js`: A new `.aps-security` view root and accessible `security-hero` containing the **unchanged** Page A/security title/description. Nine checkpoint `section` panels with semantic `h2` headings use the exact existing test copy, action IDs, result fields, disabled guards and backend data. Terminal security notice converted to a labelled visual `aside` with decorative inline SVG. No security report content or classifications changed.
- `frontend/security-experience.css`: all style rules route-scoped to `#app .aps-security` and `#app .aps-security-shell`. Includes signed topbar, neutral sequential checkpoint markers, restrained navy-indigo hero, readable status/denial notes, responsive forms and tables, keyboard focus, hover, contrast and reduced-motion modes. Semantics remain **read-only**, **not eligible**, **BLOCKED** and **PENDING** as independently determined by the backend, never synthetic PASS.
- `frontend/security-experience.js`: native one-shot, cancellable presentation-only entrance transitions with no timer, requestAnimationFrame, network call or GPU context. Animations are cancelled on rerender/route change and not started under reduced-motion/hidden-document conditions.
- `frontend/app.js`: only adds a foundation-like per-route CSS class and animation mount/cleanup. All signed test handlers, explicit authorization and server-authoritative role classification remain intact.
- `index.html`: adds one same-origin stylesheet with the existing CSP unchanged.
- `scripts/pages-smoke.mjs`: verifies deployment of both new assets byte-for-byte at the exact intended commit.
- `frontend/tests/security-experience.test.mjs`: targeted cases for the view boundary, all nine action IDs, disabled bootstrap/admin controls, escaping, responsive layout and motion cleanup.

## Security invariants

Existing server-side Auth, role ceilings, workspace isolation, role transition constraints, signed RPC calls, sanitization, copy-only nonsecret exports, protected domain data and production permissions remain unchanged. The first negative-authentication panel must continue disabling its test for eligible workspace administrators. The independent SEC14 foreign-workspace denial requires an existing eligible nonbootstrap account. The SEC10 transition probe must continue requiring an existing authorized board, backend-confirmed transition stage, separate fresh session and nonproduction prerequisites. Choosing a stage never grants access. Do **not** weaken denial logic to obtain UI PASS.

The content includes clear boundaries: CI07 does not certify token revocation, SEC14 does not certify finance writes, SEC09 does not certify mutation/revocation, and SEC10 does not certify fresh token issuance or prior board ownership. These disclaimers must remain visible, including when report results are displayed. No production data mutations or grants were performed for this visual-only checkpoint.

## Acceptance

Automated repository tests, CI disposable Postgres workflows and exact-commit live Pages smoke are necessary for implementation/deployment verification. They do not substitute for actual signed-user/denied-role browser checks. Pending interactive acceptance includes keyboard tab/enter/space, 200% zoom and 320/390/768/1094/1366/1440 viewport checks; signed admin/nonadmin behavior; inactive/denied states; all read-only reports and copy operations without personal identifiers; SEC10 controls; contrast; reduced-motion; and actual measured frame pacing on a compatible 120 Hz display.

**Status classification:** Mark the implementation and deployment VERIFIED only with exact GitHub Action evidence. Signed-browser visual interaction and 120 FPS performance remain PENDING unless measured.
