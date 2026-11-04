# CP-CRM-SVG-ALIGN-01 — Application-wide SVG icon alignment refinement

## Source audit

Reviewed the current shared action-menu SVG factory, board header/group/column and Overview card controls, and the existing SVG renderers used by Sidebar, Overview, Foundation, Settings, Role Configuration, and Pages Acceptance. Inspected icon integration in Search and Input Experience, board rendering, the TimeTracker UI, plus the published CSS and Pages asset list. The high-density artwork in login/initialization, PixiJS decorations, data gauges, and map/chart graphics are deliberately outside this *UI icon* adjustment because they do not use square 24px glyph viewBoxes.

**Observed problem evidence:** the supplied screenshot of a Contacts board's three-dot action popup shows Edit Board with a disproportionately small, visually offset pencil glyph compared with the full-size Trash icon, even though both receive the same outer 17px icon box.

## Root causes

1. The shared "pencil" glyph had only two short paths in the **bottom-right part** of its 24×24 viewBox, notably M12 19 ... and m18 13 3 3. The CSS correctly centered the *SVG rectangle*, but this path never occupied the full rectangle, so its painted geometry appeared too small and offset relative to the neighboring Trash icon. The fix replaces the incomplete short path with a complete diagonal pencil, extending roughly x4..20 and y4..20 without CSS translation.
2. Six existing square 24×24 icon families originally declared CSS width and height together (17–19px). Multiple responsive and button-specific rules later changed **width only** (e.g. 15–17px), leaving height at 17–19px. The browser therefore stretched the square icons into rectangles. The source-level correction changes the base family to \`height:auto;aspect-ratio:1\`, preserving its intended 24×24 viewBox shape and letting route-specific width rules continue to control display size.

## Changes

- \`frontend/action-menu-experience.js\`: uses the existing local Lucide-derived SVG factory and replaces only the geometrically truncated pencil paths; leaves the symmetric filled 18px vertical/horizontal ellipsis geometry and 17px icon sizing untouched
- \`frontend/overview-experience.css\`
- \`frontend/sidebar-experience.css\`
- \`frontend/foundation-experience.css\`
- \`frontend/settings-experience.css\`
- \`frontend/role-configuration-experience.css\`
- \`frontend/pages-acceptance-experience.css\`: for each existing square icon family, remove fixed CSS height in favor of 1:1 width-driven scaling, retaining all existing selectors, colors, hover/focus behavior, responsive widths and fonts
- \`frontend/tests/svg-icon-alignment.test.mjs\`: checks six families' 1:1 responsive geometry, accessible SVG markup, pencil path and bounding intent, previously fixed ellipses, strict CSP, and signed menu/overlay invariants

No generic \`svg\` selector, arbitrary translation, global z-index change, new icon library, package, script origin or auth/role/database modification. Decorative non-square SVG artwork and reporting diagrams are unchanged. All application board types reuse the same action-menu renderer; there is no separate icon subsystem for each board.

## Verification boundaries

Automated tests, build and exact-production-asset SHA checks validate code and deployment independently. They cannot establish optical/pixel equality at all browser zoom levels, devices or themes. Browser runtime acceptance must inspect the signed-in Contacts menu from the screenshot, Workspace Overview, main/other groups, column headers, administrative views, TimeTracker controls, keyboard focus and reduced-motion behavior on at least desktop and narrow mobile sizes.

The desktop browser connector was not available from this conversation. No actual signed-browser visual acceptance or all-platform absence-of-defects claim may be inferred from CI alone. This milestone is **implemented and CI-verified**, with **visual acceptance pending** until directly observed.
