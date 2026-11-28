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

## CP-CRM-CF-01A.2 — dual-origin candidate and continuous preview

The hosted preview was synchronized to validated commit
`c72c69314ed08f32c519b7351e56256f49bf46f4` on Cloudflare version
`eb9042f6-eda7-47be-b67d-a06825847e62`; hosted workflow run 46158134545
passed after a stale-revision mismatch was corrected. Production remains
`ae4f8d6f-fad3-4786-9899-5145b6b71bab` (100%, fetch handler,
compatibility date 2026-11-28, zero bindings).

Before this candidate, all files in the four deployed bundles exactly matched
the corresponding repository files at the above commit. Live JWT verification
was true on native Issues v8, invite v6, accept v6 and manage v5.
Only the two CORS implementations change: exact preview origin added, previous
Pages/override behavior retained, no changes to authentication, SMTP, SQL,
RLS, delivery flags or request handling. Deno tests exercise actual entrypoints
without network or production credentials. No Edge deployment is authorized
by this commit. Recheck live bundle parity before activation and deploy only
the four reviewed functions with verify_jwt=true. Roll back using their exact
previous repository sources if needed; recheck both origins and foreign denial.

Expanded read-only preflight also identified pdl-guest-api and
apsyntra-ws02d-b3-read rejecting the preview. These are outside the four-function
candidate. PDL v13 deployed source differs from the repository source, and
the signed-read entrypoint is not present under the repository functions
directory. Reconcile live sources and actual consumers before separately
approving changes; do not blindly redeploy either.

Continuous preview delivery is implemented as an opt-in GitHub Actions job
after existing static validation and frontend tests. The job downloads the
same run's artifact, skips superseded main revisions, serializes deployment,
targets only apsyntracrm-preview and verifies hosted assets. Do not enable
until a dedicated Cloudflare CI API token is approved and stored as GitHub
secret CF_PREVIEW_API_TOKEN, and the repository variable
CF_PREVIEW_AUTO_DEPLOY is explicitly set to true. Never reuse the interactive
OAuth credential in CI. Production is excluded. Without this provisioning
the new job is intentionally skipped and automatic delivery is not certified.

Production activation also requires a private source/configuration export
and genuine signed browser acceptance. The Cloudflare preview uses the real
Supabase backend, so use only designated controlled QA fixtures for writes.

## CP-CRM-CF-01A.2A — live activation and extended reconciliation

Approved and deployed four functions against the verified candidate blobs at
`d5f1a95e28cfcb7c309c873888076f485dee8850`. Versions after activation:
native Issues 9, invite 7, accept 7, manage 6. All retain verify_jwt=true,
all bundle files exactly matched uploaded source on readback. Each returned
204 with its own exact origin for both Pages and preview, and 403 without
allow-origin for an untrusted origin (12 live preflight checks). No database
records, SQL migrations, secrets or production Worker changes were made.
Rollback source for all four is commit
`c72c69314ed08f32c519b7351e56256f49bf46f4` with prior JWT settings.

Extended reconciliation baseline commit `018cdc4cbd2eb81531d1d372157c261a824d2c17` restores exact
active Paseo v13 and B3 v8 sources from Supabase readback. Paseo's existing
QR canonical URL helper and API prefix correction must remain. B3's
existing workspace-match predicate and apikey CORS header must remain, as
must the existing signed caller's session/membership check. The subsequent
candidate adds only the exact Cloudflare preview origin to the two HTTP
boundaries and to the B3 frontend diagnostic. Existing public guest/auth
and B3 gates stay unchanged. No extended production deployment approved
by this checkpoint. Obtain explicit approval for PDL (verify_jwt=false
as existing) and B3 (verify_jwt=true as existing) after CI; rollback from
the reconciled baseline if necessary. B3 is read-only diagnostics, not
evidence of independent database isolation or mutation acceptance.

The production Worker remains unchanged. Continuous deployment credential
provisioning, private source export, and genuine authenticated runtime
acceptance are still separate outstanding gates.

## CP-CRM-CF-02 — Watchdog account transition

Selected account `521910d64f92c18a0e6e3eb1b2e93c71`; active preview target `https://apsyntracrm-preview.watchdog-521.workers.dev`.
The new production Worker remains untouched (original version
`33de221b-45e0-4a5d-8cf3-99f50d2e3cee`, fetch handler, 100% traffic).
The old account and its existing preview remain untouched. Historical notes above
refer to the previous account and are not instructions for new deployments.
Wrangler now pins both the preview Worker and Watchdog account; CI rejects
account overrides to the old account. Automatic deployment remains disabled
until a new account-specific token `CF_WATCHDOG_PREVIEW_API_TOKEN` and
`CF_WATCHDOG_PREVIEW_AUTO_DEPLOY=true` are explicitly provisioned. No token
reuse or production changes. Supabase origin changes require a separate
reviewed candidate and approval; both old frontend origins remain intact
until retirement is explicitly authorized. The new account initially had TLS
handshake failures; recheck hosted HTTPS after isolated preview deployment.

### Watchdog preview origin candidate

The Watchdog preview was deployed using commit `3930dba48439bfd911f9cc67f7baa3191d5bb4c0`, version
`1be510be-41bb-498b-a55b-8ed906ae1173`. Root HTTPS redirects to the CRM and
the entry returns HTTP 200. Production version remains unchanged. All six
identified functions returned 403 for the new preview origin before activation.
This candidate adds the exact Watchdog preview origin while retaining Pages
and the previous preview during transition; production origins remain excluded.
No production function deployment is authorized by this commit. Reconcile
all live bundles before deployment; the first four were already activated for
the old account, while Paseo and B3 were still awaiting activation. Preserve
existing JWT flags and approve all six candidate bundles explicitly. A separate
Material Sourcing migration manifest failure on c7fb55b remains outside this
scope; the browser runtime files were unchanged from the previously validated
2e0e22a revision until this origin diagnostic change.

## CP-CRM-CF-02A.1 — release pinning and continuous delivery gate

The Watchdog preview release 282e57892bff4d98d9153bce88a0d2063d28ead8
(version 6c111901-3470-42c2-ad36-5e3a0aa9a1df) passed independent hosted
smoke. A dispatch against moving main checked a different revision and failed.
Use the optional release_sha input (40 lowercase hex, reachable from main)
for read-only verification of the actual deployed commit. Automatic delivery
now starts only after successful full APSYNTRA CRM Frontend Validation on
same-repository main, packages the exact completed run's revision, validates
its migration manifest, and skips a superseded revision. Existing static
push validation remains independent. The full frontend path filter includes
all preview packaging inputs. The deployment job remains disabled until
CF_WATCHDOG_PREVIEW_AUTO_DEPLOY=true and a dedicated preview-only Cloudflare
credential CF_WATCHDOG_PREVIEW_API_TOKEN are explicitly provisioned. Do not
reuse OAuth, enable the old account variables or modify production. Provision
an individual Worker Editor token for apsyntracrm-preview where available;
never grant account-wide write access merely to make CI pass. A successful
isolated candidate workflow is not proof of automatic delivery.
