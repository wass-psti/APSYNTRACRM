# CP-FT-UI-01 — FuelTrans Reference-Style Application Shell

## Scope

Implement the visual foundation of the 19 supplied FuelTrans Support Portal reference screenshots inside the existing APSYNTRA CRM FuelTrans native module. This is a presentation-only checkpoint. Ticket data, operational transitions, Supabase schema, RPCs, CRM sessions, role handling, and workspace isolation remain unchanged.

## Implemented

- Navy vertical application navigation with grouped routes, blue active selection, and membership identity.
- Compact FuelTrans top toolbar with Manila shift display and the existing refresh interval selector.
- Cool gray canvas, light cards, blue controls, subdued borders, legible status chips, tables, forms, ticket wizard steps, detail panels, and reports.
- Six accurate dashboard status counters using existing scoped query counts, a six-item recent ticket list, and a status distribution panel.
- Container-aware responsive presentation: sidebar at desktop/tablet widths, horizontal scroll navigation on small screens.
- Separate `reference-design.css` stylesheet loaded after the preexisting FuelTrans styles. No new runtime dependencies.

## Verification performed on 2026-11-23

- `node --check frontend/fueltrans/app.js` — PASS.
- `node --check frontend/fueltrans-native.js` — PASS.
- `node --test frontend/tests/fueltrans-*.test.mjs frontend/tests/user-role-workspace-fueltrans.test.mjs frontend/tests/cp-urm-fueltrans-activation-trace.test.mjs` — 27/27 PASS.
- `npm test` — 3,389/3,389 PASS.
- `npm run check` — PASS.
- `npm run lint` — PASS.
- Targeted `eslint frontend/fueltrans/app.js frontend/fueltrans-native.js` — PASS.
- `npm run build` — PASS; Vite produced a reference-design CSS asset.
- Local headless Chromium visual fixture, 1200px/768px/540px: intended sidebar/sidebar-to-mobile behavior, navy/canvas colors, no document horizontal overflow — PASS.
- `git diff --check` — PASS.

These visual fixture checks do not prove signed-in production route behavior or every referenced screen. Existing source docs already distinguish native workflow coverage from original-source visual parity.

## Deferred acceptance / CP-FT-UI-02

- Signed APSYNTRA CRM session checks across Dashboard, Create Ticket (all five existing stages), Ticket Queue, details, L1/L2, handover, Analytics, and Report Issue.
- Additional reference-specific screen work: station directory/Station Manager does not currently exist as a native FuelTrans route; it must not be represented by a dead navigation link or fabricated station data.
- Workflow UI parity must preserve existing five-stage submission, draft recovery, duplicate review, evidence, and report controls until a separately verified workflow change is approved.
- Actual cross-role and signed mutation testing must remain nonproduction, and live records must not be created merely for styling verification.
- The legacy source blueprint describes a three-step wizard, while the native CRM module currently has five source-aligned stages; visual parity is not approval to alter the wizard contract.
- No gradient descent, training loops, retraining, model weight updates, or model-training dependency introduced.

## Next solid implementation

**CP-FT-UI-02 — FuelTrans Operational Screen Fidelity and Station Manager Integration.** Adapt the creation wizard, queue, ticket detail workbench, handover, analytics, and issue reporting to the supplied screenshots; verify which station-directory contracts are available before exposing Station Manager. Complete signed-in responsive/browser acceptance without altering the existing backend contracts or permissions.
