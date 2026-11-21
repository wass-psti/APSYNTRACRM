# CP-CRM-UI-REFINEMENT-04 — Deterministic board menu ARIA state reconciliation

## Scope and baseline

Production baseline: CP03 merged as `d0081e3561388195f901cccfc78e8d8ca740a5a8`. The existing signed Chromium tab is the sole target for production browser inspection. CP03's read-only audit reached 10 accessible routes, found no page-level horizontal overflow at 1275px, and intermittently recorded an open, correctly positioned board menu with the wrong `aria-expanded="false"` state. The issue is **accessibility state divergence** rather than a lost business action or a board permission failure.

## Reproduction and fix

CP03's single root `MutationObserver` listened for native `<details open>` attribute changes. A later `aria-expanded` update could overwrite the correct state without changing `<details open>`, so that observer never repaired it. A new disposable-browser test reproduces this exactly: first allow the native open/close mutation to settle, then deliberately overwrite the summary's `aria-expanded` with the opposite value. The test failed on the deployed CP03 implementation and passed following the fix.

The existing root observer now listens for `open` **and** `aria-expanded` changes and reconciles the trigger against the native `details.open` property. The handler first checks the current attribute and only writes when mismatched, preventing a repeated mutation loop. It still uses the same observer, controller map, handlers, CSS placement, native details semantics and existing actions. No new timers, polling agents, per-menu observers, credentials, roles, API contracts, SQL, or data mutations were introduced.

## Acceptance

- Full frontend Node test suite; build, lint, syntax; FM1 and TimeTracker browser acceptance; unchanged deterministic CSS bundle.
- Existing isolated board-menu interaction test now checks both directions of stale ARIA correction _after_ the native menu state has settled, in addition to rapid sequential menus, pointer actions, focus, Escape and dismissal.
- Existing signed-browser runner `scripts/cp-crm-ui-refinement-03-acceptance.mjs` must return PASS without skipped menu checks and verify 10 routes, menu ARIA consistency, viewport bounds, and restoration to the original route. It does not click action items or submit forms.

## Boundary of certification

This milestone certifies the specific board-menu behavior, tested accessible routes, and existing responsive/keyboard regressions. Representative 390px, 768px, 1440px component fixtures from CP02 do not by themselves certify every privileged and nested native application screen. Exhaustive UI/UX sign-off needs genuine access to those screens and their responsive layouts. Report production results separately from local tests and CI.
