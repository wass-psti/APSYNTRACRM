# CP-CRM-OVERLAY-01 — Global dropdown foreground and clipping remediation

## Diagnosis

The board status editor uses this DOM path:
\`td.board-status-click-cell > form.board-inline-cell-form > span.aps-select-anchor > div.aps-select-trigger\`.
The custom listbox was previously appended under the same select anchor. Although that anchor has a large z-index, it lives inside scrollable table, card and grid stacking/overflow contexts. A descendant's z-index cannot escape an ancestor's clipping region. The same limitation affects board/group action menus and local search suggestions.

## Fix

Added a shared \`foreground-overlay.js\` / \`foreground-overlay.css\` layer. When the browser supports the Popover API and CSS Anchor Positioning, selection listboxes, action menus and search suggestions use \`popover="manual"\` and \`showPopover({source: trigger})\`. The browser places the **existing** menu node in its native top layer, which escapes ancestor overflow, transforms, isolation and sticky header stacking contexts *without changing its DOM parent or delegating new actions*. The menu remains a child of its original form/details wrapper, so existing \`data-action\` and form event handlers still receive clicks.

One foreground surface is active at a time in a WeakMap scoped to the document. Opening another menu dismisses the previous one through its existing close routine. Teardown calls \`hidePopover\`, restores the original \`popover\` attribute, clears the temporary named-anchor classes, and preserves focus, Esc, outside-click and keyboard navigation.

Three independently named CSS anchors position the surfaces:

- \`--aps-foreground-select\`: native select/combobox anchor; preserves selected value, blur, typeahead, change/input delegation.
- \`--aps-foreground-action\`: board card, board group, board options and table-column menu triggers; preserves their signed role/board actions.
- \`--aps-foreground-search\`: locally authorized search suggestions; preserves native search input and filtering.

The overlay stylesheet loads after the existing component CSS and contains scoped specificity overrides for earlier CSS anchor names. The top-layer popup uses CSS \`anchor()\`, \`anchor-size()\`, \`position-try-fallbacks: flip-block, flip-inline\`, plus the existing Floating UI collision-class updates (flip/end/compact). It never attempts a global z-index increase, reparents action buttons, or changes table overflow or scroll containment.

## Fallbacks and constraints

Top-layer enhancement is feature-detected. For older browsers lacking CSS Anchor Positioning/Popover, standard native selects remain the fallback; search filtering remains enabled without clipped suggestion popups. Existing action menus retain their native disclosure behavior. Responsive mobile styles and reduced-motion preferences are unchanged. Overlays are document-scoped and do not introduce persistent background work or telemetry.

Existing strict Content Security Policy remains unchanged, including \`style-src-attr 'none'\`. No inline style attributes, CSSOM mutation, untrusted HTML, new packages, server/database updates, auth/role changes or permissions are introduced. The original WAI-ARIA roles and keyboard interaction handlers remain intact.

## Acceptance

Automated tests cover feature detection, top-layer open/close, no DOM reparenting, cross-menu dismissal, native attribute restoration, dropdown/select/form contract preservation, action-menu delegation, search input continuity, scoped CSS anchoring and Pages asset manifests. Frontend tests, build, disposable DB checks and live Pages exact-SHA smoke are independently reported.

Genuine signed-session Chrome/Firefox/Safari (including mobile and table vertical/horizontal scroll clipping), popover vs. modal layering, keyboard/screen-reader behavior and measured performance remain pending until verified in a connected browser session. No authenticated visual acceptance or cross-browser certification is inferred from CI alone.
