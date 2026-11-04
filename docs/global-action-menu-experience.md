# APSYNTRA CRM — Global three-dot action menu experience

Milestone: **CP-CRM-ACTION-MENU-01**

## Purpose and exact coverage

A shared, progressive action-menu layer enhances existing three-dot surfaces without rebuilding APSYNTRA CRM, modifying its server contracts, or changing which users may take an action.

The implemented surfaces are:

- Board-card actions, including edit, restore, and move to trash when authorized
- Board-group actions, rendered only for the existing editable mode
- Board-header "Board options" actions, including member access and layout controls
- Board-table column-header three-dot context menus, retaining column CAS/management checks

Ordinary disclosure widgets, reports, history details, and the separate column-visibility checkbox editor are deliberately not reinterpreted as WAI-ARIA command menus. This distinction avoids breaking form interactions and avoids treating non-action content as a menu.

## Technology and UX

- Vanilla JavaScript ES modules, HTML5, CSS3, CSS custom properties and CSS transforms
- Lucide-derived, local ISC-licensed SVG icon node data (no CDN icon download, font or unsafe HTML injection)
- Web Animations API for a short, one-shot opening transition, disabled when reduced motion is preferred
- WAI-ARIA menu-button/menu/menuitem semantics, accessible labels, aria-expanded, aria-controls and aria-labelledby
- Arrow Up/Down, Home/End, Enter/Space, Escape, Tab, and typeahead; roving DOM focus with disabled entries skipped
- Shared Floating UI core/DOM v1.8.0 pinned on the already-approved unpkg host, with offset, flip, shift, size and autoUpdate
- CSP-compliant positioning: Floating UI collision results select audited CSS classes; CSS Anchor Positioning with flip fallbacks is used when supported
- Native <details> and existing click delegation continue to function without the optional Floating UI library

No Motion for JS dependency was added because it is optional and the existing Web Animations API suffices. No looping animation, background polling, telemetry or persistent agent is introduced.

## Authorization and data protection

The menu only alters presentation and keyboard navigation. Existing conditions that determine whether an action exists remain unchanged. Every action continues to pass through its original delegated data-action handler and any existing signed-session, workspace, board, role or backend admission checks. A visual menu icon does not grant a new permission.

The existing Content Security Policy is unchanged, including script-src, style-src-attr 'none' and the ban on runtime CSSOM style writes. SVG nodes are built with createElementNS/setAttribute, not innerHTML. Floating UI is only provided the trigger and menu DOM nodes for layout calculations; credentials, role assignments, GPS points and data records are not passed to its API. External CDN availability is a progressive enhancement dependency; native <details> remains usable if the library cannot load.

## Verification and remaining gates

Node regression tests cover menu classes, keyboard traversal and typeahead, SVG node geometry and sanitization, authorization wiring, CSP rules, dynamic initialization, and live Pages asset registration. CI, disposable database checks and exact-commit live Pages smoke are independently evaluated.

Authenticated browser interaction, screen-reader behavior, mobile clipping, menu keyboard traversal on actual signed boards, and measured 120 FPS remain acceptance gates. Passing automated tests or deployments does not prove these gates.
