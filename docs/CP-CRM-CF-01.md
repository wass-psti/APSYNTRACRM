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

    node scripts/deploy-cloudflare-preview.mjs

The standard root wrangler.jsonc is named for the separate preview. The deploy
script rejects a mismatched WRANGLER_CI_OVERRIDE_NAME before invoking Wrangler.
Cloudflare Builds can override the configured name, so always verify the selected
Worker in the dashboard. Disable non-production branch builds for this initial
acceptance to avoid unreviewed additional preview deployments.
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

## CP-CRM-CF-01A hosted acceptance and rollback record

Observed November 28, 2026: production Worker `apsyntracrm` has a Dashboard
manual deployment, displayed version prefix `ae4f8d6f`, created 14:46:44 UTC,
no bindings, no custom domains or routes, Logs enabled, Traces disabled.
Its public root returned HTTP 200 plain text `Hello World!`. The proposed
preview host returned 404 / Cloudflare error 1042. Pages returned HTTP 200 HTML.
These are observations, not a full export of Worker configuration.
Before production activation obtain the full version identifier and review
code, variables (names only), compatibility flags, routes and Git settings;
retain the original code/configuration and rollback target. Do not rely on
indefinite version retention. No production changes authorized by this checkpoint.

After the separate preview deploys, run the Cloudflare validation workflow
manually on main with hosted_smoke=true. Match the Cloudflare build commit to
the GitHub run commit. It compares the actual public HTTPS responses for the
CRM and Paseo entry points, representative modules, vendor engines, stylesheet
and recovery assets to the checkout. An absent preview or different bytes fails
the hosted gate; no credentials or writes are used by this check.
Then conduct genuine signed browser acceptance with authorized test accounts
and fixtures: login, refresh and logout, workspace switching, representative
native app reads/writes and reload, uploads/downloads, PDF/export, GPS and Paseo
deep-link recovery. Confirm old Pages remains operational and compare CORS and
Auth callback behavior without changing it preemptively.
