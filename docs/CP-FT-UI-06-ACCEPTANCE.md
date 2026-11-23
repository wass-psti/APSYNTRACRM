# CP-FT-UI-06 — Real GoTrue/PostgREST Two-Session Acceptance and Station Source Readiness

**Date:** November 23, 2026
**Repository:** `wass-psti/APSYNTRACRM`
**Base:** `eed84d8` (includes CP-FT-UI-05 merge `564181cf` and subsequent CRM auth-continuity changes)
**Scope:** Test-only infrastructure and evidence; no production schema, frontend feature, permission, role, credential, or customer-ticket changes.

## Recommendation and evidence

The prior CP-FT-UI-05 test verified PostgreSQL RLS using transaction-local, simulated authenticated identity claims. CP-FT-UI-06 advances this contract to **actual GoTrue email/password logins and real PostgREST JWT authentication** against the original FuelTrans SQL migrations and the current `buildSourceTicketRecord`/`buildChange` frontend domain functions.

An owner-approved station source is still unavailable:
- Read-only production Supabase schema query on `jtlusodorfnyzgyuewkz`: **zero public station/registry tables**, with the existing `fueltrans_tickets` table present.
- Targeted searches of authorized MacBook Downloads/Documents and previous FuelTrans/WatchdogWorkspace source: no authoritative station CSV/XLSX/JSON or approved API.
- Both previously identified `Fueltrans Technical Support Portal.docx` copies were inspected at the document-structure level. Both contain one five-row table and a Station Manager descriptive section; neither provides an authenticated, maintained station registry contract.
- The 19 user-provided images are reference UI screenshots, not production data or permission to reproduce passwords/AnyDesk credentials. No 48-station inventory or historic ticket counts were manufactured.

The recommended direction is to keep the **Recorded Stations** view and local-only candidate CSV reconciliation from CP-FT-UI-03/04 intact, and activate persistent Station Manager data only after an owner identifies the canonical source and provenance.

## Implemented

1. `scripts/cp-ft-ui06-gotrue-postgrest.sh` provisions an ephemeral PostgreSQL 17 / GoTrue v2.197.0 / PostgREST v16.4 Docker environment. It uses a uniquely named short-lived bridge network, loopback-only dynamically allocated Auth/REST ports, and runtime-generated secrets. It applies the **unchanged** existing FuelTrans migration chain and the contract guard from CP-FT-UI-05. GoTrue's own schema migrations are applied by the pinned GoTrue image. All containers/network are forcibly removed by the EXIT trap, including on test failure. No existing Supabase stack or hosted DB is contacted.
2. `scripts/cp-ft-ui06-two-session.mjs` creates five disposable GoTrue users with different identities and verified password login sessions (reporter, L1, L2, ARAMCO client, and foreign-workspace actor), then provisions test-only profile/membership fixtures. It calls **real local PostgREST** with the individual GoTrue-issued JWTs.
3. Using the existing source `validateSourceTicketDraft`, `buildSourceTicketRecord` and `buildChange` functions, the test verifies Create → L1 Claim → Escalate → L2 Claim → Resolve with persistence readbacks, cross-client/workspace denial, compare-and-swap stale-write denial, and immediate server-side membership-revocation isolation. IDs, stations, and emails are synthetic and erased with the container.
4. `.github/workflows/apsyntra-frontend.yml` adds the same reproducible test as a step within the existing disposable-postgres job. No new CI job/service, package/dependency, hosted Supabase project, or permanent process is created.

### Verified local GoTrue / REST evidence

| Scenario | Result |
|---|---|
| Pinned GoTrue schema migrations and service startup | PASS |
| Five GoTrue user signups + independently verified password sessions | PASS |
| Distinct L1/L2 users and JWTs | PASS |
| Reporter ticket creation through authenticated PostgREST | PASS |
| Persisted ticket readback | PASS |
| Anonymous ticket read and tampered JWT signature | DENIED (PASS) |
| Cross-client and foreign-workspace RLS denial | PASS |
| L1 claim → L2 escalation → L2 claim → resolution, original JS domain actions | PASS |
| Persisted status, assignments, activity, closure date | PASS |
| Stale compare-and-swap update affects zero rows | PASS |
| Disabled L2 membership immediately hides ticket despite still-valid token | PASS |
| Disposable Docker cleanup | PASS, zero residual containers |
| Total authenticated HTTP checks | **33 PASS** |

**Important distinction:** This is genuine **local GoTrue + PostgREST authentication**, not just setting a database GUC. It does not prove production hosted GoTrue is configured identically, that two interactive browsers completed the login UI, or that the CRM host shell/board handshake approves the same accounts. Those are independent acceptance layers.

### Setup root causes resolved only in the test harness

- An isolated GoTrue instance initially returned signup HTTP 500 because the `auth.identities` relation was not found by its unqualified query. Initializing GoTrue's 75 schema migrations was necessary; the disposable PostgreSQL role's `search_path` must also resolve `auth` before `public` **before** migrations and service startup. This matches the dedicated auth-schema resolution expected by Supabase.
- The isolated JWT required `GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated` to emit the correct PostgREST role.
- PostgreSQL serializes timestamps with an equivalent UTC `+00:00` notation; tests compare parsed timestamps rather than an exact string format.
- These are **test-container configuration corrections**, not changes to hosted Auth, production permissions, or persistent user state.

## UI parity matrix (supplied images)

| Reference | Operational coverage | Remaining gap |
|---|---|---|
| 1 — Dashboard | Existing native KPIs, recent-ticket and distribution UI | No imported reference dataset (108 resolved + 1 active) |
| 2–6 — Create Ticket | Existing validated five-stage wizard, draft/evidence/review | Reference is a visually three-stage workflow; canonical station directory and logo-card behavior not verified |
| 7 — Ticket Queue | Filterable cards and server-backed queue | Reference history absent |
| 8–12 — Ticket Details | Existing incident workbench, timers, actions, comments, evidence, activity | Reference AnyDesk/POS/BOS credential contract and complete real ticket history unavailable |
| 13 — Global L1 | Existing L1 queue, claims and server workflows | Source engineer roster/availability unverified |
| 14–15 — Shift Handover | Existing handover flags/queue/banner | Six-engineer on-shift roster source unavailable |
| 16 — Station Manager | Recorded Stations and local-only CSV source comparison | Canonical station master, deployment/remote-access contracts unavailable |
| 17 — Analytics & Audit | Source-based reports and existing tabs | Not all reference tabs/metrics independently certified |
| 18–19 — Report Issue | Existing severity/form/evidence presentation | Full source-specific issue workflow parity not certified |

**Final 19-screen pixel/functional parity remains OPEN.** No invented station records, credentials, roster members, or ticket totals were added to make screenshots look populated.

## Verification and release gates

Required before integration:
- `sh scripts/cp-ft-ui06-gotrue-postgrest.sh` with no remaining disposable containers.
- `npm ci --no-audit --no-fund`, `npm test`, `npm run build`, `npm run check`, `npm run lint`, `node scripts/cp-ft-ui04-browser.mjs`, shell syntax and `git diff --check`.
- Green feature-branch CI for all existing jobs including this new GoTrue step, followed by merge, main CI, and Pages deployment verification.
- A genuine signed-in Chromium read-only smoke was performed against the existing **FuelTrans Standalone → Recorded Stations** route. The reference-style sidebar, station-source disclaimer, server filters, and local-only CSV comparison disclosure rendered after the CRM host resolved its session. It displayed **zero ticket-derived station IDs** in that user's current page; this is not a missing-data defect that can be corrected by copying the reference screenshot. The test tab was then closed, and no production ticket writes were made. Neither this smoke nor a successful deploy constitutes two-session production-browser mutation acceptance.

## Next dependency-based checkpoint

**CP-FT-UI-07 — Authorized Station Registry Source Acquisition, Genuine CRM Host Two-Account Browser Acceptance, and Reference-Screen Closeout.**

Entry prerequisites: owner-approved station source/export or API with stable client/site IDs and data lineage; isolated or otherwise disposable CRM host + GoTrue environment for independent session/browser interaction. Only then implement a trusted registry import/persistence contract, verify live role-based UI flows, and certify the remaining 19-screen differences. Do not relax existing workspace isolation or invent test users on production.

**Inference-only constraint:** No training algorithms, gradient descent, backpropagation, model parameter changes, or training dependencies introduced.
