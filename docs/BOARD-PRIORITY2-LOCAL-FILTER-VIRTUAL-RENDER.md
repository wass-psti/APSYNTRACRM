# APSYNTRA CRM — Priority 2: Local filtering and virtualized board rendering

## Scope

The existing signed board-detail retrieval remains authoritative. Filtering now operates on already retrieved `state.board.items` and per-group in-memory row models. There is no additional backend request on each search keystroke, no new persistence, no background worker or timer, and no change to RLS, roles, backend schemas, or application-specific server pagination.

For fully retrieved groups containing at least 120 rows, `board-window.js` renders a bounded row window with approximately 52-pixel row geometry and natural page-level vertical scrolling. Small groups retain their normal HTML tables. The renderer retains the existing per-group horizontal scrolling, table headers, selection model, footer, and configured domain columns. A change in the viewport updates only the group's table body. Tab and Shift+Tab can traverse the boundary between windows. Focused text editors are protected against virtualization-driven replacement.

If the board-detail response indicates more pages or an authoritative total larger than the fetched list, the windowed path is disabled. This does not substitute client filtering for server search across incomplete result sets. Existing TradeLink document-list cursor pagination remains untouched.

All row models are ephemeral and discarded on a full view render, workspace/session change, or logout. The search term resets when the signed account, workspace, or board changes. Virtualization never changes server permissions or authorizes edits. Multi-selection continues to use the already loaded, signed-authorized item IDs, not the subset of currently mounted DOM rows.

## Verification evidence

- Full frontend suite: **1,437/1,437 PASS** in local verification on 2026-11-09.
- `node scripts/board-cache-two-tab-browser.mjs`: actual isolated Chromium browser tests PASS using **600 invented records**, including bounded DOM windows, natural page scroll geometry, local filter matching an offscreen record, empty result state, forward/backward keyboard window traversal, and the existing same-origin two-tab cache safety checks.
- `frontend/tests/board-window.test.mjs`: below-threshold unchanged behavior; bounded windows; complete spacer geometry; incomplete server-page protection; signed board view integration and in-memory-only data model.
- CSP regression: no style attributes or runtime CSSOM injection introduced; the same-origin stylesheet is used.
- Browser fixture: `frontend/tests/fixtures/board-virtual-browser.html` served locally to a temporary Chromium profile. No production account, credentials, Supabase requests, or live board records are used in that fixture.

## Release and live acceptance boundaries

CI and deployment outcomes must be verified independently after merge. The 600-record browser fixture establishes DOM bounds and interaction behavior, **not** measured improvements in live rendering latency or frames per second. The current signed production boards may not contain a group above the 120-row threshold. Full live large-board rendering acceptance therefore remains **PENDING** until a safe authorized nonproduction dataset at that scale exists, and must not be simulated by silently creating live board records. End-user checks on existing small boards can still confirm local filtering and ordinary edit/selection behavior without introducing fixtures.

If any signed UI regression is reported, the next implementation should address that reproducing defect rather than broaden virtualization to partially fetched domain pages.
