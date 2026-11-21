# Courts Administration — Navigation and Module Accessibility Recovery

## Root cause

The shared administrator navigation linked to seven `/admin/*` routes whose router entries unconditionally redirected to `/admin/sign-in`, even when an existing authenticated admin session was valid. Several of the old page components also redirected to the combined reservations page or showed non-functional placeholder text. This was a route/module availability regression, not a database-schema or customer-record failure.

## Resolution

- Restore `/admin/courts`, `/admin/calendar`, `/admin/bookings`, `/admin/pricing`, `/admin/payments`, `/admin/customers`, and `/admin/settings` as lazily loaded route components. Restore `/admin` overview as well.
- Keep the existing `AdminShell` and its `StagingAdminGate` session check. No new authorization, roles, permissions or backend API changes.
- Court Settings, Pricing, Bookings and Payments use targeted views of the existing persisted reservations/courts/payment workspace, with existing read, save, preview, verify and cancellation actions.
- Customer Directory derives distinct contacts from the loaded reservation pages; it is not a separate server-wide customer table. Additional records can be loaded through existing pagination. No duplicate data store is introduced.
- Calendar and Settings mount their previously implemented server-backed pages. They retain their weekday/maintenance and operational-policy fetch, save, and readback flows.
- Public booking and CRM separation remain unchanged.

## Verification

- `npm run build:pdl` — TypeScript and Vite production build.
- `node --test frontend/tests/pdl-admin-navigation-recovery.test.mjs frontend/tests/pdl-aps-native*.test.mjs` — route, contract and prior native regression tests.
- `node scripts/pdl-aps-native-browser.mjs` — Chromium checks for seven routes, direct URLs, refresh, internal switching, back/forward, public isolation, and unchanged booking flow. Administrator data in browser tests is synthetic and HTTP-intercepted.

## Acceptance limits

The actual live administrator's existing data and real operator save/write outcomes require signed browser verification. Automated fixture success is not proof that a live external database write has completed. No live venue rates, financial transactions, or customer records were modified to certify this UI change.
