# CP-FT-UI-08 — Source onboarding, local staging, and reference-aligned client selection

**Date:** November 23, 2026
**Repository:** `wass-psti/APSYNTRACRM`
**Base:** `37a350a` (CP-FT-UI-07, PR #800)
**Overall outcome:** **PARTIAL — functional enhancements verified; canonical source ingestion and genuine two-account CRM-host certification blocked by external prerequisites.**

## Independent source and architecture review

The user's 19 FuelTrans screenshot references illustrate a four-client ticket wizard, ticket queues, incident details, L1/handover/analytics/issue reporting, and a populated Station Manager. They are **not** a signed, current inventory of all stations or evidence of authorization to import station credentials.

- Fresh read-only inspection of connected production Supabase project `jtlusodorfnyzgyuewkz` found **zero public tables whose names include station or registry** (November 23, 2026). The existing `fueltrans_tickets` source remains separate.
- The previously reviewed local FuelTrans documents contain Station Manager descriptions, not a maintained 48-row source. The available authorized project folders did not yield an owner-verified CSV/XLSX/JSON inventory.
- The CP-FT-UI-07 integration test already exercised real GoTrue and PostgREST accounts, **but emulated the CRM host API**. This distinction remains material. There is no verified full CRM-host environment with two independent disposable users and actual host login under this task.

**Decision:** Implement safe, useful source onboarding and exact-source local staging, plus improve reference-inspired client selection. Do **not** invent 48 stations, passwords, rosters, ticket counts, or a production station table. Do not weaken existing RLS or add unrelated authorization restrictions.

## Implemented

### A. Owner-review evidence handoff

New `frontend/fueltrans/station-owner-review08.js` and revised Recorded Stations UI:

- From a validated local CSV, retain the existing CP-FT-UI-07 SHA-256 fingerprint that covers **only** client, station ID, and station name.
- Capture a *proposed* data owner, source reference, source revision/date, and optional approval reference.
- Export `fueltrans-station-owner-review-page-N.json`, status `AWAITING_INDEPENDENT_OWNER_CONFIRMATION`, `authorityVerified: false`, `registryActivated: false`, `sourceImported: false`.
- Whitelist copied fields (fingerprint, aggregate row totals, visible-ticket-page comparison) so unknown source columns or unexpected metadata cannot hitchhike into the owner packet.
- Independent confirmation of the named source's ownership and specific metadata fingerprint **remains required**. Typed claims cannot self-certify the source or cause a database write.

### B. Local-only normalized station staging

New `frontend/fueltrans/station-staging08.js` and the **Download sanitized staging JSON (not imported)** action:

- Reparse the original local CSV and require **zero validation errors** and at least one candidate.
- Recompute metadata SHA-256 and require a match to the owner-review packet's digest and recorded row totals.
- Export sorted, deterministic `{client,stationId,stationName}` entries and source-owner claims, explicitly labeled `STAGED_NOT_IMPORTED_NOT_VERIFIED`.
- Reject changed/mismatching CSV content, conflicting station names, missing owner packets and misleading status claims.
- Exclude AnyDesk/remote credentials, unknown columns, tickets and private records. Never upload to Supabase, change live tables, add background agents or authorize a registry.
- Repeat imports of the same metadata produce the same normalized rows irrespective of CSV order or ignored password-column contents.

### C. Image-2 client/location visual fidelity

- Reference-inspired **four selectable client organization cards** (UNIOIL / ARAMCO / REPHIL / PETRON), with neutral default state, distinct selected highlight and responsive 2-column mobile layout.
- The cards synchronize with the unchanged native select and five-stage Create Ticket workflow. Selecting or restoring draft values keeps visual state synchronized; existing scoped membership behavior is preserved.
- Names, logos, station IDs and deployment credentials are **not** inferred from screenshots or synthetic data.

## Acceptance and evidence

| Check | Result |
|---|---|
| Locked npm install | PASS |
| Full repository suite | **3,488/3,488 PASS** |
| Owner packet and staging unit tests | PASS |
| Synthetic Chromium create-stage card selection, dropdown sync, station CSV comparison, owner packet/staging downloads, invalid CSV denial | PASS |
| Desktop/tablet/mobile widths 1200/768/540/390 | PASS — no page-wide horizontal overflow |
| Build, full lint, targeted ESLint, syntax/check, diff | PASS |
| Genuine disposable GoTrue + PostgREST using native FuelTrans Chromium browser UI: reporter create → L1 claim/escalation → L2 claim/resolve → reporter readback, cross-client denial | PASS |
| No residual CP-FT-UI-06 disposable Docker resources | PASS |
| Real independent CRM **host** login/browser acceptance | **PENDING** — prior test still uses an emulated host adapter |
| Source ownership independently approved | **BLOCKED** — no canonical owner-verified station source |
| Server-side canonical station registry import/activation | **NOT IMPLEMENTED** — must not activate unverified input |
| Exact 19-screen production reference parity | **PENDING** — incomplete source and session coverage |

## Reference screens: specific remaining dependencies

| Screens | Existing verified or inspected behavior | Open for final fidelity |
|---|---|---|
| 1 Dashboard | Native dashboard metrics and recent tickets | Screenshot's historical 108 resolved/1 active values not verified against source |
| 2 Client & Location | Four source client cards, existing station fields & ticket-history lookup | Real logo assets and approved station-directory lookup |
| 3–6 Create Ticket | Original five-stage validated form, new client choice, drafts/evidence/review | Reference presents three visual steps; source-specific data and exact layout not pixel-certified |
| 7–12 Queue & Details | Search, filter, ticket lifecycle, side-by-side details, local backend integration | Source ticket history, private credentials/deployment and complete audit/evidence parity |
| 13 Global L1 | Genuine isolated L1 claim and escalation UI | Genuine CRM host two-account acceptance and source engineer roster |
| 14–15 Shift Handover | Shift/handover UI | Authoritative six-person roster and shifts |
| 16 Station Manager | Existing Recorded Stations and new metadata owner-review/staging | Owner-signed 48-station master, server contract and deployment/access data |
| 17 Analytics | Existing analytics/report views | Complete source-based metrics and tab parity |
| 18–19 Report Issue | Existing issue reporting functionality | Full reference-specific submission/evidence parity and certified CRM host flows |

## Release procedure

1. Commit/PR under `feat/fueltrans-ui08-20261123`; await all GitHub branch CI checks.
2. Merge only after green branch CI; require successful main CI and Pages deployment.
3. Read-only signed-in production smoke of the deployed Recorded Stations and Create Ticket UI, if available; **do not create a production ticket**.
4. Publish checked acceptance statuses; never equate Docker/CI success with production multi-user acceptance.

## Next dependency-limited implementation

**CP-FT-UI-09 — Independent Station Owner Approval and Verified Registry Import, Genuine CRM-Host Two-Account Acceptance, and Remaining 19-Screen Parity.**

Requires (a) approved canonical station CSV/API/export, stable client+site IDs and verifiable owner approval for the exact metadata hash; (b) disposable full CRM-host environment and two independent real users, not merely a native-module host test double; and (c) original operational source material for proprietary station/AnyDesk, shift and ticket history fields. Only then implement a reversible, idempotent, source-scope-limited server registry migration/import, end-to-end host acceptance and final pixel/functional comparison.

**Strict inference-only constraint:** No gradient descent, backpropagation, model training/retraining/fine-tuning, weight-update loop, or training dependency introduced or run.
