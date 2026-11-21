# Workspace essentials — user-reported visual overlap correction

The previous CP-DARK-04 implementation satisfied bounding-box collision tests but kept each essentials item as a single row with the icon, text, and status check competing for width. The user-provided screenshot showed the result remained visually cramped and unacceptable.

## Focused correction

Each item is now an **independently bordered tile**, with a two-row grid:

- Row 1: decorative icon at the left and status indicator at the right.
- Row 2: heading and description occupying the full width of that tile.
- Container: responsive `auto-fit` cards with a minimum usable width, consistent gaps, and stacked cards on narrow screens.

Both dark and light themes use the corrected geometry; existing light-theme text colors and application behavior remain unchanged. The existing dark-mode initials palette, API, role checks, session logic and data are untouched. CSS is added to the existing deterministic bundle; the browser-facing stylesheet version is `cp-crm-dark-04b`.

## Verification

`node scripts/cp-crm-dark-04-overview-browser.mjs` compares old and new CSS at 390, 768, 1024, 1280, 1440 and 1898 CSS pixels, in light and dark mode. It requires all essentials items to stay inside their card; icon/text/status boxes not to intersect; and, crucially, **each heading to begin below the bottom of the check indicator**. Representative Chromium screenshots at widths 390, 1440 and 1898 are in `docs/visual/cp-crm-dark-04`. These screenshots are isolated DOM fixtures, not authenticated production screenshots. Full regression, build and deployment evidence must be checked separately.
