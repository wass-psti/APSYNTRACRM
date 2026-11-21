# CP-CRM-UI-REDESIGN-02 — Deep native-workflow visual alignment

## Scope and design decision

Build upon the deployed Uiverse-inspired token system from CP-CRM-UI-REDESIGN-01, retaining the existing HTML5, CSS, and JavaScript modules, workspaces, navigation, signed sessions, CRUD, database APIs, and role configuration. Uiverse's [community component library](https://uiverse.io/elements) is an MIT-licensed visual reference, not a JavaScript dependency. No component code or assets were copied; all changes are original scoped CSS and tests.

## Audited modules and delivered changes

- **TradeLink:** Editor inputs, selectors, multi-line forms, save action feedback, active section navigation, and signed document-table keyboard focus. Document numbering, reviewers, approval, PDF and persistence logic are not modified.
- **TimeTracker:** Native current tab treatment and keyboard focus, with preserved horizontal navigation strip, attendance layouts and brand color.
- **FuelTrack+ v3:** Native action states, current tab focus and recent-record row focus, with fuel-specific accents untouched.
- **Fund Released Tracker:** Native header and report surface alignment, control focus and row navigation visibility, without changing document-voucher or finance behavior.
- **TalkBox:** Filter and drawer form focus, keyboard issue actions, highlighted active rows and existing meeting panels, while retaining drawer and table scroll mechanics.
- **Boards:** Common group, bulk-toolbar and row-focus treatments without changing sticky columns, row geometry, group scroll or event targeting.
- **Responsive, theme and motion:** At 720px and below, native action groups wrap without introducing fixed widths. Dark-mode borders follow the shared tokens. Native transitions respect reduced-motion preferences.

## Integration

`frontend/uiverse-native-workflows.css` is appended after the CP01 token layer by the existing deterministic style manifest. `index.html` updates only the stylesheet version string and manifest description. No new runtime network request or dependency; the existing generated CSS bundle is rebuilt. Older style-order tests now assert explicit layer positions rather than assuming the CP01 layer is permanently last.

## Test and acceptance boundary

- Chromium isolated module fixture: computed-style, keyboard and layout assertions at 390, 768 and 1440 CSS pixels. Covers all six scoped module families, native focus, active tabs, board horizontal scroll, dark borders and reduced motion.
- Run standard full regression, build and existing CSS and browser acceptance suites before merging; check required GitHub CI gates and published source after deployment.
- **Not certified** by isolated tests: visual review of every signed production route, real-account persistence, independent user sessions, hardware touch-device behavior, all third-party browser variants or business workflow acceptance. Those remain separate from the verified visual increment; do not fabricate sign-off.

## Change boundaries

No backend, Supabase, security, role, authentication, routing, schema, permissions, telemetry, timers, external libraries, or background agents changed. Original panel branding and user-facing business behavior are preserved.
