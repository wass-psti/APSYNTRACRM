# CP-CRM-OVERLAY-03 — Measured three-dot menu positioning

## Field failure

Following CP-CRM-OVERLAY-02 (commit 80ab45f), the signed user reported that the Contacts card ellipsis menu on Workspace Overview **still appeared at the top-left corner of the screen**. The previous "verified" CI/deployment results proved only tests and asset propagation, not a correctly positioned real browser menu. This remains a failed live visual acceptance gate until a real signed browser test confirms otherwise.

### Root cause and corrected strategy

The CP-CRM-OVERLAY-01/02 top-layer menu implementation delegated foreground geometry to CSS Anchor Positioning via showPopover({source:trigger}), position-anchor:auto and anchor() functions. On the reported deployment that layout was unreliable in at least one browser/context, so a top-layer popup could be painted at (0,0). The previous geometry guard only detected the failure after the popup was displayed; its fallback was not sufficient to guarantee an adjacent three-dot action menu.

CP-CRM-OVERLAY-03 **removes the anchor-only dependency for action menus**. The existing top-layer Popover API is retained for clipping protection, but action-menu coordinates are computed with the actual trigger and popup getBoundingClientRect() measurements:

- Place below and right-aligned with the trigger, switching above when available space requires it.
- Clamp horizontal coordinates and maximum popup height to the visible visualViewport, accounting for pinch zoom and mobile browser chrome without confusing document and viewport coordinates.
- Hide the popover until its first measured position is valid; the provisional rule positions it far offscreen. On an invalid position or detached trigger, close and restore the original local menu or suppress the column popup.
- Recalculate during capture-phase scrolling, window/visualViewport resize or scroll and ResizeObserver changes, coalesced to a single requestAnimationFrame. Dispose pending RAF, observers, listeners and CSS rule at close/unmount.
- Each popover keeps its original parent, menuitem roles, focus/keyboard handling and delegated data-action handlers; no server RBAC/session changes.
- Selection dropdowns and search suggestions retain their earlier progressive CSS anchor behavior. This change is deliberately limited to three-dot action menus.

### Explicitly scoped CSSOM exception

The existing strict CSP includes style-src-attr 'none' and must not be weakened. To position a top-layer popup without violating that policy, the action-menu module inserts **only one selector-specific rule into the existing same-origin linked frontend/foreground-overlay.css stylesheet**, using validated existing menu IDs, finite bounded numeric pixels and fixed property names. This is not an inline style attribute or a new stylesheet/script injection. The selector uses two real IDs (#app #menuId:popover-open) so its important rules defeat previous board and Overview CSS without raising global z-indices. The rule is deleted after use; every input is numeric or a validated DOM ID. Cross-origin or unwritable stylesheets are refused, in which case details menus revert to their original local placement and detached column context menus close instead of appearing at (0,0).

A single, audited CSP regression-test exception is restricted to frontend/foreground-overlay.js; every other JS module remains prohibited from setting runtime styles and inline style attributes remain blocked everywhere. No new package or script origin is introduced.

### Verification and acceptance boundary

Focused regressions cover viewport corners, vertical flipping, horizontal clamping, missing/invalid dimensions, CSSOM rule generation/update/removal, capture-phase scroll and resize repositioning, refusal of unsafe stylesheet circumstances, no top-left exposure, overlay lifecycle and keyboard/action handler preservation. The existing full suite, build, disposable PG checks and exact-SHA live Pages smoke are required and reported separately.

**Outstanding:** connected, authenticated browser verification on the actual Contacts Overview menu and on board column/group menus across scroll containers, zoom, viewport corners, modal interactions, mobile touch and accessibility. GitHub CI is not real-browser sign-off. Until this check passes, classify end-to-end production runtime acceptance as PENDING, even if 100% of automated checks pass.
