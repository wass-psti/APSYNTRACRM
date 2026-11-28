# CP-CRM-CF-01 — Cloudflare parallel frontend

GitHub Pages remains the current frontend. The separate Cloudflare target is
`apsyntracrm-preview`; no configuration here points at production
`apsyntracrm`. The existing Pages runtime is copied byte-for-byte, rather
than introducing a second bundling strategy. The existing /APSYNTRACRM/
prefix preserves Paseo assets and deep-link recovery. Root redirects are
temporary. Existing CRM hash routes, CSP and Supabase endpoints are retained.
Browser storage is origin-specific; users must sign in separately.

## Build and validation

On GitHub Actions, run the CP-CRM-CF-01 workflow. It validates the committed
browser assets, count and per-file size against the free-plan limits, then
runs Wrangler dry-run and local Workers HTTP smoke checks on the CI runner.
No Cloudflare credentials, deploy, database migrations, model training or
production changes are required for this workflow. It produces a downloadable
static artifact. It does not certify authenticated hosted behavior.

## Hosted preview (after successful CI)

Create or connect a separate Worker named apsyntracrm-preview, never the
existing production service. In Cloudflare Builds select this repository,
main, repository root, build command:

    node scripts/package-cloudflare-assets.mjs

Deploy command (preview service only):

    npx --yes wrangler@4.166.0 deploy --config wrangler.preview.jsonc

Set Node 22 if needed. Do not connect the existing production Worker yet.
Confirm the preview endpoint and verify root redirect, login, session refresh,
workspace/role behavior, app navigation, representative read/write persistence
using authorized QA fixtures, GPS, PDF, uploads, and Paseo routes. Inspect
origin-specific Edge Function CORS and Auth redirect allowlists before any
approved configuration edits. Existing service worker registration is
Pages-only and remains disabled on the preview origin. Cross-origin sessions
and browser-only drafts are not transferred.

## Production gate

Capture existing production version, code, routes, settings, bindings and
rollback reference before proposing production configuration. Compare preview
acceptance and existing production behavior. Explicitly approve cutover and
any credential, permission, Auth redirect or database changes. Keep GitHub
Pages active. Do not deploy production from the preview config. A new
production Wrangler configuration and CI-gated activation are separate work.
Do not claim success based on artifact or dry-run alone.
