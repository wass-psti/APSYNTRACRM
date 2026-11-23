# CP-FT-UI-07 — Station-source evidence, real browser lifecycle, and reference parity assessment

**Date:** November 23, 2026
**Repository:** `wass-psti/APSYNTRACRM`
**Starting main:** `58f4770` (CP-FT-UI-06 and the later mobile-workspace fix already merged)
**Disposition:** Partial requirements delivery; no authoritative station registry activation until verified source ownership and actual data are available.

## Independent analysis and engineering decision

The 19 FuelTrans Support Portal screenshots are **visual/workflow references**, not verifiable input records. They show a 48-station Station Manager and AnyDesk/POS/BOS information, but do not establish row provenance, operational currency, credentials, or authority to import the dataset.

Fresh read-only production Supabase metadata inspection found **no tables/views/functions with explicit station(s)/registry name tokens** in the accessible non-system schemas. Earlier audits likewise found no public station/registry table. Searches of the authorized MacBook's Downloads, Documents and Desktop folders found no station export CSV/XLSX/JSON in the accessible locations. Two legacy `Fueltrans Technical Support Portal.docx` copies previously inspected describe Station Manager but do not provide a maintained, authenticated registry feed.

**Decision:** Do not create a production registry schema, import screenshot-derived inventory, or imply that ticket-history stations are canonical. Keep existing FuelTrans ticket-source business rules, workspace isolation and five-stage wizard. Deliver the evidence-provenance tools and a genuine-browser-to-disposable-backend test that can run before source activation. No unnecessary authorization gate.

## Delivered changes

### 1. Local-only, reproducible candidate evidence (image 16)

- Added `frontend/fueltrans/station-evidence07.js`: SHA-256 over a **stable sorted projection of only** `client`, `stationId` and `stationName`. Source bytes, unknown extra columns, AnyDesk information, passwords and remote-access data never enter the fingerprint or manifest.
- The existing Recorded Stations CSV review now displays the metadata digest after successful validation. It offers **Download candidate evidence manifest** alongside the existing station comparison CSV.
- The exported JSON explicitly marks `verificationStatus: UNVERIFIED_CANDIDATE`, `authorityVerified: false`, `registryActivated: false`, `storage: none`, with row totals, duplicate/ignored-column counts, page-scoped comparison outcome counts, SHA-256 and timestamp.
- Conflicting source IDs, invalid scope, incomplete comparison and other validation errors **prevent** evidence export. A digest proves reproducibility of reviewed metadata, **not** ownership, completeness, authenticity or authorized deployment.
- Evidence stays in browser memory until user-initiated download. Nothing is submitted to Supabase or local storage. No new server permissions, registry rows, background tasks or dependencies.

### 2. Actual FuelTrans browser/UI backed by real GoTrue and PostgREST

- Extended `scripts/cp-ft-ui06-two-session.mjs` with an **opt-in only** `FT_UI07_BROWSER=1` mode. Unset, CI's existing 33-check API/RLS acceptance remains unchanged.
- Added `scripts/cp-ft-ui07-real-browser.mjs`. It starts separate Playwright Chromium contexts for a disposable reporter, L1, L2 and other-client user. The **actual native `syncFuelTrans` and `mountFuelTrans` application code** renders the forms, incident detail and workflow controls.
- Each context uses its own **real GoTrue email/password-authenticated token**, and ticket CRUD/claim/escalation/resolve requests are forwarded to the actual isolated PostgREST database with original FuelTrans RLS and triggers.
- Browser actions: reporter fills the five-stage create form and submits, then L1 claims and escalates the persisted ticket, L2 claims and resolves, another-client browser cannot open the ticket, and reporter refreshes to observe resolved status. No browser page error and no page-wide horizontal overflow at 1200px/768px/540px/390px.
- **Fixture limitations:** CRM's host `api.context`/board/access contract is provided by a controlled test adapter; this is **not an authenticated CRM host browser login**. Only optional `storage/v1/object/list/fueltrans-evidence` and `fueltrans_ticket_events_v2` reads are explicitly stubbed to empty arrays because those services are outside the isolated database fixture. They are **not** counted as real Storage or audit acceptance.
- The backend uses generated synthetic users/stations and a uniquely named disposable Docker network, generated secrets, loopback-only ports, and automatically removed containers. No local shared Supabase or hosted production database is modified.

### 3. Reference fidelity: actual coverage vs unresolved requirements

| Supplied images | Existing implemented UI | Remaining reference gap |
|---|---|---|
| 1 Dashboard | Dashboard metrics and ticket summary, native navy sidebar/light cards | Reference historical ticket counts and exact source dataset not available |
| 2 Client & Location | Validated client and station fields; ticket-derived lookup | Logo-card/client-directory source and verified station master unproven |
| 3–4 Classification | System, priority, impact, estimated downtime, additional issue metadata | Three visually presented steps vs existing source-preserving five stages |
| 5–6 Issue Details | Title, description, channel, optional evidence, review and guarded submit | Reference three-stage progression, form placement and source data not fully matched |
| 7 Ticket Queue | Server-filtered ticket cards/search/status/priority | Original live ticket history not imported |
| 8–12 Ticket Details | Two-column incident workbench, timers, action controls, audit/evidence panels | Reference AnyDesk/POS/BOS credentials and proprietary workflow source unavailable |
| 13 Global L1 | L1 queue and claim flows | Reference six-person staffing/roster source not verified |
| 14–15 Handover | Handover status, tickets and shifts | Published engineer availability/shift roster source unavailable |
| 16 Station Manager | Recorded Stations view, paginated ticket history and now a metadata fingerprint/manifest | Owner-approved 48-station registry, deployments and credential store still unverified |
| 17 Analytics | Source-derived metrics and reports | Exact tab structure/history and production metrics not fully certified |
| 18–19 Report Issue | Existing severity, details and report workflow | Exact step layout and complete cross-app evidence workflow still need verification |

**All 19 screenshot references have been assessed, not pixel-perfect certified.** Lack of source data does not justify manufacturing counts, rosters, devices or credentials.

## Acceptance boundaries

**Verified when passing:** local unit/browser tests; real distinct GoTrue login tokens; actual browser native module; real local ticket persistence and L1/L2 transitions; client RLS denial; no residual disposable containers; all prior production functionality preserved.

**Not verified here:** station inventory authority/activation; full CRM host's two independent login UI sessions; production ticket mutation acceptance; optional Storage and audit v2 endpoints; complete 19-screen visual parity.

## Reproducible checks

- `npm ci --no-audit --no-fund`
- `node --test frontend/tests/fueltrans-station-evidence07.test.mjs frontend/tests/fueltrans-station-source04.test.mjs`
- `node scripts/cp-ft-ui07-browser.mjs` — synthetic read fixture, CSV manifest validation/export and responsive checks.
- `FT_UI07_BROWSER=1 sh scripts/cp-ft-ui06-gotrue-postgrest.sh` — *real local* GoTrue + PostgREST and actual FuelTrans UI through an emulated CRM host adapter. Requires Docker + local Playwright Chromium. All artifacts auto-destroyed.
- Existing `npm test`, `npm run build`, `npm run check`, `npm run lint`, syntax/lint and diff checks.
- Feature-branch CI, controlled PR merge, main CI, Pages deployment, and authenticated **read-only** production screen smoke; a green build alone does not establish final operational acceptance.

## Verified local results (final checkpoint)

- Locked dependency installation: **PASS** (`npm ci --no-audit --no-fund`).
- Full repository unit suite: **3,481/3,481 PASS**, no failures or skipped tests.
- Production build, syntax checks, full lint, targeted ESLint, shell syntax and `git diff --check`: **PASS**.
- Synthetic Chromium station-source review: **PASS** including a downloaded digest manifest, credential-column omission, conflict denial and 1200/768/540/390 responsive checks.
- `FT_UI07_BROWSER=1` with pinned disposable GoTrue/PostgREST/PostgreSQL: **PASS**; genuine ticket creation and L1/L2 browser actions, cross-client denial, reporter refresh/readback, 33 existing Auth/REST API checks, zero residual containers. The CRM host adapter remains a **test double**; optional Storage/audit reads remain test stubs.

## Logically necessary next solid implementation (only after actual prerequisites)

**CP-FT-UI-08 — Owner-Verified Station Registry Ingestion, Genuine CRM-Host Two-Account Browser Acceptance, and Final Reference Parity.**

Prerequisites: authenticated and owner-approved station inventory export/API with stable IDs, data owner, update cadence and credential-handling policy; explicitly disposable full CRM host environment/accounts (not existing production accounts), and permission to compare original source workflows/assets. Implement the smallest source-backed persistence contract with idempotent imports, provenance/readback and conflict handling, then validate genuine CRM host account sessions and the 19-screen matrix. Without these inputs, keep the existing read-only source boundary and do not fabricate a registry or declare pixel-perfect parity.

**Training constraint:** No gradient descent, backpropagation, training/retraining/fine-tuning, iterative parameter updates, or training dependencies were introduced.
