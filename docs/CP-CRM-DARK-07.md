# CP-CRM-DARK-07 — Remaining native application dark-mode defects

## Scope and evidence

Compared existing native application CSS against the established semantic charcoal dark theme. Found three groups of hardcoded light controls that were not corrected by shared CSS:

1. **TimeTracker GPS:** white filter controls, map overlay controls (stats, mode buttons, zoom), location list and KPIs. No map tiles/Leaflet behavior changed.
2. **TimeTracker My Hours:** white week/month navigation and KPI cards; existing time calculations and attendance state unchanged.
3. **TradeLink:** white local draft-finance panels, finance values, draft preview rows and analytics cards. The official print/PDF layout and approval workflow are excluded.

Implemented a final screen-only dark stylesheet with scoped selectors, a charcoal palette, light-text contrast, focus indicators and hover/disabled feedback. The `@media screen` boundary prevents the overrides from influencing printed or generated official documents. No new dependencies, login/permissions/RLS changes, data mutations, application-state changes, route changes, or keyboard event changes. Light mode remains unchanged.

## Verification

`node scripts/cp-crm-dark-07-browser.mjs` compares prior production CSS against updated CSS in real Chromium for representative native control DOM at widths 390/768/1440px in light and dark modes; checks dark surfaces, accessible sampled text contrast, focus, reduced motion and unchanged light-mode computed colors. Screenshot fixtures in `docs/visual/cp-crm-dark-07` are not authenticated production screenshots. Full automated tests, build, CI and deployment are independent gates.

## Remaining acceptance boundary

The signed production tab is available as a readable tab via Browser connector but has no interactive control facility in Chat mode. Consequently genuine user-role native walkthroughs and physical-device certification remain unverified. Do not claim these merely from fixture tests. Any subsequent work should target a concrete defect rather than repeat a generic certification loop.
