# CP-CRM-ITEM-DETAILS-OVERLAY-01 — Board Item Drawer Layering Correction

## Defect

The item details drawer was rendered through the existing body-level modal portal, but the backdrop used the generic modal stacking level of `z-index: 50`.

The ordinary board workspace intentionally uses higher stacking levels for:

- Board toolbar: `z-index: 110`
- Expanded toolbar: `z-index: 510`
- Expanded toolbar controls and menus: `z-index: 520–530`
- Sticky horizontal rail: `z-index: 55`
- Fixed column-resize guide: `z-index: 9999`

Those board layers could therefore appear above the item details backdrop and drawer, as shown in the supplied screenshot. The previous board-dialog styling selector was scoped below `#app`, while the existing renderer appends the dialog directly to `document.body`.

## Correction

- Add a direct `.board-detail-backdrop` rule in the final board stylesheet layer.
- Set the backdrop to fixed viewport coverage with `z-index: 10010`, above the board toolbar, sticky rail, and resize guide.
- Remove backdrop padding so the drawer fills the viewport height.
- Keep the drawer right-aligned at `min(560px, 100vw)`, with independent vertical scrolling, contained overscroll, and mobile full-width behavior.
- Keep the existing item renderer, close action, modal event handling, board data, and persistence unchanged.
- Bump the production stylesheet cache key to `cp-crm-item-details-overlay-01`.

## Verification

| Check                                                     |      Result |
| --------------------------------------------------------- | ----------: |
| Focused CSS and renderer tests                            |    4 passed |
| Chromium overlay acceptance                               |   24 checks |
| Desktop viewport                                          | 1,440 × 900 |
| Mobile viewport                                           |   390 × 844 |
| Toolbar, expanded toolbar, menu and resize-guide stacking |        Pass |
| Backdrop hit testing over board controls                  |        Pass |
| Drawer hit testing and independent scrolling              |        Pass |
| Full-height drawer and viewport containment               |        Pass |
| CSS bundle determinism                                    |        Pass |

Visual evidence:

- `docs/visual/cp-crm-item-details-overlay-01/overlay-desktop.png`
- `docs/visual/cp-crm-item-details-overlay-01/overlay-mobile.png`

## Scope

Presentation-only. No board renderer, item data, CRUD, persistence, collaboration, authentication, authorization, role, permission, backend, or database changes.
