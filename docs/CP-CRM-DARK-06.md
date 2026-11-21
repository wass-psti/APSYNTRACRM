# CP-CRM-DARK-06 — Cross-module dark-control audit and corrections

## Audited boundaries

Compared the current dark styles against standalone CSS used for workspace invitations, board sharing, Teams, global search/native-record details, and Settings. The earlier workspace invitation and board share corrections are already in the last layers of the stylesheet bundle. Teams ships an independent dark palette; no additional override was justified. The **global search dialog and native document detail drawer** were confirmed to use hardcoded white panels and light-text values, as did many **Settings / Account & security** nested surfaces. Both were outside prior dark passes.

## Implemented

Added a final scoped dark-only CSS layer (`frontend/dark-search-settings.css`): search modal, input, result row hover/selection, keyboard navigation indicators, descriptions, native preview and record field cards; Settings background/topbar, headings and profile fields, session/callout/warning panels, verification-result containers, buttons, status chips and focus. Preserved light palette and layout geometry. No new runtime package, API, authentication, role, permission, persistence, keyboard handling or search state logic.

## Acceptance evidence

`node scripts/cp-crm-dark-06-browser.mjs` uses Chromium to compare the previous deployed stylesheet with the updated one on identical representative Global Search, native-record preview and Settings DOM at 390, 768, 1440 CSS px in light/dark mode. It checks contrast of sampled labels and headings (>=4.5:1), dark control backgrounds, visible focus, reduced motion and light-mode computed color preservation. Fixtures in `docs/visual/cp-crm-dark-06/` are **not screenshots of authenticated production**. Full tests, build, PR CI and Pages deployment are distinct gates.

## Remaining acceptance boundary

The live signed tab was discoverable/readable through the Browser connector, but it exposes no interactive controls in this environment. Therefore, signed role-by-role click-throughs, user-owned workflows and real-device touch acceptance remain unverified. Do not invent signed visual results or create test users or production data solely to certify visual styling. Future work should focus on specific documented remaining defects, not another blanket styling layer.
