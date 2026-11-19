# CP-CRM-NATIVE-ACCESS-FINAL-03 — Charter Intent Review and Signed Acceptance Closeout

**Date:** 2026-11-20 (Asia/Manila)
**Disposition:** PARTIAL / BLOCKED for universal production acceptance. The repeatable review/evidence tooling is verified; no production access grants or role backfills were made.

## Reconciled production evidence

Project: `jtlusodorfnyzgyuewkz`. The existing 36 legacy Charter `Employee` grants were applied November 18, 2026. Read-only production audit trail contains 36 legacy role events plus one separate scoped `user` event. The scoped Charter table has one enabled `user` assignment; **35/36 legacy grant holders have no scoped role**. All 35 are `INTENT_NOT_CONFIRMED`—not permission for silent activation, deletion, or rewriting. The migration establishing the scoped source explicitly excluded historical backfill. Three additional Charter-accessible accounts resolve through other authority paths and are not among the 35 historical candidates.

The authoritative application projection from the prior milestone contains **253 effective user–module combinations across 12 module IDs**, with no effective access/role inconsistencies. That count describes effective contracts, not actual employee browser sessions.

`scripts/cp-crm-native-access-final03-review.sql` generates:

1. One pseudonymous per-account Charter intent review row, with the historical/source role, scoped/current decision, active membership, audit timestamps, and **`INTENT_NOT_CONFIRMED`** or **`EXISTING_SCOPED_DECISION`**; suggested role remains `NULL`, production change always `NOT_APPROVED`.
2. A grouped Charter-specific role change audit provenance report.
3. A JSON expected-acceptance inventory for all 12 effective module types, with SHA-256 pseudonymous account keys matching the signed browser runner.

The existing CRM User Role Management interface already supports single-account and reviewed batch scoped Charter assignment through `apsyntra_role_charter_workspace_set` and preserves legacy labels as **unsupported/not effective**. No duplicate role editor or broad permissions override was introduced.

## Signed browser runtime acceptance

Existing local QA Chromium (`127.0.0.1:9222`) is presently **signed out**. The previous read-only runner reports **BLOCKED** without token/cookie access or login automation. A connected ChatGPT browser tab shows a signed administrative account but does not establish independent employee sessions; it cannot be used to impersonate other accounts. Therefore **0/253** effective combinations have been certified by a new genuine employee-specific final-03 check. Existing prior acceptance remains valid within its earlier scope but does not establish universal access today.

To finish genuine acceptance, each employee must sign into an authorized browser with their own account, and the 02 runner should be executed using their expected module list and SHA-256 account key. Feed its independent JSON results to:

`node scripts/cp-crm-native-access-final03-aggregate.mjs <expected.json> <reports.json>`

The offline aggregator checks exact expected account–module pairs, rejects duplicate/foreign reports, verifies native Board IDs for the four currently instrumented applications, and retains `PENDING_SIGNED_RUNTIME`, `BLOCKED`, or `FAILED` for missing/error evidence. It cannot cryptographically attest browser reports; acceptance evidence must come from the actual tool-controlled, independently signed sessions. The other eight application types still need dedicated browser-domain acceptance contracts; the aggregator intentionally refuses uninstrumented `VERIFIED` claims.

## Gates

| Requirement                                         | Status                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Charter historical/source reconciliation            | VERIFIED                                                            |
| Charter specific intended user list                 | PENDING confirmation                                                |
| Scoped Charter grants or updates                    | NOT STARTED — changes to production roles require separate approval |
| Authoritative effective 12-module matrix            | VERIFIED                                                            |
| Offline acceptance aggregator and regression checks | IMPLEMENTED / VERIFIED                                              |
| Currently signed multi-employee runtime             | BLOCKED — employee sessions unavailable                             |
| All 12 application workflow readbacks               | PENDING; only four have a dedicated browser-contract harness        |
| Final universal signed runtime certification        | BLOCKED                                                             |

## Next implementation

**CP-CRM-NATIVE-ACCESS-FINAL-04 — Approved Charter Role Mapping, Twelve-Application Signed Employee Browser Contracts, and Final Multi-Account Acceptance.** Obtain the intended scoped-role mapping for the 35 historical candidates and explicit approval before any production permission mutation. Reconcile each changed role with authoritative signed readback. Then implement genuine native read/initialization contracts for the other eight applications and collect individual signed employee evidence for every expected user–module combination, with no broad bypasses or unsafe test writes.
