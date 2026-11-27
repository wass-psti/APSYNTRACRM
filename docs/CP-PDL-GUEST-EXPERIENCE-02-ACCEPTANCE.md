# CP-PDL-GUEST-EXPERIENCE-02 — Acceptance Record

## Objective

Verify the existing Paseo guest API through a dedicated disposable local Supabase stack. Exercise the actual Edge Function, PostgreSQL RPCs, private Storage, and browser-to-API proxy without creating hosted-project records.

## Implementation

- Reuse the existing PDL guest Edge Function and ordered migrations.
- Start a unique local Supabase project on non-default ports, without linking a hosted project.
- Seed synthetic local court hours, rates, payment recipients, and QR images.
- Exercise availability, server quotation, multipart evidence intake, receipt readback, idempotent retry, conflict handling, and proof-object integrity over HTTP.
- Retrieve the receipt in a separate Chromium context through the Vite API proxy.
- Run the Paseo unit suite, TypeScript typecheck, and production build.
- Stop and remove the unique disposable project and temporary credentials/results.

## Acceptance criteria

| Area | Required result |
|---|---|
| API health | HTTP 200 from local guest API |
| Payment methods | GCash, Maya, BPI returned |
| QR images | 3/3 synthetic private images retrieved |
| Future availability | 9/9 court/duration combinations server-backed |
| Same-day availability | No past available slots |
| Server quote | 90-minute test quote is PHP 225.00 |
| Reservation submission | HTTP 201; pending_verification/submitted |
| Proof persistence | Exact synthetic PDF bytes retrieved from private Storage |
| Receipt | Independent API and browser readback match |
| Same-key retry | HTTP 200, replayed=true, same reservation ID |
| Changed payload/same key | HTTP 409 |
| Overlap | Conflicting quote rejected |
| Invalid evidence | Rejected before reservation persistence |
| Database cardinality | Exactly one row for successful idempotency key |
| Payment state | Remains pending_verification/submitted |
| Browser | React app and proxied API load without page errors |
| Frontend tests | Full Paseo Vitest suite passes |
| TypeScript | Typecheck passes |
| Build | Production build succeeds |
| Cleanup | Unique local project stopped and removed |

## Execution

From the repository root:

    bash scripts/pdl-cp02-local-acceptance.sh

Requirements: Docker, Supabase CLI 2.121.0 or compatible, PostgreSQL client, Node.js 22, npm, and Playwright Chromium.

For local diagnosis, set PDL_CP02_KEEP_ENV=1 to retain temporary logs and files. The runner still stops its unique Supabase project.

## Scope boundaries

No hosted Supabase project is created, linked, migrated, or modified. No production booking, payment, QR recipient, or payment verification is changed. No new role, permission, authorization model, or security gate is introduced. No gradient descent, backpropagation, training, fine-tuning, weight updates, or training dependencies are introduced.

## Verification status

<badge color="success">VERIFIED — GitHub Actions</badge>

**CP02 workflow:** PASS
- Push run: https://github.com/wass-psti/APSYNTRACRM/actions/runs/45094170535
- Pull-request run: https://github.com/wass-psti/APSYNTRACRM/actions/runs/45094175910
- Tested branch commit: cae007b4a81b207f003cd70eaf42f5955a076e96

**Actual disposable integration evidence:**
- All 12 existing PDL migrations applied to a new local Supabase project with unique project ID and non-default ports.
- 3/3 synthetic QR assets uploaded and independently retrieved.
- 9/9 future availability combinations and 9/9 same-day availability checks passed.
- Server-generated quote returned the expected PHP 225.00 for the 90-minute fixture.
- Actual multipart submission returned HTTP 201 and persisted one reservation.
- Independent receipt readback returned the persisted reservation.
- Same-key retry returned the original reservation; changed payload returned HTTP 409.
- Overlapping quote rejected; invalid receipt token returned HTTP 404.
- Invalid evidence was rejected and created no reservation.
- Private Storage readback matched the exact submitted synthetic PDF bytes.
- Database count was exactly one for the successful idempotency key; state remained pending_verification/submitted.
- Chromium loaded the frontend, accessed the local API proxy, retrieved the receipt and all three QR images, and recorded zero uncaught page errors.
- Paseo Vitest: 15 test files, 78/78 tests passed.
- TypeScript typecheck: PASS.
- Production build: PASS.

**Additional existing regression workflow:** Paseo Native CRM Integration Acceptance PASS, including CP04 hour-first duration/booking-review browser acceptance and public/CRM browser isolation.

**Warnings (non-blocking):** Existing Vite pages-restore script bundling warning, existing Zod Rollup annotation warnings, Supabase CLI inbucket deprecation notice, and GitHub Actions Node 20 deprecation notice. No acceptance step failed.

**Cleanup and scope:** The disposable Supabase stop/cleanup trap ran as part of the successful job. The GitHub runner was ephemeral. No hosted Supabase project, production reservation, payment, QR recipient, or payment verification was modified. No gradient descent, backpropagation, training, fine-tuning, model-weight updates, or training dependency was introduced.

The implementation is verified on the CP02 branch. PR #786 remains draft and unmerged; no production deployment was performed.
