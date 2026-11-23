# CP-FUELTRANS-NATIVE-APP-01 — Native Application Navigation Alignment

## Objective

Align FuelTrans with the CRM-native application navigation pattern used by TimeTracker. Users enter FuelTrans directly instead of selecting a generic board view or an application-source tab.

## Implementation

- Register the existing FuelTrans application as a native navigation entry at `#/fueltrans` in the workspace application ownership manifest.
- Keep the existing canonical FuelTrans board ID as the existing application data source; no board, database, membership, role, or permission records are created or changed.
- Route the native entry to the existing FuelTrans board and mount the existing lazy-loaded FuelTrans renderer in its native host container.
- Render the FuelTrans native host before the generic board page header and board tabs. This removes `Main table`, `APSYNTRA Issues`, and `FuelTrans application` from FuelTrans while preserving those generic board views for unrelated boards.
- Redirect legacy FuelTrans board URLs to the canonical `#/fueltrans` route and preserve nested ticket/report navigation.
- Exclude the FuelTrans application board from generic board-card navigation, matching the existing standalone application pattern.
- Keep the existing FuelTrans membership client and business workflows unchanged.

## Verification

- Focused route, navigation, native host and lazy-mount regression tests.
- Full frontend test suite.
- JavaScript syntax, migration-manifest, lint and build checks.
- Post-deployment CRM-host browser smoke test confirming the three generic source tabs are absent and the native FuelTrans dashboard is rendered.

## Scope exclusions

No Supabase migration, new project, new role, permission/RLS change, ticket lifecycle change, ticket-numbering change, or model-training/optimization path is included.
