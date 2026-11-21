# CP-CRM-DARK-04 — Readable board initials and Workspace essentials layout

## User-reported defects

- Overview board initials stand out as light pastel tiles against the approved charcoal dark mode, and similarly rendered catalog/sidebar initials are inconsistent.
- Workspace essentials entries visually overlap their shared card, especially as available width decreases.

## Root cause and scope

Board initial color classes (`.board-symbol`, `.green`, `.blue`, `.orange`, `.pink`) retain the light-theme backgrounds in the base styles. The essentials content inherits three columns with a flex row containing an icon, unconstrained text and trailing status indicator; long text can squeeze the middle column at responsive widths.

## Targeted implementation

- Apply accessible **dark-only** initial tile colors to Overview, My Boards catalog and sidebar recent boards. Preserve each category color family; no changes to initials content, labels, ordering, links, or board identity.
- Use a three-column **grid per essentials entry**: fixed icon width, `minmax(0,1fr)` text area, fixed status-indicator width. Guarantee wrapping within the text cell, prevent overflow outside the card, and stack entries at <=1150px.
- Use component-level CSS only, appended to the original deterministic stylesheet bundle. No additional library, animations, business logic, permissions, backend, RPC or data alterations.
- Essentials layout corrections also apply to light mode to prevent the same structural overlap. The light-mode color palette remains unchanged.

## Acceptance

`node scripts/cp-crm-dark-04-overview-browser.mjs` renders representative Overview content using the prior and proposed CSS, on Chromium at widths 390, 768, 1024, 1280 and 1440 pixels, in dark and light mode. Assertions validate no horizontal page overflow, three independent card-item bounds, no collisions between icon, text and indicator, and at least 4.5:1 text contrast on all five dark-mode initial colors. Light-mode initial background colors are compared against the baseline. Screenshots are located under `docs/visual/cp-crm-dark-04/` and **are representative test fixtures, not signed production captures**.

Production acceptance must additionally verify the published CSS file, Pages workflow, browser navigation, and any remaining actual signed-session visual defects. Do not infer acceptance of every native application from this Overview-specific checkpoint.
