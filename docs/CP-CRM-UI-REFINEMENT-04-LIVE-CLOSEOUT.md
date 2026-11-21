# CP-CRM-UI-REFINEMENT-04 — Existing-browser acceptance reconciliation and closeout

## Production baseline

- PR #705 deployed as `49d699b9989f9441271bde446ea16e50eb59d327`; the published `frontend/action-menu-experience.js` matched the intended source byte for byte.
- The CP04 native-menu fix has an isolated red/green regression for stale ARIA attributes and the full 3,166-test suite, build, lint, FM1 browser, and TimeTracker browser acceptance passed.
- The original CP03 signed-browser runner intermittently failed even on the deployed CP04 code, reporting `aria-expanded="false"` for menus that appeared open. Its old checks captured a menu node before asynchronous board-list reconciliation and inspected it **after that node was removed from the DOM**. A live trace demonstrated menu nodes with `isConnected === false` during these observations. These are not live UI elements and must not determine pass/fail status.

## Runner correction

The existing single-tab runner `scripts/cp-crm-ui-refinement-03-existing-tab.js` now:

1. Re-queries the **current visible, connected** menu elements before each check.
2. Opens a candidate only in the foreground existing signed Chromium tab.
3. After positioning settles, confirms that both the menu and its summary remain connected.
4. Retries up to five times if normal app re-rendering replaces a candidate.
5. Reports `DOM_REPLACED_DURING_CHECK` as **BLOCKED**, not PASS, if a stable connected element cannot be sampled, without hiding true ARIA or geometry failures.
6. Keeps the original route restoration and no-action/no-credentials/no-record-mutation guarantees.

The regression `frontend/tests/cp-crm-ui-refinement-03.test.mjs` checks that the runner explicitly rejects stale DOM and preserves its blockers. The product code, permissions, APIs, database, styles, dependencies, auth, and application workflows are untouched by this follow-up.

## Verified production outcomes

After the correction, **two consecutive runs** of the read-only runner in the same signed Chromium tab returned PASS:

| Measure                                  | Run 1 | Run 2 |
| ---------------------------------------- | ----: | ----: |
| Accessible routes checked                | 10/10 | 10/10 |
| Foreground-connected menu checks         |   6/6 |   6/6 |
| Skipped/blocked menu checks              |     0 |     0 |
| ARIA and viewport geometry failures      |     0 |     0 |
| Page-level horizontal overflow at 1275px |   0px |   0px |
| Original `#/overview` route restored     |   Yes |   Yes |
| Production records modified              |  None |  None |

The route sample covered Overview, My Boards, FM1, TimeTracker, Fund Tracker, FuelTrack+, TradeLink, TalkBox, Teams, and Settings. Menus in both Overview and Boards were checked.

## Certification scope

The production board-menu and tested desktop-route acceptance is **verified**. CP02's existing responsive component tests cover representative 390px, 768px, and 1440px fixtures but are not a complete screenshot and interaction audit of every actual module, workspace, role-restricted view, or nested mobile form. Do not label exhaustive application-wide visual certification complete from this evidence alone.
