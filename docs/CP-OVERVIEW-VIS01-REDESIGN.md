# CP-OVERVIEW-VIS01 — Overview-only visual modernization

**Date:** 2026-11-03  
**Scope:** The 20 annotated areas on `#/overview`: signed topbar, session and account controls, greeting, Refresh and New board actions, four workspace statistics, Your boards heading, the six recent board tiles, Workspace essentials and their supporting layout.

## Architectural boundary

- Keep APSYNTRA CRM's current production setup: static same-origin ECMAScript modules/CSS and GitHub Pages. This is not a Vite/TypeScript application at this checkpoint. No migration to Vite, compiler installation or unsupported claim of compiled TypeScript.
- Overview content is wrapped in `.aps-overview`; only the signed main element receives the transient `.aps-overview-shell` class while `state.view === 'overview'`. The topbar, board tiles and panel CSS are prefixed to these roots. The existing sidebar, other route styling, board actions, and authentication screens are unaffected.
- No Three.js/WebGL/GLSL or Motion for JavaScript runtime was added: rendering a GPU scene inside a dense operational dashboard would increase power and lifecycle overhead without a defensible benefit. Use CSS transforms and compositor-friendly native Web Animations API for brief one-shot entrance motion, plus static decorative SVG.

## Implemented features

- **Overview hero:** Accessible heading, signed greeting, protected visual backdrop and original `data-action="refresh"` and `data-action="new-board"` controls with stable native buttons.
- **Statistics:** Four cards use only the same existing `state.boards.length`, summed `state.boards[].item_count`, verified workspace label, and signed `state.context.profile.platform_role`. No synthetic counts, guessed revenue or health indicators were introduced.
- **Board cards:** Existing shared `boardCard()` function is left unchanged, preserving board IDs, accessible card links, separate `details` management menus, protected-application behavior, role gates and edit/trash/restore actions. Only cards **within** `.aps-overview .overview-board-grid` receive refined visual treatment, focus borders and responsive wrapping.
- **Workspace essentials:** Existing three explanatory statements remain unchanged. Only layout/icon treatments are refined; no new permissions or evidence state is asserted.
- **Signed topbar:** Scoped signed-session pill, breadcrumbs and account avatar styling; no change to auth state or sign-out.
- **Motion:** `overview-visuals.js` supplies static safe SVG primitives and a cancellable native Web Animations API entrance on first route entry; repeat renders do not replay it. Reduced-motion and hidden documents disable motion. No polling, telemetry, RAF loop or GPU context.
- **Responsiveness:** Cards adapt from three columns to two and one. Stats adapt from four to two and one, including very narrow phones. Keyboard focus, increased contrast and disabled animation preferences are explicitly handled.

## Files modified

`frontend/app.js` (overview markup and narrowly scoped mount), `frontend/overview-visuals.js`, `frontend/overview-experience.css`, `index.html`, `frontend/tests/overview-experience.test.mjs`, `scripts/pages-smoke.mjs`, and this document.

## Acceptance gates

Automated tests cover view-specific CSS scoping, live signed data provenance, unchanged card-management actions and permissions, escaping, all 20 annotated areas, static icon safety, accessibility selectors, reduced-motion and animation cleanup. Production SQL, RLS grants, tokens and records must remain untouched.

**Separate genuine browser evidence still needed:** actual authorized and denied-role signed navigation, Refresh, New board, menu/focus operation, 320/390/768/1094/1333/1440 viewport captures, 200% zoom, reduced-motion, actual GPU/main-thread frame pacing on an appropriate 120Hz display and long-session memory behavior. Passing CI verifies integration, not runtime performance certification.

**Deployment:** Attach final commit and GitHub Actions frontend/Postgres/live-Pages status; do not mark browser acceptance or 120 FPS as verified without evidence.
