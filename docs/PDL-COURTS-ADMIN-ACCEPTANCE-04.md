# PDL-COURTS-ADMIN-ACCEPTANCE-04 — Same-tab Seven-module Readback

## Observed genuine browser evidence

- The existing Paseo browser tab showed the administrator shell and real server data for Calendar, the stored Bookings queue, and Payment Methods. This is read-only evidence, not write/persistence certification.
- New browser tabs opened through Desktop Commander arrived at `/admin/sign-in`, because the admin token is session-storage scoped to the existing browser tab. This is not evidence of a revoked original session.
- No live rates, receipts, customers, recipient settings, reservations, or payment statuses were modified.

## Implemented

- `/admin/acceptance`: a read-only, seven-module server-data check inside `AdminShell`, using the same browser tab and current administrator session.
- Overview link **Check seven-module readback** routes internally without opening an additional tab.
- Five existing GET endpoints cover court settings, calendar, bookings, pricing, payment methods/status and customers derived from the first reservations page, and operational settings. The seven results distinguish a successful response from unavailable data.
- Displays no personal customer data or payment recipients; does not issue POST/PUT/PATCH/DELETE requests.
- Includes a manual **Run readback again** action. A successful read is explicitly not described as signed write certification.

## Tests and limits

- Synthetic signed browser acceptance verifies seven results, repeat action, no write requests, and navigation back to Overview.
- Contract tests verify existing session gate, five read-only endpoints and absence of mutation methods.
- Deployed unsigned deep-link acceptance includes the new route and verifies the pre-existing sign-in behavior.
- **Pending:** Run the readback in a genuine signed production tab and verify live response results. Full production write/readback on venue policy, pricing, booking/payment workflows remains uncertified without safe authorized changes; no financial or customer record mutation is necessary to certify reads.

## Integration

No new authentication policy, roles, backend schema, Supabase project or dependencies. Preserve existing seven module forms and earlier PDL-APS-NATIVE-07 work.
