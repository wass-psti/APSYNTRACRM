# CP-CRM-DARK-08 — Targeted attendance admin and monitor dark-mode closure

## Confirmed remaining defects

1. TimeTracker Attendance Log's administrative toolbar and selection controls have light gradients and white buttons even when the global theme is dark.
2. The Attendance Log record editor, field sections, and GPS detail cards retain white surfaces, dark-on-light input text, and light footer actions.
3. The bulk deletion confirmation dialog and audit note retain white backgrounds and insufficiently harmonized controls.
4. The TimeTracker Monitor empty state and statistics cards retain light panels and text.

## Implemented

`frontend/dark-attendance-admin.css` applies **screen-only, dark-only** styling to these existing native components. It preserves destructive-red controls, green success/audit hints, disabled-state distinctions, visible focus and reduced-motion preferences. No new Javascript, dependencies, role constraints, API changes, RLS, data changes, record mutations or session handling were introduced. Light mode and print rendering are unchanged. The existing style bundle is versioned as `cp-crm-dark-08`.

## Verification and limitations

`node scripts/cp-crm-dark-08-browser.mjs` compares old and candidate CSS in Chromium using equivalent representative component DOM at viewport widths 390, 768 and 1440 in both light/dark themes. The test covers dark surfaces, representative text contrast, focus, reduced-motion and unchanged computed light-mode styles. The screenshots under `docs/visual/cp-crm-dark-08` are representative fixtures, not authenticated production captures. Separate full regression, production build, PR CI and Pages deployment gates must pass.

The signed browser context is discoverable and readable but does not offer direct interactive control in this Chat connection. Authenticated role-specific visual acceptance remains unverified and must not be inferred from the fixture or deployment.
