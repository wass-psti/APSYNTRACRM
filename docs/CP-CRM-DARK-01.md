# CP-CRM-DARK-01 — Shared dark tokens and workspace overlays

## Scope and baseline

Based on the existing APSYNTRA dark-mode analysis, the problem is not the underlying role or workflow API. The site-level theme toggle sets `html[data-aps-monday-theme="dark"]`, but the shared shell and workspace menus have separate hardcoded colors; workspace picker, browser, details and create dialogs can retain white surfaces. No code in this milestone changes theme preference persistence, backend, API calls, access control, module workflows, or light-mode design.

## Delivered

- One final, dark-scoped `frontend/dark-theme-foundation.css` using semantic canvas, navigation, surface, elevated, hover, text, muted text, border, accent and focus tokens.
- Consistent dark sidebar branding, labels, navigation, workspace switcher, active and hover states, and bottom account region with the existing layout and click targets preserved.
- Dark-mode surfaces and readable content for workspace selection menu, browse-all dialog, workspace details, and workspace creation. Scoped input colors, focus rings, tabs, hover states and primary actions are included.
- Existing reduced-motion behavior retained; this layer adds no animation, new dependency, runtime script, shadow-heavy effects, or `!important` selectors.
- Existing deterministic single CSS bundle updated and versioned to force clients to retrieve the change. Original light-mode computed styles remain unchanged in Chromium fixture tests.

## Evidence

- Chromium fixture comparison at widths 390, 768 and 1440 CSS pixels: 162 assertions PASS on actual computed styles and keyboard/reduced-motion states.
- Representative dark panels `#242832` with primary text `#edf0f7`: 12.92:1 contrast; selected navigation text: 9.14:1; workspace primary action: 5.55:1; tested muted navigation label: 8.88:1. These are fixture measurements, not exhaustive WCAG certification.
- All measured light-mode foreground/background values preserved across 17 fixture elements and three widths.
- Regression suites, build, and CI evidence must be checked separately before merge/deployment.

## Acceptance boundaries

**This phase completes shared shell and workspace-overlay dark corrections only.** TradeLink and Fund Tracker native components previously exhibited near-white text on light internal panels in fixtures; those module-specific concerns are deferred to a separate, bounded dark-mode native component phase, not assumed resolved. Signed authenticated production walkthrough, all screen variants and hardware touch-device acceptance are also not certified by the fixture. No added restrictions or changed roles/permissions.
