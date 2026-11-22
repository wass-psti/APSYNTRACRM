# Paseo de Lomboy — Native APSYNTRA application

## Runtime boundaries

- **Public:** `https://wass-psti.github.io/APSYNTRACRM/paseo/` is a separate HTML/JS document. It does not load the CRM's session code. Guest availability/quotes/reservation submission use the existing **isolated** Supabase `pdl-guest-api` and `pdl_booking` schema; no CRM account or workspace context is used.
- **Native CRM administration:** signed `#/paseo` runs inside the CRM shell. It uses the current verified Supabase Auth token for read-only calls to `GET /v1/admin/session`, `/courts`, and `/reservations`. Existing `pdl_booking.admin_users` membership is checked in the Edge backend; ordinary CRM membership does **not** grant access. Denied/expired sessions show no private records. Backend records remain authoritative and shared between the public and internal interfaces.
- **Full Paseo administration:** the bundled Paseo portal retains its existing `admin/sign-in` and `admin/live-reservations` routes (backend verified). Administrative mutation workflows still use the existing authorized Paseo sign-in; no CRM role is promoted, no new permissions are added, and no tokens are included in URLs.
- **Current booking configuration (22 November 2026):** all three courts are enabled; all nine 60/90/120-minute rate entries are enabled at ₱150/₱225/₱300; each court has seven enabled weekday schedules from 08:00 to 24:00. GCash, Maya and BPI QR image endpoints are configured. The database does not independently record venue approval provenance. No production reservations exist. Public availability and server quotes are live; reservation submission creates a pending-verification record and does not itself verify payment. Original static financial QR images/recipient names remain excluded from the integrated public bundle; enabled live payment methods are fetched only from the existing backend.

## Source and build

- `source/` is a committed copy of Paseo's existing React/Vite source, with deployment-specific changes limited to the root Pages path, live-only backend binding and elimination of unapproved static QR fixtures. It has its own locked dependencies, not root CRM dependencies.
- `supabase/pdl-booking/source/functions/pdl-guest-api` and `supabase/pdl-booking/source/migrations` are reference copies of the existing isolated backend contract. **Do not auto-apply the copied SQL from CRM's migration runner**. The actual migrations are already recorded in the existing Supabase project's migration history.
- `scripts/build-pdl-native.mjs` builds `source/` with `/APSYNTRACRM/paseo/` base and the sole browser-safe public Edge URL, then regenerates the checked-in `paseo/` static assets. It creates a standalone document with no CRM authentication script.
- Run: `npm ci --prefix frontend/apps/Paseo/source --no-audit --no-fund && npm run build:pdl` from the repository root. Commit generated `paseo/` with matching source.
- GitHub Pages project routes use the root `404.html` redirect and `pages-restore.js` to support deep booking/receipt links without moving private receipt tokens from URL fragments.

## Local and CI acceptance

`node --test frontend/tests/pdl-aps-native.test.mjs` and `node scripts/pdl-aps-native-browser.mjs` validate guest/admin separation. The browser harness uses isolated HTTP fixtures, never real paid bookings. CI also validates root CRM syntax/build and the deterministic Paseo static bundle.

## Release considerations

The existing deployed Edge function accepts the exact APSYNTRA Pages origin and continues to enforce its signed admin checks. Preserve all other CRM authentication, workspace membership, RLS, and deployment workflows. Verify the actual Pages CDN after merge; local build and mocked browser tests do not certify live financial processing or signed CRM operator acceptance.
