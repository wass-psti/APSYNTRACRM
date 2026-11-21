# PDL-APS-NATIVE-01 — Native Paseo Booking in APSYNTRA CRM

Date: 2026-11-21
Status: **LOCAL IMPLEMENTATION VERIFIED, LIVE CRM PUBLICATION PENDING CI/PAGES; FINANCIAL ACCEPTANCE BLOCKED ON VENUE APPROVAL**.
Target repository: `wass-psti/APSYNTRACRM` (existing public Pages repository).
Supabase: existing project `jtlusodorfnyzgyuewkz`; dedicated schema `pdl_booking`; Edge `pdl-guest-api` v10.

## Architecture and routing

| Entry | Path | Authentication and data |
| --- | --- | --- |
| Public booking | `/APSYNTRACRM/paseo/` and browser routes | Separate React HTML/JS; guest API only, no CRM SDK, workspace state or login requirement |
| Signed CRM module | `#/paseo` within `/APSYNTRACRM/` | Existing CRM session; native read-only overview from Paseo API when the user is already an assigned Paseo administrator |
| Full booking operations | `/APSYNTRACRM/paseo/admin/sign-in`, `/admin/live-reservations` | Existing Paseo Auth sign-in; verified through Supabase Auth **and** `pdl_booking.admin_users` before data access/write |
| Other CRM modules | Unchanged existing `#/...` routes | Existing CRM authentication, workspace scoping and backend authorization untouched |

The native module is a standalone application entry without a synthetic board ID, role assignment or workspace duplication. All public and administrative reservation operations use the **same** `pdl_booking` tables and backend. The public UI and CRM console do not copy or synchronize booking records into a second table.

The two entry points are separate app documents but currently share the same GitHub Pages **web origin**. This is not an origin-level security boundary; stronger browser-storage isolation would require a separately approved booking hostname. All authoritative customer/CRM data access remains enforced at the backend; public client JavaScript must not be mistaken for an authorization boundary.

## Implemented components

- CRM sidebar registration `PASEO_APPLICATION` via `frontend/apps/Paseo/manifest.js`; signed route `#/paseo` with optional read-only booking snapshot. Expired/logout sessions clear the local preview, and requests verify current session identity before updating the UI.
- `frontend/apps/Paseo/native-admin.js` makes only GET requests, uses the current CRM Supabase JWT in a Bearer header, and exposes data only after the existing signed Paseo admin session responds successfully. No new CRM role, RLS policy or permission is granted; unauthorized CRM accounts see no booking records.
- A fully buildable, locked Paseo React/Vite app is stored in `frontend/apps/Paseo/source`. The checked-in public release assets are in `paseo/` and are generated using `npm run build:pdl`.
- The published public bundle does **not** include the legacy static GCash/Maya/BPI QR images or recipient labels. Connected public payment methods and images are retrieved solely through the existing backend. There are no service-role secrets in frontend assets.
- The demo-only administrator routes of the embedded app redirect to the real Paseo sign-in. Existing live admin queue, signed backend proofs/decisions and rates/calendar administration remain available after a genuinely authorized Paseo login.
- A root `404.html` plus dedicated path-preserving `pages-redirect.js` and `pages-restore.js` provide direct GitHub Pages browser routes, including receipt-link fragments; unrelated CRM routes are not redirected.
- Dedicated backend source copies under `supabase/pdl-booking/source/` document the active Edge and previously applied isolated migrations. They are **not added to** CRM's auto-executed migration directory and must not be replayed.
- Scoped CI workflow `.github/workflows/pdl-aps-native-01.yml` independently builds the locked Paseo source, compares generated public assets, runs CRM tests and browser access/route regressions. Existing CRM Pages and CI workflows remain untouched.

## Production API readiness (verified 2026-11-21)

Deployed only an exact allowed-origin addition to existing `pdl-guest-api` **v10** for `https://wass-psti.github.io`. The v9 source comparison showed only that addition. Existing public guest routes retain unauthenticated access; staff still need a valid Supabase Auth user **and** Paseo admin membership.

| Read-only actual HTTP check | Expected | Observed |
| --- | --- | --- |
| APSYNTRA Pages origin public health | 200 | PASS 200 |
| Existing localhost origin health | 200 | PASS 200 |
| Unknown origin | 403 | PASS 403 |
| Unsigned Pages admin courts | 401 | PASS 401 |
| Unsigned Pages admin reservations | 401 | PASS 401 |
| Disabled inventory availability | 422 | PASS 422 |
| Existing general API readiness checks | 7 checks | PASS 7/7 |

No tables, accounts, ACL/RLS policies, QR beneficiaries, court rates, reservations or payment records changed.

## Local test evidence

- Public/CRM static browser isolation, direct booking links and refresh, early/late slots across 390/768/1440 pixels, live-admin sign-in fallback, receipt fragment preservation, unsigned CRM login: PASS.
- Native module unit tests: six focused checks PASS (unsigned admin denial, existing signed read, independent public document and routing).
- Embedded Paseo source TypeScript and production Vite build: PASS; generated public bundle omits legacy financial QR images.
- APSYNTRA CRM Vite build, JS syntax and public-source guard: PASS.
- Full existing CRM regression and CI checks are recorded separately after execution; no inference from source-only tests.

## Outstanding acceptance

- Actual GitHub Pages publication and independent CDN browser refresh/readback must be checked after merging the PR into main. A feature-branch build does not prove a Pages deployment.
- Genuine signed CRM operator readback against an assigned Paseo admin account (and subsequent signed changes via existing booking admin portal) requires two real user sessions; synthetic tests do not qualify.
- Live payable booking creation remains **BLOCKED** on authentic venue-approved prices, confirmed QR beneficiary and settlement evidence. Current production has zero enabled courts/rates and is intentionally non-payable.
- Public and CRM documents share one web origin; if stronger browser-side tenant isolation is required, plan a separate booking hostname before accepting sensitive production payment flows.

**Follow-up if live verification or genuine financial acceptance is blocked:** `PDL-APS-NATIVE-02 — Signed CRM Administrator End-to-End Acceptance, Public Booking Persistence/Readback and Financial Release Gate`, after approved accounts and venue financial configuration are available.
