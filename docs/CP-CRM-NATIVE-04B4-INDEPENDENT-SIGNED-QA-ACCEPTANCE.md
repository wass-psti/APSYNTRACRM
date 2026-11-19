# CP-CRM-NATIVE-04B4 — Independent Signed QA Actor and Production Transaction Acceptance

**Date:** 2026-11-19 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase:** Existing project `jtlusodorfnyzgyuewkz`
**Milestone status:** VERIFIED for read-only preflight implementation and isolated signed-subject guardrail tests. **BLOCKED** for real production business writes and transaction readback.

## What is genuinely verified

Previous phases already verified:

- CP-CRM-NATIVE-04A: four synthetic PostgreSQL domain workflows and durable data readback.
- CP-CRM-NATIVE-04B: genuine signed employee read-only navigation to TimeTracker, Fund Tracker, FuelTrack+ and TradeLink, 4/4 PASS.
- CP-CRM-NATIVE-04B1: durable TradeLink transaction persisted in disposable PostgreSQL session A and independently read by synthetic sessions B and C, including foreign-workspace denial.
- CP-CRM-NATIVE-04B3: current FRT General Managers have existing approval, liquidation and closure capabilities without new Finance Manager or Finance Approver roles.

**Live inventory on 2026-11-19:** the historical `FRT-ACCEPTANCE-QA-v0.5.0` workspace exists, with **0 total members**, **0 active members**, and **0 active QA-labeled CRM profiles** under the observed label screening. The authorized Mac has **one** active CDP endpoint `127.0.0.1:9225`, and no independent browser endpoint at ports `9226` or `9227`. An authenticated APSYNTRA employee session exists, but must not be silently repurposed as a QA writer or reviewer.

These facts do **not** authorize creating accounts, changing memberships, or generating payroll, financial, fuel or customer document records.

## Implemented: two-or-more genuine signed browser sessions (read-only)

```bash
node scripts/cp-crm-native04b4-independent-session-preflight.mjs \
  --manifest=/path/to/private-approved-qa-plan.json \
  --session=tradeAuthor:http://127.0.0.1:9225 \
  --session=tradePrimaryReviewer:http://127.0.0.1:9226 \
  --session=tradeSecondaryReviewer:http://127.0.0.1:9227
```

This is an **example**, not a claim that the ports or accounts exist. The private plan must pass the already delivered `cp-crm-native04b1-qa-manifest.mjs` validator. Separate Chromium instances must already be authenticated as the explicitly designated QA participants. The runner never signs in for them, creates a profile, grants a role, touches credentials, or obtains bearer tokens.

For each existing signed profile, it observes the application's normal **HTTP 200 Supabase Auth `/auth/v1/user`** response and compares the response user UUID **in memory only** to the corresponding private QA plan actor. It verifies that the frontend startup is `AUTHENTICATED`, the secure session is visible, and that the expected native application route loads without failed requests or JavaScript errors. It restores each existing tab's previous URL.

The runner requires at least two different localhost CDP ports, two distinct user subjects and separate actor roles. Reused ports, one signed subject repeated for two roles, unrecognized actors, incorrect routes, unsigned/unauthorized sessions or unexpected errors are **BLOCKED**. It logs only status, issue categories, counts and absent-evidence markers—**never** emails, subject UUIDs, Auth response payloads, cookies, tokens, or business record contents.

**Important scope boundary:** This test confirms distinct previously authenticated subjects matching a private designation plan. It does **not** verify that the browser profile has all actual domain roles, inspect business source rows, create documents, issue financial or physical transactions, or certify cross-session business transaction readback. In particular, `INDEPENDENT_SIGNED_IDENTITIES_VERIFIED` must never be interpreted as permission to execute production writes.

### Verification

- Six dedicated automated tests cover matching independent sessions, duplicate subject/port denial, unavailable/unsigned/foreign actor denial, duplicate role rejection, mandatory private plan and localhost ports, and no-business-write behavior.
- Local runtime: CDP `9225` reachable, `9226` and `9227` unavailable. CLI without an approved manifest exits code **2 / BLOCKED**. This is an expected, correct result and does not indicate CRM runtime failure.
- Existing four-app signed read-only preflight is retained and can be executed without changing production records.

## Required operational acceptance plan (not yet approved)

| Application  | Required independent signed subjects                                                                        | Controlled test transaction                                                                                                                          | Completion evidence                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TimeTracker  | Designated QA employee; separate authorized viewer as needed                                                | Approved clock-in with legitimate GPS and clock-out, duplicate prevention                                                                            | Source attendance row, associated existing Board item, immutable audit, independent-session My Hours after refresh                  |
| Fund Tracker | Designated requester and two independent General Managers already entitled to review, no new roles presumed | Explicitly authorized nonfinancial test-only request, finance review, simulated transfer with no actual bank movement, receipt liquidation and close | Exact source row, DV projection, immutable audit, independent GM readback; verify all actions are allowed by current business state |
| FuelTrack+   | Designated User and existing Admin                                                                          | QA-labeled request/approval/closed workflow with no physical refueling                                                                               | Source request, Board link, receipt metadata, audit and independent signed readback                                                 |
| TradeLink    | Designated writer and two distinct assigned reviewers                                                       | QA-labeled document create → For Approval → first and second review → Approved → PDF                                                                 | Source document, revision, audit and assigned-document readback in genuinely independent signed browser profiles                    |

No live writes may be performed until the operator designates the specific accounts, company/workspace, acceptance record identifiers, notifications and audit retention behavior, including consent for actual attendance recording and any external side effects. Avoid real bank transfers, fabricated physical fuel, customer notifications and silent modification of legitimate company records.

All existing application Auth, roles, workspace isolation and RLS remain unchanged. No new Supabase project is needed.

## Final disposition and practical next step

**VERIFIED:** Live read-only QA inventory, runnable genuine independent-subject preflight, no-write contract tests, previously established disposable four-domain acceptance.

**BLOCKED:** QA account and test-record designations; independently authenticated reviewer profiles; real signed production transaction write and cross-session persisted source/Board/audit readback; final operational certification.

Once the operator supplies _approved_ private actor/record information and opens the separate genuine signed browser sessions, use the new preflight. Then, with separately authorized bounded production transaction scope, perform the four live business workflow checks and reconcile all created records.

**Do not introduce another planning-only milestone as a substitute for the required QA account and transaction designation.** The next action is the unresolved acceptance prerequisite, not more roles or RLS changes.
