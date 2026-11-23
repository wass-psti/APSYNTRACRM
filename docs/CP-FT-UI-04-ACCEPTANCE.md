# CP-FT-UI-04 — Station Source Reconciliation and Reference Acceptance

**Date:** 2026-11-23
**Repository:** wass-psti/APSYNTRACRM
**Base:** `main` at `8d52e1a48cdc36b0e75398b40492e958ff7065e7` (includes CP-FT-UI-03 `d179bec6`).

## Findings and recommendation

The 19 supplied screenshots describe the *intended UI*, not an authoritative station registry or permission to copy the depicted operational data. Read-only examination of the actual Supabase project `jtlusodorfnyzgyuewkz` again confirmed **zero public station/registry tables** and an existing `fueltrans_tickets` table. Searches of the active CRM source, legacy WatchdogWorkspace FuelTrans source and authorized project folders found **no authoritative station API or station CSV/XLSX export**. No station inventory, status, credentials, on-shift engineer roster or historical ticket dataset was invented.

The native FuelTrans portal remains hosted on **FuelTrans Standalone**, not on the separately named conventional FuelTrans Support Portal board. Do not conflate those boards or migrate records by guessing. Preserve the previous `Recorded Stations` view, which is deliberately **ticket history only**, not a canonical directory.

Recommended approach: provide an auditable, **non-destructive local CSV candidate review** so an owner-supplied authorized station export can be examined as soon as available; do **not** turn candidate rows into trusted records or create a production registry schema without a source-of-truth contract.

## Implemented in CP-FT-UI-04

- Station Source Review inside **Recorded Stations**. A closed-by-default disclosure allows choosing a local CSV, downloading a blank header-only CSV template, and requesting explicit preview.
- A bounded CSV parser supporting quoted fields, embedded commas, CRLF/BOM, and documented header variants: Client/Client Organization/Network, Station ID/Site ID, Station Name/Site Name.
- Allowlist-based projection of only `client`, `stationId`, `stationName`. All other source columns, including possible remote-access/credential columns, are ignored, never rendered or included in comparison exports.
- Duplicate keys are deduplicated; contradictory names, malformed rows, out-of-client rows and invalid identifiers produce explicit **line-numbered validation issues** rather than silent overwrites. Report export is disabled if issues exist.
- Limits: 1 MB CSV, 5,000 source rows, with a 40-row on-screen preview. No network request is made by the candidate parser; data is not written into Supabase, storage, browser persistence or telemetry.
- Source candidates are compared only with the **currently displayed 50-record ticket-history page**. Outcomes: matching name, differing recorded name, not observed *on this page*. None imply global station absence or registry correctness.
- Exported CSV includes page-scoped comparison status and only reviewed non-secret station metadata; spreadsheet formula-like values are neutralized before CSV export.
- The export and file reading are user-initiated. No background refresh, database schema, permission, role, session, or production ticket mutation was introduced.

### Nonproduction workflow rehearsal

A separate disposable in-memory repository exercises the existing source ticket draft and workflow-domain code using **two independent synthetic users** (L1 and L2) and one synthetic reporter: create → L1 claim → L2 escalation → L2 claim → resolution → readback. It also tests invalid direct resolution, premature L2 claim, wrong-workspace mutation denial, and optimistic concurrency collision. This is useful **contract verification**, but **not genuine Supabase database persistence, RLS, or two-account signed browser acceptance**. It does not claim otherwise.

## Reference fidelity matrix

The first column corresponds to the user's 19 numbered screenshot references, not 19 completed screens.

| Reference | Target | Verified implementation coverage | Remaining limitation |
|---|---|---|---|
| 1 | Dashboard | Source-derived counters, recent tickets and status distribution | Original 109-ticket dataset absent |
| 2 | Client & Location | Native wizard location fields and advisory history lookup | Client logo cards, verified station master and numbering parity not available |
| 3–4 | Classification | Validated category, system, priority, impact and downtime fields | Existing five-stage source contract differs from visual three-stage reference |
| 5–6 | Issue Details | Title, description, reporting channel, attachments, review and submission validation | Exact three-stage progression is not adopted |
| 7 | Ticket Queue | Read-only search/filter/status and ticket cards | Reference record dataset unavailable |
| 8–12 | Ticket Detail | Incident workbench, time counters, action guard, evidence, activity history | AnyDesk/POS/BOS credential directory and source-specific actions not verified |
| 13 | Global L1 Workspace | Assignment queue, active status and ticket cards | Reference ticket records and engineer availability source unavailable |
| 14–15 | Shift Handover | Shift banner, flagged ticket queue and handover controls | Six-engineer roster/scheduling source unverified |
| 16 | Station Manager | Recorded Stations, local source CSV review, discrepancy export | Authoritative 48-station registry and deployment metadata unavailable |
| 17 | Analytics & Audit | Existing source-derived reports and auditing | Not a direct replica of reference dataset or all tab groups |
| 18–19 | Report Issue | Severity selection, form details and issue attachments | Full backend workflow and exact screenshot parity remain pending |

The matrix deliberately distinguishes **operationally present** from **pixel-perfect/reference certified**. No unsupported parity claims are made.

## Verification checklist

- `npm ci --no-audit --no-fund` against the committed lockfile.
- `node --test frontend/tests/fueltrans-station-source04.test.mjs frontend/tests/fueltrans-workflow04-disposable.test.mjs` — validates source parsing, duplicates/conflicts, client matching, safe CSV exports, and the simulated two-actor lifecycle.
- Full `npm test`; `npm run build`; `npm run check`; `npm run lint`; targeted ESLint; syntax and `git diff --check`.
- `node scripts/cp-ft-ui04-browser.mjs` — synthetic authenticated Chromium fixture, upload, validation, source comparison, CSV download, negative records and responsive 1200/768/540px. Production API mutations are mocked to throw.
- Signed-in read-only deployment smoke against the actual CRM host is required **after** merging and Pages deployment. Successful HTTP assets alone do not establish runtime acceptance.

## Explicitly pending

1. A trusted organization-owned station export or API with provenance, responsible owner, update cadence and expected client/station identifiers.
2. Any canonical persistent station-registry architecture/data migration (none authorized or attempted without a verified source).
3. Nonproduction **real database** lifecycle, signed-in two-account acceptance, RLS/permission preservation and persistence readback.
4. Visual sign-off against all 19 screenshots and source-specific behavior with real, authorized input data.
5. Deployment-time browser acceptance of the new candidate-review controls.

## Next solid implementation if still needed

**CP-FT-UI-05 — Verified Station Source Activation, Disposable Supabase Two-Account Lifecycle Acceptance, and Remaining UI Parity Closure.**

Entry gate: source owner provides a verified, authorized non-secret station export/API and access to a genuinely disposable nonproduction database with two test accounts. Implement the smallest server-backed station directory compatible with existing workspace/client scope, without adding unnecessary new authorization gates. Prove conflict handling, lineage and readback, and close the 19-screen matrix with genuine data. If dependencies remain unavailable, keep the local reconciliation feature and document the blocker; do not invent production inventory or test incidents.

No gradient descent, backpropagation, training/retraining/fine-tuning, model-weight updates, or related training dependencies were added.
