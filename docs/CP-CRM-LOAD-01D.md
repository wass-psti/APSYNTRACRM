# CP-CRM-LOAD-01D — In-Place Application Navigation

## Objective

Certify same-document navigation between registered APSYNTRA CRM applications while retaining the existing shell for the same signed-in user and workspace. Preserve the existing full loader for cold startup and scope transitions.

## Implementation

- Extracted the existing same-scope shell DOM patch into frontend/application-shell-dom.js. The application shell now calls this shared helper; the helper updates the active navigation marker, breadcrumb, avatar contents and application content without replacing the shell, sidebar or topbar.
- Kept the existing shell identity decision in frontend/app.js. A different user/workspace still creates a fresh shell. A changed sidebar catalog still refreshes the sidebar and restores its scroll position.
- Exposed the existing route-read freshness condition as isCurrentApplicationRouteRead in frontend/application-loading.js and used it in the application route completion path. Results are accepted only when the same token, hash, signed-in user and workspace remain current.
- Added a route-catalog regression test for every registered Work Management application.
- Fixed one verified navigation defect: FuelTrans was missing from the primary sidebar route set. Nested FuelTrans routes now select the FuelTrans Support Portal entry. This is presentation-only and does not change application access or data permissions.

## Acceptance coverage

1. Same-scope application navigation retains shell, sidebar, topbar and main content host DOM identity.
2. The active application, breadcrumb and content change to the destination route.
3. All registered application navigation routes resolve to their matching sidebar entry.
4. Browser Back and Forward restore the expected route and active navigation.
5. Same-scope pending reads retain existing form values and focus.
6. Stale route responses are rejected when the active token, hash, user or workspace changes.
7. Route errors render inside the retained shell.
8. A changed sidebar catalog refreshes the sidebar while preserving scroll.
9. A user/workspace scope transition does not reuse the previous shell.
10. Chromium observes one document navigation entry throughout the in-place route sequence.

The browser acceptance uses the production shell DOM helper, application-loading helpers and sidebar route resolver in a disposable Vite/Chromium fixture. It does not sign into production or perform attendance, financial, document or other business writes.

## Scope exclusions

- No database migrations or changes to Supabase data contracts.
- No new roles, permissions, authorization restrictions or application assignments.
- No new dependencies.
- No model training, gradient descent, backpropagation, fine-tuning or model-parameter update code.
- No change to the inference-only execution architecture.

## Verification

CI execution and acceptance evidence are recorded below.


## Verified results — 2026-11-27

- Main-branch frontend validation: PASS — workflow run 45969692589. The complete frontend suite reported 4,023 tests passed and 0 failed.
- Chromium acceptance: PASS — 10 application routes; Back/Forward; one document navigation entry; same-scope shell/sidebar/topbar/content-host identity; active route and breadcrumb updates; pending-read retention; stale-read rejection; in-shell route errors; sidebar refresh with scroll restoration; and fresh-shell behavior on scope change. Chromium reported zero page errors.
- Disposable PostgreSQL jobs in the same frontend workflow: PASS.
- GitHub Pages build and deployment: PASS — workflow run 45969691502.
- Live Pages smoke: PASS for main commit 996c7430cfe5bf52a2257bd3764c9f0054f119ab. It verified the hosted entry point, application bundle, required static resources and approved endpoint reachability.

The Chromium fixture imports and executes the same production shell DOM, loading-state and route-resolution modules used by frontend/app.js. It is intentionally isolated and read-only: it does not establish a signed-in production session or perform business writes. The live Pages smoke is a deployment/resource check, not a signed-in application-to-application browser session. The scoped CP-CRM-LOAD-01D code and DOM acceptance criteria are verified; a separate manual signed-in user session walkthrough was not claimed.
