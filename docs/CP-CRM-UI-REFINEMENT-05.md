# CP-CRM-UI-REFINEMENT-05 — Role and responsive production acceptance

## Scope and operational constraints

Continue CP01–CP04 design-system and menu acceptance without changing production functionality, authorization, database/API contracts, records or application workflows. Use **only the existing signed APSYNTRA CRM tab** for live interaction. Never open an alternate Chromium profile, impersonate a different role, launch a second browser, or create data simply to obtain visual evidence.

## Evidence gathered on 21 November 2026

- Desktop Commander reported `Informations-MacBook-Pro.local` online.
- The connected Browser interface could read the existing APSYNTRA tab on `#/overview`. The visible shell identified the signed workspace as **Work Management** with a **Workspace member** role and listed **256 boards** and the available application navigation.
- The Mac's Chromium process existed, but Apple Events reported **zero Chromium windows** (`get count of windows = 0`); `get URL of active tab of front window` failed. The Browser connector supplies read-only tab context and cannot perform keyboard, screenshot or viewport resizing actions in this Chat-mode session. This is an **access/automation blocker**, not evidence that a page is broken.
- No second browser/profile was started. No administrator-only identity/session was available, and no claim of administrator-screen acceptance is made.
- CP04's previous, already verified production scope remains valid: the existing signed tab had completed three successful ten-route desktop checks, six menu checks each, while restoring Overview. CP02 had already passed representative isolated 390px/768px/1440px responsive and WCAG component fixtures. These are historical baseline checks, **not** new CP05 live mobile production evidence.

## New implementation — one-window responsive acceptance

- `scripts/cp-crm-ui-refinement-05-existing-window.mjs` controls **only** an already-open Chromium CRM window, saves its original bounds, visits 390px, 768px and 1280px targets, and restores the original bounds in `finally`. It checks the actual measured CSS viewport rather than pretending that the requested window size was reached. If the window is absent, it reports `BLOCKED` and exits non-zero; no new window is launched.
- `scripts/cp-crm-ui-refinement-05-viewport-probe.js` is read-only JavaScript executed in that tab. It navigates the ten established routes; collects CSS document overflow, contained horizontal scrollers, visible controls, and dialog counts; and restores the original route. It reads **no** authentication credentials, session tokens or personal records and clicks no menu commands or forms. Tab visibility loss produces a blocking error rather than misleading visual certification.
- `frontend/tests/cp-crm-ui-refinement-05.test.mjs` enforces single-tab usage, window/route restoration, absence of mutations or credential extraction, and failure on unsupported viewports or disconnected windows.

## Acceptance matrix

| Area                                                    | Prior evidence                                         | CP05 status                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Shared CSS, board menus, existing desktop routes        | CP01–CP04 source/CI/production checks                  | Previously VERIFIED; no regression introduced by CP05 tooling |
| Current Workspace member shell, board navigation        | Read-only live tab context                             | Verified present (not interactive certification)              |
| Genuine production member workflows / nested forms      | Requires active interactive tab                        | BLOCKED for CP05                                              |
| Real production tablet viewport                         | Existing Chromium window not controllable              | BLOCKED                                                       |
| Real production narrow/mobile viewport                  | Existing Chromium window not controllable              | BLOCKED                                                       |
| Touch interactions and physical mobile device           | No connected physical mobile browser control           | PENDING                                                       |
| Independent administrator / specialized role UI         | No genuine signed eligible account supplied            | PENDING                                                       |
| 12 applications' all nested routes and stateful dialogs | Broader than read-only shell + representative fixtures | PENDING                                                       |

## Acceptance criteria and next minimal unblock

A passing CP05 production certification requires a genuine connected Chromium window with the existing CRM tab, stable foreground rendering, actual measured viewport sizes, real screen observation, and authorized role sessions for the pages being certified. Do not use a simulated admin, alter production role configuration, or bypass permission checks. The smallest reproducible unblock is to expose the **currently used APSYNTRA tab as a controllable Chromium window on the authorized Mac**, without switching accounts or launching alternate profiles, then run:

```sh
cd ~/.apsyntra-work/cp-crm-ui-refinement-05
node scripts/cp-crm-ui-refinement-05-existing-window.mjs
```

A green responsive runner only certifies existing desktop Chromium at narrow widths; it does not replace physical touch/mobile hardware testing. Avoid launching any new browser for the user's live acceptance. If no actual frontend defect is reproduced, leave production CSS and JS unchanged rather than inventing a redesign.
