# CP-CRM-UI-REFINEMENT-03 — Existing-browser acceptance and board menu ARIA reconciliation

## Scope

This milestone follows the CP01 and CP02 deployments. Use only the **already open signed APSYNTRA CRM Chromium tab** for live production inspection. The visual and interaction acceptance does not create boards, update attendance, change user roles, or exercise destructive actions. The local browser regression fixture is disposable and isolated from production.

## Production findings and reproducible defect

- The published CP02 CSS was verified in production and recognized in the existing Chromium tab after a normal refresh; its design token `--crm-app-focus` resolved to the expected value.
- The existing signed Overview and Boards interfaces have accessible card action menus, including **256** menu surfaces on the boards list. A read-only audit visited Overview, Boards, FM1, TimeTracker, Fund Tracker, FuelTrack+, TradeLink, TalkBox, Teams, and Settings and restored the original route. No page-level horizontal overflow was observed on these ten routes at **1275px CSS viewport width**.
- At a foreground, stable viewport position, the tested board-card popover was placed inside the viewport. When the CRM tab was backgrounded, Chromium throttled its requestAnimationFrame positioning, leaving the fallback menu at CSS `left:-10000px` until the tab returned to foreground. This is a browser visibility effect, not by itself a production placement regression. The acceptance runner now explicitly marks those checks blocked instead of incorrectly reporting off-screen placement as a confirmed defect.
- A separate intermittent mismatch was reproducible during successive live menu interactions: an open menu was visibly placed correctly, but the summary sometimes retained `aria-expanded="false"`. This is an accessibility state synchronization defect, independent of board permissions or the actual menu command implementation.

## Focused implementation

`frontend/action-menu-experience.js` now synchronizes a summary's `aria-expanded` with its parent native `<details open>` state on the existing root MutationObserver's `open` attribute notifications. No per-menu observer, new event loop, new dependency, positioning behavior, menu action dispatch, business logic, or authorization change was added. This covers coalesced native `toggle` events during rapid interactions, as well as ordinary explicit open/close flows.

`frontend/tests/action-menu-experience.test.mjs` verifies the presence of the constrained attribute observer and the existing menu semantics. `scripts/group-action-menu-browser.mjs` also tests three sequential board menus: rapid native open/close state, truthful `aria-expanded`, and preservation of existing pointer, dismissal, focus, and Escape behavior.

## Reproducible live acceptance

The one-shot `scripts/cp-crm-ui-refinement-03-acceptance.mjs` communicates only with the existing Chromium tab through Apple Events, uses `scripts/cp-crm-ui-refinement-03-existing-tab.js` to inspect ten routes and foreground-visible menu positions, and saves a JSON report under `/tmp`. It restores the original route and **never clicks a menu command or submits a form**. If the user switches tabs while the runner is active, the relevant menu check is reported as `BLOCKED` rather than an invented CSS failure.

## Certification boundaries

- Live desktop route overflow and actual menu interaction observations are grounded in signed production browser evidence.
- Responsive/mobile keyboard, menu layout and WCAG behavior are also covered by CP02's isolated Chromium tests at 390px, 768px, and 1440px, but **not** every real module screen on those device sizes.
- Complete visual sign-off of every role-restricted application state and all nested 256-board interactions requires authorized screens and a stable visible production tab. An automated build, screenshots of two pages, and representative fixtures alone cannot establish exhaustive application-wide certification.
- No SQL, API, credential, policy, or production record changes are permitted by this milestone. Final deployment and signed-browser acceptance must be verified separately.
