# CP-CRM-ACTION-ICON-02 — Application-wide ellipsis icon correction

## Audit and root cause

The APSYNTRA CRM frontend uses a shared \`action-menu-experience.js\` icon factory. The current action surfaces are:

- Workspace Overview and board catalog cards via \`boardCard()\` in \`frontend/app.js\`
- Board header options via \`.board-actions-menu\` in \`frontend/app.js\`
- Main and ordinary board group menus via \`.board-group-actions\` in \`frontend/app.js\`
- Dynamic table column-header menus via \`.board-column-more\` from \`frontend/board-presentation.js\`
- Column action menu items appended directly to the \`#app\` root by \`openBoardColumnContext()\` in \`frontend/app.js\`

All 12 application board types use the same board/menu rendering components, rather than separately implementing ellipsis menus. The TimeTracker Calendar/Reports and administrative sections were checked for additional ellipsis triggers and did not disclose an independent three-dot component. Native selects, search suggestions, tooltips and non-action disclosures are outside this icon correction.

**Found:** the prior SVG used outlined circles with \`r=1\` and inherited a stroke even though vertical ellipsis dots should read as consistent, filled circular marks. More importantly, the common \`.aps-action-icon\` sizing, trigger layout, and action-row alignment CSS was restricted to \`#app .aps-board-shell\`. Overview board-card triggers are outside that subtree; column-header context menus are appended directly under \`#app\`. As a result, their icons and text could inherit unrelated font, flex and box metrics, producing mismatched alignment and disproportionate menu glyphs (as evidenced by the supplied column-menu screenshot).

## Implementation

The existing Lucide-derived icon factory remains the single source of truth. The vertical ellipsis now consists of three identical filled circles at x=12, y=5/12/19 and radius 1.5 in a 24×24 viewBox. It receives the stable \`aps-action-icon aps-ellipsis-icon\` classes, a square 18px box, \`fill=currentColor\` and no stroke. Other menu item glyphs retain 17px Lucide stroke geometry and decorative, non-focusable semantics.

Shared enhancement sets \`aps-ellipsis-trigger\` for Overview/catalog board cards, board-group summaries, board-header options and column-header buttons. The trigger and row CSS was normalized at the application \`#app\` level, **independent of \`.aps-board-shell\`**, with explicit dimensions, fixed flex-basis, aspect-ratio, centering, focus rings, contrast and reduced-motion behavior. Action menus appended directly under \`#app\` receive the same compact 17px icon rows as those nested inside boards. No other SVG classes are targeted.

Existing \`data-action\` values, authorizations, signed-session checks, board-editing contracts, menu keyboard and ARIA states, outside click, Escape and focus handling remain unchanged. Critically, the measured foreground-positioning implementation from CP-CRM-OVERLAY-03 is unchanged; no new z-index, Popover API or geometry logic was introduced.

## Testing and acceptance

Focused Node tests cover consistent centered dot geometry; solid versus stroke icon behavior; Overview, catalog, group, header and column trigger normalization; global CSS/keyboard/accessibility; and unchanged foreground-positioning/action handlers. The existing full regression suite, build, and live exact-asset SHA verification provide deployment evidence when they pass.

A production-browser visual check of Overview, the Contacts board column dropdown shown in the report, nested board groups, mobile/tablet, focus, and modal/menu overlap is a separate gate. Do not conflate automated markup/CSS assertions or successful Pages deployment with observed signed-browser pixel acceptance. No SQL, Supabase Auth/RLS, RBAC, permissions, credentials or production data were changed.
