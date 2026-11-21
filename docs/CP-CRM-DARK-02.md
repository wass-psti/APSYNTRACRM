# CP-CRM-DARK-02 — Native application dark-mode surfaces

## Verified baseline and correction

The global `data-aps-monday-theme="dark"` attribute was already present in APSYNTRA CRM, but TradeLink's reference portal and Fund Tracker's reference dashboard independently defined hardcoded white cards, navigation, tables, and text. Prior representative Chromium measurements found near-white inherited text against white internal containers (approximately 1.14–1.17:1). CP-DARK-02 adds a strictly dark-scoped semantic native layer after the existing CSS. It does not change light theme, module geometry, signed business data, authorization, backend APIs, or routes.

## Implementation

- TradeLink: dark portal background, header, document cards, editor panels, menu, navigation, text hierarchy, form controls, active/hover states and keyboard focus. Document state, review and PDF policies are untouched.
- Fund Tracker: dashboard canvas, metrics, chart surfaces, filters, table cells, row hover, actions, popover, text, warning and financial status colors. Voucher, accounting and approval logic unchanged.
- FuelTrack+: representative dashboard panel and header hierarchy.
- TalkBox: native panel, metric, filter, drawer and table surfaces inherit semantic dark variables without changing message/meeting workflows.
- TimeTracker: shared native panel foreground/background in dark mode.
- No new runtime packages, animations, permissions, schemas, APIs, or role changes; stylesheet remains in the original deterministic bundle.

## Acceptance evidence

- Isolated real Chromium tests use previous and new CSS against identical representative module DOM at 390, 768, 1440 CSS pixels in light/dark themes: 273 checks passed on computed backgrounds, foregrounds, representative text contrast, focus, reduced motion, and unchanged light-mode values.
- Tested dark native panels are not white; representative tested text and headings meet >=4.5:1 contrast. This is targeted fixture evidence rather than exhaustive WCAG 2.2 AA certification of all signed production documents.
- Full application regression, production build, CSS bundle integrity, prior fixtures and CI must be recorded separately before merge.

## Scope boundary

All live signed route-by-route visual acceptance, full native application control inventories, chart/data-specific colors, role-specific QA screenshots and physical touch-device tests remain independently unverified. Do not describe isolated Chromium fixtures as authenticated production acceptance. The code only corrects scoped dark-mode styling and is not an overall layout redesign.
