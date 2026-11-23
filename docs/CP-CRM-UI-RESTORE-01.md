# CP-CRM-UI-RESTORE-01 — Original APSYNTRA CRM UI Baseline Recovery

## Objective

Restore the approved pre-Uiverse APSYNTRA CRM presentation while retaining subsequent functional work. The authoritative visual baseline is commit `de563354c11a0587858e7b83e90aeea5e63bf2e9`.

The implementation is intentionally selective. It does not reset the repository, revert unrelated commits, change backend contracts, or replace application renderers outside the Overview presentation.

## Visual change inventory

| Change                                                      | Files / surface                                                                       | Disposition                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| PR #767 — Uiverse Boards catalog and board workspace        | `frontend/board-uiverse-overhaul.css`, generated bundle, board CSS tests              | Removed from active stylesheet manifest and bundle; source and historical evidence retained                 |
| PR #771 — shared CRM shell and complete visual layer        | `frontend/crm-complete-design-system.css`, generated bundle                           | Removed from active stylesheet manifest and bundle; source and historical evidence retained                 |
| PR #777 — Overview redesign                                 | `frontend/app.js` `overview()` renderer and CSS appended to the complete design layer | Restored the exact renderer from the approved baseline; underlying Overview CSS source remains active       |
| PR #780 / #783 — mobile launcher and destination navigation | `frontend/mobile-home.js`, `frontend/mobile-home.css`, tests                          | Preserved as an additive mobile feature; existing route wiring and signed catalog integration remain intact |
| TimeTracker Add Department and shared OJT features          | `frontend/apps/TimeTracker/*`, `frontend/app.js`                                      | Preserved; their CSS remains in the active bundle                                                           |
| Other TimeTracker workflow fixes                            | `frontend/app.js` and native modules                                                  | Preserved; no rollback of application logic                                                                 |

## Implementation

The inventory covers all post-baseline commits through `origin/main` (`668fe97`). The unrelated PDL booking commits and additive TimeTracker/mobile application work are explicitly retained; only the three superseded shared CRM visual redesigns are reversed.

- Started from the latest `origin/main` in an isolated worktree on `cp-crm-ui-restore-01`.
- Restored only the `overview()` function body from the approved baseline commit. All later `frontend/app.js` imports, state, and TimeTracker logic remain intact.
- Removed the two superseded visual layers from `scripts/priority5-style-manifest.mjs`.
- Kept the established shell, sidebar, workspace, Overview, Boards, settings, role-configuration, dark-theme, and board-overhaul sources active.
- Retained the mobile launcher and TimeTracker additive styles.
- Regenerated `frontend/apsyntra-styles.bundle.css` from the manifest and changed the stylesheet cache key to `cp-crm-ui-restore-01`.
- Updated production smoke inventory and visual acceptance contracts. Historical redesign CSS, documentation, screenshots, and browser scripts are not deleted.

## Functional preservation

No changes are made to board CRUD, item details, board data, columns, groups, filters, search, pagination, workspace switching, role state, authentication, Supabase RPCs, database schema, native application workflow logic, or persistence. The TimeTracker modal, OJT flow, and mobile launcher changes on current `main` are retained.

## Model execution constraint

This is a presentation restoration. It introduces no model code, model parameters, training dependencies, gradient descent, backpropagation, fine-tuning, or training loops. No training or model-optimization execution path is added.

## Acceptance

- Overview renderer hash matches the exact approved baseline renderer.
- Superseded CRM redesign CSS files are absent from the active manifest and generated bundle.
- Generated bundle equals the deterministic manifest output.
- Existing board renderer and application event contracts remain unchanged.
- Mobile launcher and TimeTracker additive features remain included.
- Unit/regression tests, syntax, lint, formatting, production build, and responsive browser acceptance pass.
- Responsive browser coverage includes 390, 640, 768, 810, 1024, 1280, 1440, and 1898 CSS-pixel viewports in light and dark themes.
- Mobile launcher runtime acceptance covers mobile route navigation, catalog search, favorites, workspace reset, and desktop isolation.
- Production deployment and live CDN verification are reported separately from local implementation acceptance.

## Visual evidence

Browser acceptance writes before/restored screenshots to `docs/visual/cp-crm-ui-restore-01/`, including desktop and mobile captures in light and dark themes. The additive mobile launcher has a separate runtime acceptance script; it does not replace the desktop CRM shell.

## Local verification results

| Verification                       |                 Result |
| ---------------------------------- | ---------------------: |
| Full frontend regression           | 3,389 passed, 0 failed |
| Syntax checks                      |                   PASS |
| ESLint                             |                   PASS |
| Prettier                           |                   PASS |
| Production Vite build              |                   PASS |
| Overview browser acceptance        |      242 checks passed |
| Boards browser acceptance          |      344 checks passed |
| Mobile launcher runtime acceptance |       20 checks passed |
| Git diff whitespace check          |                   PASS |

The production build retains the repository's existing advisory warnings: the classic `startup-guard.js` script is not bundled by Vite, and the main application/PDF chunks exceed the 500 kB advisory threshold. The build completes successfully; this restoration does not alter chunk splitting or the startup-guard loading model.

## Status

Local implementation and acceptance are verified. GitHub pull-request CI, merge, GitHub Pages deployment, and live CDN verification remain separate release steps; no production release is claimed by this document.
