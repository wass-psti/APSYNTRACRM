# CP-CRM-DARK-09 — Screenshot-driven workspace and Account & Security refinements

## Reproduction and scope

The user supplied five actual screenshots documenting remaining light-theme elements in the Workspace switcher, Browse All Workspaces, Add Workspace, Account & Security and Change Password / Session Security. The older dark palette covers the outer dialogs, but stronger selectors in `soft-minimalist.css`, `workspace-ui.css` and `settings-experience.css` still apply pale information banners, search/selection controls, file-upload widgets and password/session controls.

## Implementation

`frontend/dark-workspace-account-completion.css` is the last stylesheet in the deterministic bundle, scoped to the dark theme and screen media. It corrects workspace selector entries and status pills, Browse tabs and notice, Add Workspace intro/privacy controls/footer, profile-photo upload and privacy notice, password inputs and submit, token warning and session control buttons. Existing modal geometry, role presentation, authentication, workspace creation availability, token handling, invitation behavior and client/server logic remain unchanged. CSS adds no permission restrictions, hidden features, APIs, dependencies or data changes. Light mode remains unchanged. Cache-busting stylesheet version: `cp-crm-dark-09`.

## Verification and evidence

Run `node scripts/cp-crm-dark-09-browser.mjs` to compare preceding production CSS and new CSS in Chromium against equivalent representative workspace/account DOM at 390, 768, 1440 and 1898 CSS pixels in dark and light modes; asserts the explicit light-surface corrections, keyboard focus, reduced motion and light-mode computed colors unchanged. The generated preview files in `docs/visual/cp-crm-dark-09/` are representative fixture renders, **not authenticated production screenshots**. The five user-provided screenshots are the acceptance reference and not reauthored or stored in repository.

Full suite, build, PR CI and Pages deployment are independent mandatory gates. Genuine signed-account interactive browser acceptance is **not proved by static fixture checks**. Do not claim all components are certified without an actual signed account walkthrough.
