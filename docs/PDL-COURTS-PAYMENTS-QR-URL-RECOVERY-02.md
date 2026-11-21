# PDL-COURTS-PAYMENTS-QR-URL-RECOVERY-02 — Fix saved QR image delivery

## Reported regression

After successful saves, GCash, Maya and BPI cards displayed **QR image unavailable**. The save/readback contract verified a nonempty image URL, not that a browser could actually load the returned URL.

## Verified root cause (2026-11-22)

- The existing public `GET /v1/payment-methods` returned **HTTP URLs using an internal Edge runtime pathname** such as `http://<host>/pdl-guest-api/v1/payment-methods/gcash/image`, rather than the actual public HTTPS function prefix.
- Direct public requests to the canonical endpoint `/functions/v1/pdl-guest-api/v1/payment-methods/{method}/image` returned HTTP 200 and JPEG content for all three methods. Payload sizes were GCash **253,538 B**, Maya **85,576 B**, BPI **82,723 B**.
- Headless Chromium running from the HTTPS public Paseo site successfully loaded the three canonical images, with natural dimensions **827×1591**, **1125×1317**, and **1125×1241** respectively.
- The original QR files are therefore present and readable. Re-uploading cannot repair the malformed metadata URL.

## Focused fix

- Added a single shared `resolveManagedQrImageUrl` helper that **ignores the malformed metadata host/path**, but only when the response indicates a configured image; it constructs the public URL from the existing configured API base and known GCash/Maya/BPI endpoint.
- Updated both the administrator Payments module and the guest QR payment view to use the same canonical URL.
- Preserved the metadata's null/not-configured semantics, the current upload and save/readback flow, the fallback for genuinely unavailable images, and the existing authorization boundaries.
- No stored QR images, recipients, payments, prices, authorization policies or database rows were changed. No new dependencies or changes to the Edge backend deployment.

## Acceptance

- Existing isolated Chromium browser suite: all workflows PASS, including a fixture that deliberately returns malformed HTTP QR metadata and confirms all three canonical HTTPS images load with nonzero natural dimensions.
- Direct production browser GET/image validation: all three QR assets load successfully from canonical paths.
- Existing broken-asset fallback, replacement preview, and write/readback regression checks retained.
- Native production build, full CRM tests and relevant GitHub release checks must pass before merge/deploy.

## Limitation

The Edge API still emits legacy internal URLs in its raw metadata. This targeted frontend fix corrects both existing first-party surfaces without a production Edge function deployment; third-party consumers of that metadata must use the documented canonical URL or a separately reviewed Edge API correction.
