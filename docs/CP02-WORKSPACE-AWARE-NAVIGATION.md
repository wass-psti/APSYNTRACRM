# CP02 — Workspace-Aware Sidebar and Application Route Isolation

- **Checkpoint:** CP02 — Workspace-Aware Sidebar and Application Route Isolation
- **Base:** CP01 commit `3a860458` — canonical workspace identity and application ownership
- **Branch:** `cp01-workspace-identity-ownership`
- **Application:** APSYNTRA CRM
- **Implementation date:** 2026-11-23

## Objective

Make the existing sidebar and hash router consume the CP01 application ownership manifest. Work Management keeps its existing application navigation; Main Workspace and every other workspace remain independent environments without inherited Work Management application links or application routes.

## Implementation

### Workspace-aware navigation

`frontend/workspace-application-routing.js` provides the application navigation and route ownership helpers.

- Work Management resolves its 15 registered navigation entries from the CP01 manifest: twelve board applications and three auxiliary application routes.
- Existing application order, labels, route kinds, native icons and TalkBox's Toolbox Issues dependency are preserved.
- Board-backed application entries are included only when their canonical board ID is present in the active workspace's signed board catalog.
- Native application routes retain their current behavior and are not made dependent on a generic board-list row.
- Non-Work-Management workspaces receive an empty Work Management application navigation list.
- The Applications section heading is omitted when the active workspace has no application entries.
- Overview, My Boards, workspace switching, Teams, Administration and Account navigation remain available independently of the application section.

### Application route ownership

The route resolver recognizes all twelve canonical board IDs, the four existing native application routes, and the three auxiliary routes. Nested paths and record deep links inherit their application's owner workspace.

When a registered Work Management application route is opened while another workspace is active, the app shell:

1. Replaces the application URL with `#/overview` without adding a history entry.
2. Clears stale board and application-specific view state.
3. Invalidates the active route generation so superseded route work cannot update the current view.
4. Displays a concise workspace ownership notification.
5. Does not initialize the requested application module.

Ordinary CRM routes and independently created board IDs are not classified as Work Management application routes.

This is client-side application placement and navigation behavior only. It does not grant, revoke or alter roles, permissions, RLS, membership or backend access. Existing signed API contracts remain authoritative for data access.

### Workspace transition continuity

When an already initialized session's user or workspace identity changes, `refreshWorkspace()` clears the previous workspace's board, archived and trashed catalogs and native application state before loading the new workspace catalog. It returns the view to Overview and replaces the route so old workspace board or application state is not rendered while the new catalog is loading.

Initial session initialization is unchanged and continues to support legitimate direct application deep links after the signed workspace context is established. The existing verified workspace-switch receipt and full reload behavior remain intact.

## Files changed

- `frontend/workspace-application-routing.js` — pure application navigation and route ownership resolution.
- `frontend/app.js` — manifest-backed Applications section, route ownership handling, and stale workspace-state cleanup.
- `frontend/tests/workspace-application-routing.test.mjs` — route ownership, deep links, navigation catalog, ordinary CRM route compatibility and workspace transition regression coverage.
- Existing sidebar/application tests updated to assert the new manifest-backed navigation contract instead of hard-coded link strings.
- `scripts/cp02-workspace-application-routing-browser.mjs` — Chromium browser acceptance for module loading, desktop/mobile viewports, 15-entry Work Management navigation, empty foreign-workspace navigation, and route ownership.

## Acceptance criteria

| Scenario                                                         | Expected result                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Work Management with all 12 canonical boards                     | 15 registered application entries                                                            |
| Main Workspace                                                   | No Work Management application entries                                                       |
| Any other workspace                                              | No Work Management application entries                                                       |
| Board-backed application board missing from active catalog       | Its board-backed link is omitted                                                             |
| TalkBox board dependency missing                                 | TalkBox link is omitted                                                                      |
| Direct native application route outside Work Management          | Redirect to Overview before module initialization                                            |
| Direct canonical application board route outside Work Management | Redirect to Overview before board loading                                                    |
| Nested application deep link outside Work Management             | Redirect to Overview                                                                         |
| Ordinary Overview, Settings and My Boards routes                 | Unchanged                                                                                    |
| Independently created board route                                | Unchanged                                                                                    |
| Existing workspace identity changes in-session                   | Previous workspace catalog and app state cleared before new catalog load                     |
| Initial deep link after session initialization                   | Existing route restoration remains supported                                                 |
| Workspace switch                                                 | Existing verified switch and reload behavior preserved                                       |
| Desktop and mobile browser module execution                      | No page errors; same application ownership result                                            |
| Training constraint                                              | No training, retraining, fine-tuning, gradient descent or model parameter updates introduced |

## Verification evidence

- Full repository automated test suite: **3,415 passed, 0 failed** (final run recorded after implementation).
- Focused workspace/application route tests: **13 passed**.
- Existing sidebar and application integration tests: **all passed**.
- Chromium browser acceptance: **PASS** at 1440×900 and 390×844.
  - Work Management application entries: 15.
  - Foreign workspace application entries: 0.
  - Foreign-workspace direct application routes incorrectly allowed: 0.
  - Owner-workspace application routes incorrectly denied: 0.
  - Ordinary CRM and custom board routes preserved.
  - Browser page errors: 0.
- Repository syntax checks, build and lint: PASS. Build retains the repository’s existing non-blocking large-chunk size warning.

## Explicitly unchanged

- No Supabase migrations or production database changes.
- No workspace, membership or personal-workspace mapping mutations.
- No role, permission, RLS or Storage policy changes.
- No board or application business records moved, cloned, deleted or reassigned.
- No new authentication provider or backend architecture.
- No new frontend framework or package dependency.
- No gradient descent, backpropagation, model training, retraining, fine-tuning or model-parameter update paths.

## Deployment state

This checkpoint is implemented and verified locally. It is not deployed until the repository's normal branch/review/deployment process completes. CP01 remains the parent commit on the current feature branch.
