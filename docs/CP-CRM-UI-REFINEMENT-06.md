# CP-CRM-UI-REFINEMENT-06 — Existing-browser reattachment and responsive UI acceptance

## Scope and non-modification boundary

Continue the deployed CP01–CP05 CRM UI refinement and acceptance series. Verify the existing signed APSYNTRA CRM browser rather than opening a new browser, bypassing session roles, or changing authentication, database, application workflows, styles or business logic. Only implement new app changes when a specific user-visible defect is reproduced. Limit acceptance to genuine evidence; distinguish a responsive desktop window from a physical mobile/tablet device.

## Browser control recovered

On 21 November 2026, Desktop Commander reported `Informations-MacBook-Pro.local` online. The Browser connection identified the existing APSYNTRA CRM tab at `#/overview`.

- Native Chromium Apple Events still reported **zero** scriptable windows, even though the macOS app was active.
- macOS `System Events` Accessibility found **one** existing Chromium window. Cycling the already-open tabs selected the original `APSYNTRA CRM — Workspace` tab; no new window/profile/account was created.
- Read-only screenshot inspection of the actual Overview screen confirmed a Work Management sidebar, CRM dashboard, six visible board cards, navigation to application modules and settings, and no loading-screen blocker. The visible shell showed **Workspace member**, while the overview also displayed a `CRM Admin` label. These are presentation observations, **not** proof that a particular restricted capability is authorized or functioning; role work remains outside scope.
- The existing Chromium window uses a split-view arrangement showing APSYNTRA and ChatGPT simultaneously. A full-window screenshot therefore **cannot** be equated with an exact 390px CRM CSS viewport. Screenshots are stored locally under `/tmp`, permission `0600`, not committed or published.

## Genuine measured window observations

The existing Chromium window was resized through macOS Accessibility, with its previous size and position restored on completion. The live fallback produced the following measurements:

| Requested window width | Measured Chromium window width | Outcome                                                |
| ---------------------- | -----------------------------: | ------------------------------------------------------ |
| 1200 px                |                        1200 px | Window geometry verified; screenshot locally captured  |
| 800 px                 |                         800 px | Window geometry verified; screenshot locally captured  |
| 390 px                 |                     **792 px** | **BLOCKED** — Chromium enforced a larger minimum width |

Original width: **2056px**. Restored width: **2056px**. Screen layout was reviewed at intermediate widths; the sidebar uses compact icon navigation and the dashboard reflows. These screenshots do not establish a true narrow **390px CSS viewport** in the CRM pane, complete interaction with menus at all edges, or touch-device behavior.

## Implementation delivered

- `scripts/cp-crm-ui-refinement-06-ax-viewport.applescript` is a fallback to inspect the **existing active CRM tab only** via macOS Accessibility, measure real window sizes, capture local restricted screenshots and restore the original window bounds on success/error.
- `scripts/cp-crm-ui-refinement-06-ax-acceptance.mjs` parses actual window measurements, verifies local capture existence and window restoration, rejects unsupported requested widths, reports `BLOCKED` instead of false passes, and records structured evidence in `/tmp/cp-crm-ui06-acceptance.json`.
- `frontend/tests/cp-crm-ui-refinement-06.test.mjs` verifies the selected-tab gate, no additional browsers or data mutations, window-size restoration, screenshot permission protection, unsupported-width detection, and explicit false certification flags for real mobile hardware and independent roles.

The CP05 Apple Events runner remains available for any future session in which Chromium exposes a normal scriptable window; CP06 does not replace or weaken its acceptance criteria. Neither runner modifies production data, credentials, roles or permissions.

## Role and cross-module acceptance boundary

- **Verified:** Existing CRM tab and desktop window reattachment via Accessibility; actual Overview layout observed; 1200px and 800px window sizes; full window restoration; no new account or profile.
- **Blocked:** True 390px existing-window acceptance in the present split-view layout, real mobile touch/gesture interaction, and comprehensive responsive live route traversal, because Chromium cannot shrink sufficiently and normal tab JavaScript automation remains unavailable.
- **Pending:** Independent authorized role-specific screens and all nested application workflows. Accessible shell text and the `CRM Admin` display label do not prove backend role access or full UI functionality.
- **Previously verified (not re-certified here):** CP04 deployed board-menu functionality and its ten-route desktop read-only checks; CP02 isolated responsive and WCAG fixtures.

## Repeatable execution and minimum next action

With the existing CRM tab selected and visible on the authorized Mac:

```sh
cd ~/.apsyntra-work/cp-crm-ui-refinement-06
node scripts/cp-crm-ui-refinement-06-ax-acceptance.mjs
```

For full mobile/tablet certification, make a genuine responsive viewport or authorized physical browser available **without replacing the user's existing session**. Keep the current split view intact unless the user specifically chooses to adjust it. Once an independent authorized role is available, test only its legitimately accessible screens; do not add new authorization restrictions or impersonate credentials. No other frontend changes are warranted without a reproduced defect.
