# CP-CRM-UI-REFINEMENT-08 — Existing signed-window acceptance recovery

## Scope

Continue the CRM UI refinement acceptance series without changing authentication, role rules, permissions, production data, application workflows, or user browser profiles. Focus on recoverable audit tooling and verified UI regression evidence. Do not equate fixture tests with live multi-account or physical-device certification.

## Confirmed deployment and live browser evidence

- CP07 merge `9e001b5b` has a successful GitHub Pages build, report, and deployment (run `44918812760`).
- Desktop Commander was online on 21 November 2026. The Browser connector detected the existing APSYNTRA CRM `#/overview` tab, and macOS Accessibility initially detected its window as the foreground Chromium window.
- CP06 attempted to measure existing-window breakpoints and failed with macOS Accessibility error `-10006` when setting the original 2056×1233 window size. The old runner discarded the output on a nonzero AppleScript exit and recorded no measurements. A later read showed the full window geometry was 2056×1233 at (0,44), with the Paseo de Lomboy tab foreground. No production data or roles were changed.
- Browser tab listing/read-only inspection does not provide signed interactive JavaScript execution or independent-role evidence.

## CP08 fix

The existing CP06 AppleScript now traps size, position, and readback restoration failures individually and emits `RESTORE_ERROR` records without discarding earlier viewport measurements. It captures original and restored window position in addition to width and height. The Node acceptance runner rejects any restoration error, invalid value, or measured coordinate mismatch. A regression test checks these failure-safe boundaries.

## Acceptance matrix

| Gate                                       | Status   | Evidence                                             |
| ------------------------------------------ | -------- | ---------------------------------------------------- |
| CP07 GitHub Pages deployment               | VERIFIED | Run 44918812760 successful                           |
| Existing signed CRM tab discovery          | VERIFIED | Browser list and macOS Accessibility title           |
| Isolated CSS viewport 390, 768, 1440px     | VERIFIED | CP02 Chromium fixture, 27 assertions                 |
| Isolated TimeTracker responsive/UI checks  | VERIFIED | Browser acceptance script PASS                       |
| CP08 AppleScript syntax and focused tests  | VERIFIED | Compiled; focused tests PASS                         |
| Existing signed CRM viewport restoration   | BLOCKED  | macOS error -10006; no new live PASS                 |
| Live cross-module interactions/persistence | PENDING  | No safe, authenticated scripting session established |
| Independent second authorized user         | PENDING  | Separate user session not verified                   |
| Physical mobile/tablet touch interaction   | PENDING  | Desktop fixture is not physical hardware             |

## Next acceptance gate

Once an existing signed CRM window can be reliably controlled and restored, perform non-mutating live route and responsive tests, followed by authorized test-account workflow/persistence checks. Require a separate genuine user session for role-specific acceptance and a real mobile/tablet browser for gesture and device behavior. Preserve existing user state throughout. Do not claim full production UI/UX certification until each outstanding gate is supported by direct evidence.
