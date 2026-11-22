# CP-PDL-BOOKING-AVAILABILITY-05 — Production Acceptance Record

**Date:** 22 November 2026 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Production project:** `jtlusodorfnyzgyuewkz` (existing shared Supabase project)
**Production portal:** `https://wass-psti.github.io/APSYNTRACRM/paseo/`

## Scope and implementation

CP05 adds a controlled production acceptance runner at `scripts/cp-pdl-booking-availability-05-production-acceptance.mjs` and its regression contract at `frontend/tests/cp-pdl-booking-availability-05-contract.test.mjs`.

The runner has two distinct modes:

1. **Default read-only preflight.** Checks the existing production API health, all three configured manual payment methods and their actual QR image objects, all nine future-date court/duration availability combinations, and all nine same-day past-start exclusions. It does not create quotes, reservations, customers, payment-proof objects, payment decisions, cancellations or refunds.
2. **Explicit one-time production submission.** Requires `--submit-production`, a designated court/date/start/duration, customer details, a genuine payment-proof file, the transaction reference, a stable UUID idempotency key, explicit human confirmation that the proof was visually reviewed, and exact confirmation of the server-quoted PHP amount and configured payment recipient. It verifies live availability and a fresh server quote before the first POST. It never automatically retries an uncertain first submission.

After a known successful first submission, the runner independently calls the live receipt endpoint using the returned receipt token, compares every persisted booking/payment field, then repeats the exact same request with the same idempotency key to verify the original reservation is returned without duplication. It performs a second independent receipt readback after the replay. Receipt tokens and proof bytes are never printed.

The runner does not mark payments verified, cancel reservations, initiate refunds, modify rates, change recipients, or bypass the existing proof-storage and payment-review workflow.

### Controlled submission command template

The following is a template only. It must not be run until a real payment has already been made, its receipt has been visually reconciled against the selected quote and recipient, and the designated test booking details are known. Replace every placeholder with the actual values; do not use sample or fabricated payment evidence.

```sh
node scripts/cp-pdl-booking-availability-05-production-acceptance.mjs \
  --submit-production \
  --confirm-proof-reviewed \
  --court-id <court-1-or-court-2-or-court-3> \
  --date <YYYY-MM-DD> \
  --start-minute <venue-local-minute-after-midnight> \
  --duration-minutes <60-or-90-or-120> \
  --payment-method <gcash-or-maya-or-bpi> \
  --full-name <actual-test-customer-name> \
  --email <actual-test-customer-email> \
  --phone <actual-test-customer-phone> \
  --transaction-reference <reference-from-the-genuine-payment> \
  --proof <absolute-path-to-genuine-payment-receipt> \
  --idempotency-key <stable-uuid-retained-for-reconciliation> \
  --confirm-amount-minor <server-quoted-PHP-amount-in-centavos> \
  --confirm-recipient <exact-configured-recipient-name>
```

The script will perform a fresh production availability and quote check before the first reservation POST. After a known success it reads the receipt independently and then checks a same-key replay. It does not automatically retry an uncertain submission. In an uncertain outcome, reconcile the administrator reservation queue using the same idempotency key before doing anything else.

## Production read-only evidence

The CP05 read-only preflight completed successfully:

- Production guest API health: **PASS**; existing shared project confirmed.
- Manual payment methods: **3/3** configured (GCash, Maya and BPI).
- Private QR image readback through the existing public image endpoints: **3/3** HTTP 200 with image content.
- Future-date availability: **9/9** court/duration combinations server-backed and bookable.
- Same-day availability: **9/9** combinations excluded all start times at or before the current Asia/Manila minute.
- Venue date at test time: `2026-11-22`; Manila minute: `1433`; future availability date: `2026-11-23`.
- No quote, reservation, customer, proof object, payment verification, cancellation or refund was created by the preflight.

The existing signed production administrator page independently displayed **0 reservations**, **0 awaiting review**, and **0 payments verified**. This confirms the empty production queue at the time of this readback. Existing live court settings showed three enabled courts and nine configured rates: PHP 150 / 225 / 300 for 60 / 90 / 120 minutes.

The production health response reports `paymentsLive: false`. The existing implementation uses manual QR payment methods and genuine receipt uploads; it is not an automated payment-processor integration. The three QR assets are readable, but QR availability is not proof of a completed transfer.

## Production submission status and blocker

**NOT SUBMITTED.** No genuine payment receipt file or transaction reference was designated in this execution, and no venue-approved complimentary/no-payment procedure was found in the available project records. The previously recorded operational instruction designates Alex P. Señagan as the only rate configurator; CP05 did not modify the rate matrix or payment recipients.

The production runner is prepared, but a genuine booking cannot be submitted responsibly until a specific test slot/customer and genuine payment evidence (or an already approved complimentary booking procedure) are supplied. A file-signature check confirms only that the file is a structurally plausible JPG, PNG or PDF; it cannot independently establish payment authenticity or settlement. The amount, recipient, transaction reference and transfer must be reconciled by the venue.

No fake proof, synthetic payment, new customer, production reservation, database migration, production rate change, recipient change, authorization change or new Supabase project was created.

## Idempotency, receipt and reconciliation boundaries

- Existing PostgreSQL CP04/CP07 rollback acceptance remains the evidence for quote → reservation → receipt, same-key replay, changed-payload conflict, schedule conflict, cancellation/payment invariants and rollback. Those tests are not misrepresented as live production writes.
- CP05 runner tests verify the exact production request/readback contract, strict receipt field equality, explicit one-time submission, stable idempotency key, no automatic retry after uncertain outcome, and same-key replay only after a known successful response.
- A live production receipt cannot be independently retrieved without a real reservation ID and receipt access token returned by an actual successful submission.
- Administrator payment verification, cancellation and financial reconciliation remain manual operations. No automatic refund is claimed or attempted.

## Inference-only / no-training compliance

This checkpoint introduces no model, machine-learning dependency, gradient-descent algorithm, backpropagation, optimizer, training/retraining/fine-tuning loop, weight update, training process or training-related execution path. The acceptance runner is deterministic request/response and file-signature validation code. No inference model or model parameter is changed. No package dependency was added.

## Verification summary

| Acceptance                                                    | Result                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Production API health                                         | PASS                                                              |
| 3/3 configured payment methods and QR image readback          | PASS                                                              |
| 9/9 future availability combinations                          | PASS                                                              |
| 9/9 same-day past-slot exclusions                             | PASS                                                              |
| Existing signed production reservation queue readback         | PASS — 0 records                                                  |
| Production reservation submission                             | PENDING — genuine evidence / approved no-payment procedure absent |
| Independent live receipt readback                             | PENDING — requires successful production reservation              |
| Live same-key idempotency replay                              | PENDING — requires successful production reservation              |
| Administrator reconciliation                                  | PENDING — requires designated test reservation                    |
| Machine-learning/training dependency and execution-path audit | PASS — none introduced                                            |

**Final classification:** `IMPLEMENTED-UNVERIFIED` for the controlled live-submission runner; `VERIFIED` for production read-only preflight and existing signed empty-queue readback; `PENDING` for genuine production reservation, independent live receipt retrieval, idempotent replay and administrator reconciliation. CP05 is not certified as complete until those production-write gates are evidenced.
