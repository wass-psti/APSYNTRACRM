# CP-AUTH-VIS02 — APSYNTRA CRM login experience modernization

**Scope:** Only the two user-annotated login sections at `#/login` (`.auth-left` and `.auth-right`). All signed-session routing, real GoTrue authentication, workspace context, role restrictions, expired-session handling, and the remaining CRM views are unchanged.

## Existing architecture and technology choices

The production application currently serves static, same-origin ES modules and CSS on GitHub Pages. It does **not** have a Vite/TypeScript runtime build manifest in the repository. This checkpoint does not introduce Vite, a compiler, a bundler migration, or a second animation library to satisfy a technology checklist; doing so would expand the approved login-only scope. Instead it uses typed **JSDoc** interfaces over the existing JavaScript modules, HTML5, CSS custom properties and transforms, inline decorative SVG, native **Web Animations API**, and a best-effort pinned Three.js 0.170.0/WebGL 2/GLSL **single-frame** visual layer. It reuses the previously accepted third-party Three source and existing CSP without adding grants or a new network origin. Existing initialization has its own independently scoped Three implementation.

## Implementation boundaries

- `frontend/auth-markup.js`: independent, escaped login presentation with preserved `login-form`, `email`, `password`, `login-submit`, and `toggle-password` selectors; semantic landmarks, associated labels, accessible errors, descriptive button labels, a static clearly **illustrative** dashboard and decorative SVG.
- `frontend/auth-experience.css`: namespaced `#app .aps-auth-v2` visual tokens, responsive layout, refined card and input treatments, accessible focus/contrast states, a dark navy-indigo presentation panel, and reduced-motion overrides. No existing application board, topbar, sidebar or authorization styling is changed.
- `frontend/auth-experience.js`: login-only, cancellable native WAAPI entrance sequence. WebGL is requested only after idle, only on a sufficiently wide viewport with WebGL2, not in reduced-motion, low-memory, save-data or hidden-document conditions. Its asynchronous scene loading is not awaited by authentication and is cancellable when the login screen disappears.
- `frontend/auth-scene.js`: optional pinned Three.js/WebGL2 GLSL ambient gradient, rendered once and when resized or made visible. There is **no continuous RAF render loop** and no tracking, telemetry, credential access or network use beyond the optional pinned module fetch. The CSS background remains complete when WebGL, the CDN or GPU context is unavailable.
- `frontend/app.js`: delegates login markup and visual mounting; destroys animation and GPU resources before authenticated shell replacement or re-rendering the login. The password visibility toggle synchronizes `aria-label` and `aria-pressed`, without changing the underlying field or sign-in flow.
- `index.html`: includes one same-origin scoped login stylesheet. CSP directives, permission boundaries, auth client, board code and the existing Pages deployment architecture are unchanged.

## Verification and gates

Source regression tests cover preserved credential hooks, error escaping, markup accessibility, scope isolation, responsive/reduced-motion/high-contrast CSS, disabled WebGL under reduced motion, animation cleanup, cancellation before asynchronous import, static shader and GPU disposal, and unchanged session/auth wiring. GitHub Actions lint/build/frontend/CI and Pages deployment must be recorded against the exact commit.

**Pending browser acceptance (must not be called verified by CI alone):** Screenshot/visual review at 320px, 390px, 768px, 1094px, 1440px and high DPI; focus order and password toggle with keyboard and screen reader; correct form submission with actual signed user and denied/error states, successful route swap and resource cleanup; reduced-motion, low-power and WebGL-failure fallback; contrast and zoom; measured frame pacing on a 120-Hz capable machine. No production user credentials, access roles or records should be modified during visual QA.

**Risk note:** The decorative preview is explicitly labeled *illustrative*, not a live KPI report. Three.js remains an optional remotely pinned resource already allowed by the existing CSP. A fully locally bundled Vite/TypeScript/Motion pipeline is a separate architecture change and is intentionally not asserted by this checkpoint.
