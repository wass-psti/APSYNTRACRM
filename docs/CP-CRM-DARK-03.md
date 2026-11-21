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
