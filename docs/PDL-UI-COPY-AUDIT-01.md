# PDL-UI-COPY-AUDIT-01 — User-facing technical copy cleanup

## Scope

Audited the Paseo public guest journey and all native administrative routes: home/courts, court details, How It Works, scheduling, customer details, booking review, payment, guest QR payment, receipts and booking lookup; administrator login, overview, seven-module navigation, bookings, payments, courts, pricing, calendar, customers, settings and workspace-status checks. Included shared header/footer, booking components and QR administration messages.

This is a **user-interface wording audit**, not a backend architecture or authorization project. No SQL migrations, Edge functions, authentication/role policies, backend routes, data schemas, payment-processing logic, page hierarchy or dependencies have changed.

## Key changes

- Replaced user-visible references to **Supabase, SQLite, backend, schema, API/HTTP, readback, staging databases and frontend build stages** with workflow language.
- Removed implementation-specific dashboard text and technical diagnostics from booking, payment, calendar, settings and the administrative workspace-status view.
- Reworded quote, submission, calendar and settings failures into actionable guidance while preserving uncertain-write reconciliation and refresh-before-retry behavior. Unknown server error text is no longer displayed in calendar/settings save responses.
- Replaced sample/production jargon with clear, actionable notices: **test booking**, **not reserved**, **do not transfer real money**, **payment awaiting review**, and **confirmation required**.
- Updated time-slot accessibility labels and downloaded receipt status names to use ordinary words instead of internal descriptors or underscored status identifiers.
- Retained explicit customer and staff safeguards: approved venue rates, verified payment recipient, independent funds review, receipt-not-payment-confirmation, no automatic refunds, and nonempty payment evidence requirements.
- The existing administrator workspace-status functionality remains available and read-only, presented as section availability rather than backend test diagnostics.

## Tests and boundaries

- `frontend/tests/pdl-ui-copy-audit-01.test.mjs`: checks the identified technical phrases are absent from public screens, confirms essential warnings remain, and verifies existing API functions/session checks remain intact.
- Existing CRM Node regression contracts, Paseo Vitest component tests, and the isolated Playwright/browser application suite updated only for deliberately changed visible text, with navigation, persistence, image loading and payment/cancellation guard behavior preserved.
- No changes to production recipient names, QR storage objects, court prices, reservations, permissions or customer/payment records.
- Source-level identifiers and developer comments still use proper engineering terminology internally; the requirement concerns the interface presented to guests and staff.

**Acceptance limit:** Local test fixtures establish workflow compatibility. Genuine signed live pages may be sampled after deployment without changing production data; production write acceptance is not asserted by this UI-only change.
