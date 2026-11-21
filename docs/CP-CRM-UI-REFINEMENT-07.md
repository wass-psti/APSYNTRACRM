# CP-CRM-UI-REFINEMENT-07 — Responsive recovery and acceptance evidence integrity

## Scope

Continue CP06 without altering authorization, authentication, production data, application workflow, or the user's existing browser profile. No UI rewrite is warranted without a reproduced defect. Independent role-specific checks must use independently authorized genuine sessions; simulated or inferred roles are not acceptable evidence.

## Browser and viewport observations (21 November 2026)

- Desktop Commander connected to `Informations-MacBook-Pro.local`; browser tab discovery confirmed the existing signed APSYNTRA CRM overview tab.
- macOS Accessibility currently reports the foreground Chromium window as the Paseo de Lomboy page, not the APSYNTRA CRM page. Therefore the CP06 existing-window runner correctly returns `BLOCKED: EXISTING_CRM_TAB_NOT_SELECTED`; it does not switch tabs without a safe guarantee of restoration.
- An isolated Chromium fixture (CP02) measured genuine CSS viewports of 390px, 768px, and 1440px and passed 27 layout, keyboard, focus, reduced-motion, and accessibility assertions. This is valid fixture testing, **not** signed production acceptance or physical touch-device certification.
- The TimeTracker browser acceptance script passed for its existing attendance views, Log controls and editor fields, responsive layouts, and accessibility. This is isolated browser testing, not a signed administrator versus employee authorization check.

## Evidence integrity fix

CP06 previously checked that a screenshot filename existed but could consume a screenshot left from an earlier run. CP07 removes the old image before capture and rejects files whose modification timestamp predates the current run, with regression coverage. Reports continue to mark genuine narrow-view acceptance and independent role certification as incomplete unless verified. Local screenshots and structured acceptance evidence are never committed.

## Acceptance matrix

| Gate                                            | Classification | Evidence                                                                |
| ----------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Live signed CRM tab discovery                   | VERIFIED       | Browser tab context, read-only                                          |
| Isolated true CSS 390/768/1440 viewports        | VERIFIED       | CP02, 27 assertions                                                     |
| TimeTracker isolated browser UI                 | VERIFIED       | TimeTracker browser acceptance                                          |
| Existing live CRM 390px CSS viewport            | BLOCKED        | Foreground window is not the CRM tab; split-view/window minimum in CP06 |
| Cross-module signed interaction and persistence | PENDING        | No safe interactive control of authenticated tab                        |
| Second independent authorized role              | PENDING        | No second independently verified session supplied                       |
| Physical touch/gesture device                   | PENDING        | Not represented by desktop browser emulation                            |

## Reproduction

```sh
node --test frontend/tests/cp-crm-ui-refinement-06.test.mjs
node scripts/cp-crm-ui-refinement-02-browser-acceptance.mjs
node scripts/time-tracker-browser-acceptance.mjs
node scripts/cp-crm-ui-refinement-06-ax-acceptance.mjs
```

The last command must be run only when the existing authenticated CRM Chromium window is actually foreground. A rejected run is recorded as blocked rather than certified. Re-test on a genuine mobile browser and separately signed authorized role before final production UI/UX sign-off. Do not bypass session protections, grant new privileges, or make production mutations solely to satisfy acceptance.
