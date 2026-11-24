# CP-TT-OT-UX-01 — Submit OT Interface Rework

**Scope:** TimeTracker > OT > employee-facing Submit OT request dialog
**Status:** Implemented; local verification PASS; merge/deployment pending
**Implementation branch:** `cp-tt-ot-ux-01`

## Objective

Replace the manual, text-driven overtime request dialog with a clearer, responsive interface while preserving the existing overtime workflow and application architecture.

## Changes

- Reorganized the dialog into date, overtime schedule, calculated duration, and reason sections.
- Replaced free-text start/end fields with native time inputs. The controls submit the existing `HH:mm` machine representation; browser locale controls the visible clock presentation.
- Added date input bounds matching the existing validation window: 30 days in the past through 7 days in the future.
- Added live duration calculation, a six-hour progress indicator, and inline validation for the existing 30-minute minimum and six-hour maximum.
- Added the 10–500 character reason guidance and live character counter.
- Replaced the technical RPC/audit note with employee-oriented submission guidance.
- Preserved the draft in current in-memory UI state while submission is pending or when the server returns an error.
- Added submitting-state feedback, focus restoration, Escape/backdrop dismissal, and keyboard focus containment.
- Added responsive layouts, focus-visible states, reduced-motion handling, and dark-theme styling.

## Preserved Behavior

- Existing `timetracker_ot_submit` RPC and signed submission client.
- Existing audit workflow and request status lifecycle.
- Existing date, time, duration, and reason validation rules.
- Existing session, workspace, and TimeTracker application integration.
- Separate System Admin Manual OT form and its behavior.

No new permission model, approval layer, database migration, or backend contract was introduced.

## Verification

- Focused OT and time-format suites: 24 tests PASS, including the new UI, preview, native-input, and application-wiring tests.
- Dedicated browser acceptance PASS: desktop/mobile layout, native time controls, live duration, range/reason validation, character counter, dark theme, inactive-contract state, and zero page errors.
- Local Mac real-Chromium TimeTracker acceptance PASS, including the Submit OT modal, responsive views, and WCAG 2.2 AA axe checks.
- GitHub CI confirms the Submit OT accessibility fixture passes. The broader TimeTracker workflow subsequently fails on the separate Clock-tab `#tt-note-wrap` label (1.28:1 contrast), introduced by existing commit `2b903bf`; this out-of-scope Clock issue was not modified.
- Full application build PASS; the existing ordered CSS bundle was regenerated and verified.
- Full application regression suite: 3,605 tests PASS, 0 failures.
- Repository checks PASS: `npm run check`, `npm run lint`, and `npm run format:check`.
- Existing non-blocking Vite warnings remain: the classic startup-guard script is not bundled as a module, and large application chunks exceed the 500 kB advisory threshold.

## Engineering Constraints

No gradient descent, backpropagation, training, retraining, fine-tuning, iterative parameter updates, or model-training execution paths were introduced. The existing inference-only architecture remains unchanged.

## Delivery

No production deployment or merge is claimed by this document. Final delivery status must be updated only after the full regression, CI, merge, and published-site checks have actual evidence.
