# APSYNTRA CRM — Global action-dropdown top-layer recovery

## Reproduced defect and cause

The signed board screenshot on 2026-11-09 shows the opened board-actions dropdown painted behind the lower board toolbar. The direct cause was a contract mismatch after Priority 5 (PR #180) consolidated 41 standalone CSS files into `frontend/apsyntra-styles.bundle.css`: the action-menu placement helper `getPlacementSheet()` still searched for the old `frontend/foreground-overlay.css` linked stylesheet. Therefore `createActionRule()` returned null and the shared action-menu enhancement fell back to its local absolute-positioned menu, which remained subject to nearby stacking contexts and could be occluded by `.board-customize-toolbar` (`z-index:5`).

## Implementation

`frontend/foreground-overlay.js` accepts either the legacy standalone stylesheet or the new bundled stylesheet, restricted to same-origin `/APSYNTRACRM/frontend/` production asset paths (or local frontend test-host paths), with exact allowed names and a writable CSSOM. The existing top-layer Popover API + measured viewport coordinates + same-origin ephemeral stylesheet rule are unchanged. No app data, credentials, API calls, DOM reparenting, broad `z-index` escalation, inline style attributes, CSSOM exception expansion, or permissions changes were introduced. A missing/inaccessible trusted stylesheet still fails closed to legacy fallback.

## Verification

- `node --test frontend/tests/*.test.mjs`: **1,486/1,486 PASS** after the patch.
- `frontend/tests/foreground-overlay.test.mjs`: both standalone and bundled same-origin stylesheets, cleanup, and rejection of cross-origin/unexpected stylesheets.
- Real Chromium `node scripts/priority5-style-browser.mjs`: actual enhanced **board, group, and card** action menus render with `:popover-open`, viewport placement, and verified topmost hit-testing at **1280 / 768 / 390 px**; simulated dialog menu appears above modal backdrop. The existing Priority 5 CSS cascade benchmark still passes all 28 representative computed-style checks across three runs.
- Browser fixture contains invented UI and no signed session or production records. Signed production end-user visual confirmation of the exact board screenshot remains separately pending.

## Release and rollback

After CI, merge and GitHub Pages deployment, verify served `frontend/foreground-overlay.js` SHA-256 equals `main`. To roll back only this change, revert its exact allowlisted stylesheet lookup and associated regression tests; note that reverting without restoring 41 individual `<link>` elements will reintroduce the issue. Preserve the existing Priority 5 bundle and its source manifest when fixing future menu geometry or layout changes.
