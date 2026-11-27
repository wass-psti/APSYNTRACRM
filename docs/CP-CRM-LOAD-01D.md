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

CI execution is attached to the main-branch commit that introduces this checkpoint. Record the workflow run, test totals, Chromium output and Pages deployment result here after the run completes.
