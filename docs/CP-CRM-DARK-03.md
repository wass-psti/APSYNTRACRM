# CP-CRM-DARK-03 — Compact enterprise dark-mode visual treatment

## Design reference and constraints

The user supplied a screenshot of monday.com Work Management in dark mode. This is a **visual inspiration**, not source code, a component library, or a request to copy its brand. Implement original charcoal and blue APSYNTRA styling. Maintain existing navigation, overview content, dashboard records, module routes, light mode, business workflows, roles, RLS and signed session behavior. The prior oversized command-center redesign was rejected and rolled back; avoid large gradients, floating panels, animation and unnecessary layout changes.

## Delivered on the review branch

- Palette: near-black canvas `#121212`, sidebar `#181818`, panel `#292929`, subtle borders `#484848`, selection blue `#193c78`, off-white text, visible focus.
- Compact sidebar active/hover treatment and flattened workspace switcher. Existing sidebar collapse and mobile icon-only mode remain intact.
- Existing Overview content receives a flat charcoal header, concise heading, compact mobile buttons, restrained metric and board cards, simplified essentials. **No new homepage sections or navigation flow.**
- My Boards filters/cards, shared menus/forms and native module panels inherit the same dark color family.
- Correct previous dark Overview CSS's hardcoded `!important` blue-gray surface overrides to consume the semantic dark tokens; this is necessary for the new charcoal panel to win the cascade without adding any new `!important` rules.
- The new stylesheet is dark-scoped and appended to the existing single CSS bundle. No new runtime library or network request.

## Visual evidence and testing

The Chromium fixture uses representative content, not a signed account. It renders previous and proposed bundles at 390 and 1440 CSS pixels. These four files are evidence of **proposed visual appearance only**:

- `docs/visual/cp-crm-dark-03/fixture-before-1440.png`
- `docs/visual/cp-crm-dark-03/fixture-after-1440.png`
- `docs/visual/cp-crm-dark-03/fixture-before-390.png`
- `docs/visual/cp-crm-dark-03/fixture-after-390.png`

The automated browser check also covers 768px, light-mode computed color preservation, selected-state contrast, heading contrast, keyboard focus, and reduced motion. Existing module/browser regressions and full build must pass before merge.

## Acceptance boundary

This does not certify the aesthetic preference of the actual signed application, screenshots from every native route, physical-device interactions or full WCAG 2.2 AA. Do not call the fixture images authenticated production screenshots. The checkpoint remains a review candidate until visual approval; a passing build or stylesheet test is not visual acceptance. No production data or permissions are modified.

## Role Configuration dark-mode element adaptation

After the user accepted the proposed overall dark direction and requested refinement of `#/role-configuration`, this review branch gained `frontend/dark-role-configuration.css`, scoped exclusively to `html[data-aps-monday-theme="dark"] #app .aps-role-configuration` and its shell.

Coverage includes the role header, metrics, selected tabs, help/warning notes, role catalog and audit tables, input/search/select controls, focus and keyboard states, plus the embedded Native Application Access user picker, per-application selection/role, and bulk-assignment controls. Dark surfaces use the same flat charcoal/blue palette as Overview; light mode remains unchanged. No role configuration, grant, server-side permission or persistence logic is altered.

Representative Chromium role-page screenshots (fixture data, not a signed session):
- `docs/visual/cp-crm-dark-03/role-before-1440.png`
- `docs/visual/cp-crm-dark-03/role-after-1440.png`
- `docs/visual/cp-crm-dark-03/role-before-390.png`
- `docs/visual/cp-crm-dark-03/role-after-390.png`

Role-specific browser acceptance checks actual computed surfaces, 4.5:1 text contrast, focus states and light-mode invariance at 390/768/1440 pixels. Existing horizontal tab/table scrolling is preserved. These are not authenticated production readback or real-device certification.

## Shared controls and interactive states

The dark presentation also harmonizes sidebar board search, navigation collapse and add-board affordances, topbar global search and keyboard hints, connection/synchronization indicator (including offline/reconnecting), sign-out, board action menus, board item counters, form fields, hover and focus treatment. Existing actions, event handlers, session verification and save/readback behavior remain untouched.

`scripts/cp-crm-dark-03-elements-acceptance.mjs` verifies light/dark computed colors, borders, hover/focus, reduced motion, and disconnected-sync visual state in Chromium across 390/768/1440px. This is presentation acceptance only, not an actual network disconnect or a signed production session.
