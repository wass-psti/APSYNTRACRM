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

This record documents implementation and criteria. Actual pass/fail evidence must be recorded from local or CI execution; a configured workflow or successful build alone is not end-to-end acceptance.
