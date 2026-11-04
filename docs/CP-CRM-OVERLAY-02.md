# CP-CRM-OVERLAY-02 — Ellipsis Action Menu Positioning Remediation

## Reproduced failure and root cause

The Contacts card on \`#/overview\` exposed a three-dot action popup at viewport coordinate (0,0), far from its triggering button. The preceding foreground-overlay implementation used \`showPopover({source: trigger})\` but then positioned the top-layer popup with \`position-anchor: --aps-foreground-action\`, a named anchor assigned to an element outside the top layer. That explicit name overrides the invoker's **implicit anchor**, and can resolve as missing in complex stacking/anchor scopes. The component also lacked a geometry guard, so an unresolved \`anchor()\` coordinate could silently default to the screen origin. A second issue: the former foreground CSS applied most three-dot rules only beneath \`#app .aps-board-shell\`, while Overview board cards are not guaranteed to be inside that subtree.

The issue is anchored positioning, not insufficient z-index. Raising z-index cannot repair missing coordinates, and using absolute document offsets with a fixed viewport surface would introduce additional scroll and zoom bugs.

## Implemented correction

- Uses the browser's **implicit invoker anchor** established by \`showPopover({source: trigger})\`. All supported top-layer surfaces (action menus, selection menus and authorized search suggestions) now explicitly set **\`position-anchor: auto !important\`** where \`anchor()\` is used. Older \`anchor-name\` overrides were removed from the shared foreground layer.
- Sets fixed top-layer placement by CSS \`anchor(bottom)\`, \`anchor(left)\` / \`anchor(right)\` and \`position-try-fallbacks: flip-block, flip-inline\`; viewports can flip above or switch alignment, with bounded heights.
- Uses **global, component-qualified selectors** for \`.aps-action-popover.aps-foreground-action:popover-open\` so Overview cards, board-group menus, board options and column headers all receive the same anchor treatment.
- Checks \`getBoundingClientRect()\` of trigger and menu on the next animation frame. The popup is hidden until a valid nearby anchor placement has been measured. An unresolved/offscreen 0,0 placement is never revealed; it restores the original local rendering instead. Column context menus, which lack a reliable local placement fallback, close on placement failure rather than showing a detached surface.
- Measures only viewport-relative DOM rectangles; no mixing with \`scrollX\`, \`scrollY\`, document coordinate systems, or runtime CSS position mutations. A pending RAF is coalesced for capture-phase scroll, window/visualViewport resize and scroll, and element ResizeObserver changes. All listeners, observers and pending frames are cleaned up when the surface closes or unmounts.
- The CSS anchor tracks scrolling/resizing intrinsically while a top-layer popover is open. Legacy Floating UI collision classes are now calculated only for the **local fallback**, avoiding conflicting placement systems that may interpret different coordinate spaces.
- Preserves existing native inputs, \`details\` DOM parentage, delegated \`data-action\` authorization, signed board roles, keyboard focus, Escape/Tab, outside-click dismissal, screen-reader relationships, reduced-motion handling, and all previous CSS theme tokens.
- No authentication, PostgreSQL/RLS, session, role, workspace or backend changes. No new packages, global z-index inflation, unsafe HTML, inline CSS, CSSOM writes, telemetry, or permanent background loops; existing CSP is unchanged.

## Verification and risks

Unit tests cover near-edge and top-left geometry checks, showPopover source requirements, pending visibility, fallback and cleanup, multiple menus, scroll/resize updates, CSS implicit-anchor and global action-menu selectors, and original select/search event propagation. Frontend CI, build and exact-commit live Pages smoke are separate acceptance gates.

**Runtime acceptance remains separate:** signed-user interaction on the Contacts Overview card and Board status/column menus; repeated opening of different menus; browser viewport boundaries, horizontal and vertical scroll, zoom, touch devices, dialogs, screen readers and mobile Safari/Firefox. The browser session connector must be accessible to observe those results. Do not mark production runtime acceptance as passed without evidence.

The previous named-anchor mechanism was explicitly rejected after source inspection. For standards context, see MDN Popover API: implicit invoker association with \`showPopover({source})\` needs \`position-anchor: auto\` whenever \`anchor()\` is used.
