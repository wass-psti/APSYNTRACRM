# CP-BOARDS-VIS01 — My boards catalogue redesign

**Scope:** Ten annotations on the signed `#/boards` page: content area, signed topbar, title, account/session pill, New board action, Active/Archived/Trash filters, board search, live matching count, board-card grid, and board actions menu. No changes to application-wide sidebar, overview, authentication flow, board data, membership or backend.

## Architecture

The deployed repository uses static native ECMAScript modules and same-origin stylesheets on GitHub Pages. It does **not** currently have a Vite + TypeScript production build. This work preserves that operating contract instead of introducing an unrelated compiler/build-system migration. It reuses existing signed board-card markup, source data, authorization and status handlers. The optional animation is cancellable native Web Animations API. No Motion library, Three.js/WebGL2 canvas or GLSL shader is introduced on this operational list page because it would add GPU cost and lifecycle complexity without useful functionality.

## Scope of changes

- `frontend/app.js`: only `boardsPage()` presentation and the per-route `.aps-boards-shell` toggle / animation lifecycle. Existing hash routes, lifecycle RPCs, search handlers, `cards()`, `matchBoardSearch()`, `boardCard()`, protected module policies, status mutations and confirmation flows remain unchanged.
- `frontend/board-catalog-experience.css`: CSS custom properties, typography, premium navy-indigo hero, filter card, accessible segmented control, search input, result count, responsive grid and board action menu. All selectors are prefixed by `#app .aps-boards` or `#app .aps-boards-shell` and are inactive on other pages.
- `frontend/board-catalog-visuals.js`: one-shot, reduced-motion-aware and cancelable entrance effect using native Web Animations API, no polling/render loops.
- `index.html`: additional same-origin stylesheet; **CSP unchanged**.
- `scripts/pages-smoke.mjs`: final live-CDN SHA verification for both new assets.
- `frontend/tests/board-catalog-experience.test.mjs`: six targeted tests for route scoping, all ten annotations, signed state, preserved board-card permissions and action hooks, hidden-search behavior, accessible states, responsive layout and animation cancellation.

## Safety and behavior

The **Active, Archived, Trash** button actions remain `active-boards`, `archived-boards` and `trashed-boards`. Trash remains behind the existing board lifecycle feature flag. Their visual `aria-pressed` states follow the existing signed UI state. Search still sets `state.boardSearch` and filters existing `data-searchable` board-card elements without re-fetching server data. The new CSS explicitly honors `[hidden]` on flex cards to avoid visual search regressions. Live match count and empty-state affordances remain the same IDs and use `aria-live="polite"`.

The **New board** button retains its established `data-action="new-board"` handler. Board-card Edit, Move to Trash and Restore are controlled by the **unchanged** `boardCardActionState` and authenticated RPC paths. Protected application-managed boards remain nonmutatable from this view. The ellipsis `<details>` menu remains separate from the main board link, keyboard-accessible, with elevated stacking when open. No production record, role, permission, SQL function or RLS policy is modified.

## Verification gates

Automated build/frontend/PG/live Pages checks will be attached to the final commit. **Genuine signed-user browser acceptance** still requires role-specific checks on Active/Archived/Trash, search and reset, keyboard/focus, all board menu actions including denied actions, opening the correct board, and 320/390/768/1094/1366/1440px/resized views. Check reduced-motion and 200% zoom. **120 FPS** is a target only; do not label achieved without real frame pacing data from compatible 120Hz hardware.

**Conclusion rule:** Mark implementation, frontend tests and deployment VERIFIED only with final-commit evidence. Keep browser functional, responsive, and high-refresh-rate performance acceptance PENDING until independently observed.
