# CP-CRM-UI-REDESIGN-03 — Actual command-center transformation

## Problem and root cause

CP01 and CP02 delivered token and interaction refinements but did not materially change layout. Additionally, an older minimalist stylesheet contains highly specific rules that flatten the Overview hero, stats, card surfaces and essentials into transparent, borderless panels. Later, less-specific declarations failed to win the cascade. This was directly reproduced in Chromium on the baseline.

## Implementation

- Rebuild the Overview's content hierarchy as a two-column command center, with the existing recent-board cards on the left and workspace essentials rail on the right when the verified role context is available.
- Convert the hero into a large editorial light panel with a separate workspace index, larger heading, accessible refresh and create actions and layered gradients.
- Introduce a dark navy persistent sidebar with highly visible selected state, existing collapse/mobile navigation, workspace switcher and identity section.
- Build a new metric rail with a contrasting dark lead card; preserve all authoritative counts and role labels.
- Restyle My Boards hero/filter/card surfaces for visual consistency without rewriting board catalog behavior.
- Use selectors that explicitly exceed the legacy Overview minimalist rule specificity. Preserve the old stylesheet's other route styles.
- Retain current board links, sidebar routes, actions, signed auth context, navigation event handlers, module boundaries, workspace isolation, API payloads and RLS.
- Single existing CSS bundle, no third-party runtime package. Uiverse visual guidance: https://uiverse.io/elements; original CSS, no copied components or assets.

## Verification and evidence

- `scripts/cp-crm-ui-redesign-03-browser-acceptance.mjs` renders the same representative content under the previous and revised shipped CSS and captures PNG images at 390, 768 and 1440 pixels, saved locally under `/tmp/cp-crm-ui-redesign-03-evidence`.
- Assertions inspect actual computed gradients, metric background, grid placement, keyboard focus, reduced motion and viewport overflow. The evidence is fixture-based and must not be called a genuine signed production screenshot.
- Standard application tests, build and existing browser fixtures must also pass before merge; record the results separately.
- Validate published CSS and Pages deployment separately from merge.

## Acceptance boundary

This changes the recognizable shell and Overview layout and the board-catalog appearance. It does **not** claim every native application has been independently visually redesigned or signed production-tested. Genuine authenticated multi-route before/after visual acceptance, physical-device interactions, data persistence and multi-account approval remain separate gates. No additional restrictions, role/permission changes, database migrations or server behavior changes.
