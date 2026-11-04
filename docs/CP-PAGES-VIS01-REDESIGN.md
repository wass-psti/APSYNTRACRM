# CP-PAGES-VIS01 — Production Pages acceptance visual redesign

## Scope and objective

This change modernizes five annotated regions of the signed `#/acceptance` route only: the page wrapper, top navigation, secure-session account indicator, heading and backend acceptance panel. It preserves the existing signed persistence QA workflow and the native transaction QA workflow. The `APSYNTRA QA` board is explicitly **nonproduction** and is the only accepted target for opt-in write tests.

## Implementation

- `frontend/pages-acceptance-ui.js`: Semantic page heading, approved-backend architecture header and two distinct task cards for persistence and native transaction acceptance. The existing dynamic error/result states, action IDs and safety statements are retained. If the QA board is missing, neither mutation control is rendered; only the actionable link to the board catalog is offered.
- `frontend/pages-acceptance-experience.css`: Scoped hero, topbar, session indicator, QA/test cards and result panels with responsive/mobile, keyboard-focus, reduced-motion and high-contrast treatments. No changes to unrelated routes.
- `frontend/pages-acceptance-visuals.js`: Static SVG illustrations and cancellable one-shot entrance animations. No additional animation engines, network access, WebGL context, persistent render loops or telemetry.
- `frontend/app.js`: Adds only the scoped route class and animation lifecycle hooks; the existing `run-pages-acceptance` and `run-native-acceptance` handlers, confirmation modal and signed backend APIs are unchanged.
- `index.html` and `scripts/pages-smoke.mjs`: Load and verify new same-origin assets through the existing GitHub Pages/CSP pipeline.
- `frontend/tests/pages-acceptance-experience.test.mjs`: Route isolation, QA gating, existing actions and confirmation hooks, disabled/busy states, escaped result data, failure/cleanup messaging, accessibility, responsive style and animation lifecycle.

## Safety boundaries

The acceptance page performs real writes **only after the current user's explicit modal confirmation** and only using the `APSYNTRA QA` board and existing session-scoped backend APIs. This redesign does not execute an acceptance run, create any QA data, change production roles or permissions, or alter Supabase, RLS, audit, persistence, deployment policy or transaction code.

A backend approval label means the architecture is configured, not that this redesign independently verified every permission or QA test. Never imply production-write acceptance passed merely because the button is present.

## Technology selection

Retain the application's existing ES-module and GitHub Pages frontend rather than forcing a TypeScript/Vite migration into this scope. HTML5, CSS3/custom properties, SVG, compositor transforms and native Web Animations API are sufficient for the requested design. Three.js, WebGL 2 and GLSL shaders would introduce graphics overhead on an authorization-sensitive page without measurable functional benefit.

## Acceptance evidence to collect

- Existing CI frontend suite, three disposable PostgreSQL suites and production Pages build.
- Exact-commit live Pages smoke including the two new frontend assets.
- Separate authenticated-browser inspection: desktop/mobile, keyboard/focus, screen reader, reduced motion, existing `APSYNTRA QA` present/missing, modal cancellation/confirmation, authorized/denied requests, result persistence and page refresh.
- Actual performance measurements on suitable devices if claiming the aspirational 120 FPS target.

Completion statements must distinguish successful builds and automated checks from signed-user runtime acceptance and measured frame pacing.
