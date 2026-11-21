# CP-CRM-UI-REFINEMENT-09 — Existing-session automation readiness

## Scope and constraints

Continue CP06–CP08 without modifying auth, roles, permissions, production data, account settings, application workflows, or the user's browser state. The purpose of this iteration is to distinguish **tab discovery** from **actual controllability** before attempting signed cross-module interactions. Do not certify a production route, user role, or physical device without direct evidence.

## Confirmed baseline

- CP08 GitHub Pages deployment run `44919252156` succeeded. Full frontend validation run `44919252319` succeeded, including its database-backed and live-Pages jobs.
- Desktop Commander confirms an online Mac. The Browser connector lists the existing signed APSYNTRA `#/overview` tab and can read its page context. This connection is **read-only**, not an interactive browser automation endpoint.
- The selected browser tab may change while other work is happening. The macOS Accessibility active-window title alternated between APSYNTRA CRM and Paseo de Lomboy. Chromium Apple Events reports **zero windows** even while Accessibility reports a window. Therefore, the existing-window AppleScript `execute tab javascript` audit cannot be used reliably, and window resizing remains unsafe for production sign-off.

## Implementation

`cp-crm-ui-refinement-09-readiness.mjs` provides a read-only, one-shot foreground-window and Apple Events capability diagnostic. It outputs restricted local evidence at `/tmp/cp-crm-ui09-readiness.json` (mode `0600`), makes no browser/session modifications, and deliberately distinguishes a selected CRM window from controllable Apple Events windows. Any other foreground tab, invalid geometry, unavailable Apple Events, or accessibility error returns `BLOCKED`. A `READY_FOR_WINDOW_GEOMETRY_ONLY` result is still **not** signed interaction certification.

`frontend/tests/cp-crm-ui-refinement-09.test.mjs` covers positive geometry-only readiness, zero/missing Apple Events windows, wrong foreground tab, missing geometry, read failure, and non-mutating behavior.

## Acceptance boundaries

| Gate                                            | Status              | Evidence                                            |
| ----------------------------------------------- | ------------------- | --------------------------------------------------- |
| CP08 deployment and frontend validation         | VERIFIED            | GitHub Actions runs above                           |
| CRM tab discovery, read-only page context       | VERIFIED            | Browser connector                                   |
| Existing Chromium remote interactive control    | BLOCKED             | Apple Events zero windows; alternate foreground tab |
| Genuine isolated CSS viewport fixture           | VERIFIED PREVIOUSLY | CP02 at 390/768/1440px, 27 assertions               |
| TimeTracker isolated browser workflow fixture   | VERIFIED PREVIOUSLY | TimeTracker browser acceptance                      |
| Signed cross-module interaction and persistence | PENDING             | Cannot control confirmed signed tab                 |
| Independent real second-user role acceptance    | PENDING             | Separate authorized session not verified            |
| Physical mobile/tablet touch behavior           | PENDING             | Not equivalent to desktop emulation                 |

## Execution and next step

From the worktree, run `node scripts/cp-crm-ui-refinement-09-readiness.mjs`. Once interactive browser control of the _already authorized_ CRM tab is actually available, verify route navigation, dialogs, menus, responsive overflow, and TimeTracker record readback without manufacturing user privileges or making unapproved production mutations. Then independently check a second genuine account and real mobile/tablet hardware. Until then, full UI/UX certification is not supported.
