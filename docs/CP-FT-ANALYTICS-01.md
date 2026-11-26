# CP-FT-ANALYTICS-01 — FuelTrack+ Analytics Redesign

## Objective

Replace the signed FuelTrack+ Analytics placeholder presentation with a responsive executive analytics experience while preserving the existing signed backend contracts and all other FuelTrack workflows.

## Delivered scope

- Premium analytics header, signed-data indicator, and refresh control.
- Four KPI cards: recorded expenditure, dispensed liters, completed transactions, and weighted effective cost per liter.
- Independent daily spending and fuel-volume chart series, with a selectable spend/volume/both view.
- Signed date windows: 7, 30, 180, and 365 days. The route encodes the selected window and the existing backend RPC is called with the corresponding p_days.
- Daily summary table and current signed request-status totals.
- Fuel Price and Frequency views derived from daily signed aggregates.
- Efficiency, Requestors, and Odometer views explicitly explain which source fields are absent; no synthetic vehicle metrics or rankings are shown.
- CSV export of the currently loaded, verified daily aggregate response.
- Dedicated responsive analytics stylesheet in the existing single CSS bundle, with dark overrides in the native dark layer for desktop, tablet, and mobile.

## Data contract and calculations

The existing fueltrack_v3_analytics RPC remains the sole source for daily aggregates. It returns workspace-scoped completed transactions grouped by completed_at in Asia/Manila, with transactions, amount, and liters.

- Total spent = sum of daily amount.
- Fuel volume = sum of daily liters.
- Completed transactions = sum of daily transactions.
- Effective cost per liter = total amount / total liters, when liters are greater than zero.

Effective cost per liter is a weighted realized cost, not a station-listed pump price. Vehicle efficiency requires odometer/distance records; requestor rankings require a complete signed requestor aggregate. Those values are not inferred from the paginated request snapshot.

## Verification

The FuelTrack UI workflow runs:
1. Node renderer, data-contract, route, date-window, CSV, and regression tests.
2. Deterministic CSS bundle consistency check (the new stylesheet is loaded as a dedicated asset and does not modify the generated bundle).
3. Headless Chromium acceptance for desktop, tablet, mobile, dark appearance, analytics navigation, and overflow.

No database migrations, RPC changes, role changes, permission changes, or unrelated application changes are included. No training, retraining, gradient descent, or model-parameter optimization paths are introduced.

## Deployment

Merge to main only after the GitHub Actions acceptance workflow passes. GitHub Pages deployment and signed production-user acceptance are separate verification gates.
