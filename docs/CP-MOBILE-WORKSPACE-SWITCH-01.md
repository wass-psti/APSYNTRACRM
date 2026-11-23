# CP-MOBILE-WORKSPACE-SWITCH-01

## Status

**Implemented and locally verified.** Production deployment remains subject to the normal pull-request and Pages deployment workflow.

## Root cause

The mobile shell in `frontend/mobile-home.css` intentionally hides the desktop sidebar and topbar at the 810px breakpoint. The desktop workspace selector was inside the hidden sidebar, while the mobile home and mobile application header did not render an alternative entry point. The existing workspace selector and switching handler were present and enabled; the mobile shell simply did not expose them.

## Implementation

- Added a shared mobile workspace-switch button renderer in `frontend/mobile-home.js`.
- Added the button to the mobile home hero beside the current workspace identity and settings control.
- Added the same action to the mobile application header so it remains reachable from application routes.
- Both buttons use the existing `data-action="ws01-open"` action. The existing application handler continues to call `openWorkspaceSelector()` with the existing signed lifecycle client and in-place workspace transition callback.
- The application-header accessible label and title are refreshed from the current workspace identity whenever the mobile shell synchronizes.
- Added responsive styling, keyboard focus indication, and a minimum 44px touch target. At widths up to 360px, the application-header control collapses to its icon while retaining its descriptive accessible label.
- Generated `frontend/apsyntra-styles.bundle.css` from the existing ordered stylesheet manifest and updated both stylesheet and mobile-module cache keys in `index.html` so deployed browsers fetch the restored controls.
- Added a repeatable Playwright acceptance command: `npm run test:mobile-workspace-switch`.

No changes were made to the workspace database, workspace assignments, lifecycle RPCs, authorization policy, or desktop selector implementation.

## Acceptance evidence

- `npm run test:mobile-workspace-switch` — 55 Playwright checks passed. The browser fixture exercised the actual mobile-home module and existing `workspace-ui.js` selector, including two workspace-selection flows through a fixture lifecycle adapter.
- Responsive viewports: 320, 360, 390, 430, 768, 810, and 811 pixels. Both mobile entry points were checked separately; the original desktop sidebar selector remains visible at 811px.
- `node scripts/cp-crm-ui-restore-01-mobile-browser.mjs` — 20 existing mobile navigation, search, favorites, workspace-reset, and desktop-isolation checks passed.
- Focused workspace and mobile tests — 56 passed, 0 failed.
- `npm test` — 3,476 passed, 0 failed.
- `npm run check` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed. Vite reported its existing general large-chunk advisory (>500 kB); the build completed successfully.
- `node scripts/build-priority5-styles.mjs --check` — CSS bundle matches all 78 manifest sources.
- `git diff --check` — passed.

The Playwright fixture uses a controlled in-memory lifecycle adapter; it does not claim a live two-account production switch. Existing signed workspace lifecycle behavior is unchanged and its repository regression tests passed as part of the full suite.

## Constraints

No gradient-descent, backpropagation, model-training, fine-tuning, iterative weight-update, or model-parameter modification code, dependencies, or execution paths were introduced. The existing inference-only architecture is unchanged.
