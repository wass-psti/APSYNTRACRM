# CP-TL-NATIVE-03A — Six-Module Native Workflow and Export Acceptance

**Date:** 2026-11-17 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Branch baseline:** `main` at `f305ca8fb62a841f0dccc927d0fa49da9f86af87`  
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`  
**Canonical TradeLink Board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`

## 1. Outcome

**Code-level native integration and export acceptance: PASS.**

The current `main` implementation already connects the TradeLink native adapter and semantic renderer to the existing CRM host. The six source document types share the original TradeLink domain client and host-owned controller; no second persistence layer or parallel backend is required.

This milestone therefore records verification of the existing implementation rather than introducing a duplicate implementation or unnecessary refactor.

## 2. Six-module coverage

The six persisted document types are retained without remapping:

| Module | Domain key | Verified source contract |
|---|---|---|
| Electronic Sales Invoice | `esi` | Client/tax identity, priced items, finance and approval fields |
| Quotation | `quotation` | Client contact, priced items, validity, delivery/payment terms and separate commercial status |
| Packing List | `packing` | Consignee, source reference and non-priced physical items |
| Delivery Receipt | `delivery` | Recipient, source reference, QC/logistics fields and optional serial identifiers |
| Payment AR | `payment` | Payor, payment particulars, cash/cheque values and receipt/verification fields |
| PO to Suppliers | `po` | Supplier, priced items, target delivery, payment terms and review fields |

All Documents remains the shared repository for these six types, not a seventh document type.

## 3. Native integration verified

- `frontend/tradelink-native.js` exports the existing `TradeLinkDomainClient` as `TradeLinkNativeClient`; it does not duplicate RPC transport or domain state.
- `frontend/tradelink-ui.js` exposes the existing semantic TradeLink application renderer.
- `frontend/app.js` imports the native UI entrypoint and uses the existing TradeLink route, host state, `TradeLinkDraftWorkspace`, and delegated `data-action` handling.
- `frontend/tradelink-draft-workspace.js` routes the six module forms through the existing native adapter.
- The canonical Board, existing document tables/RPC contracts, company templates, source calculations, revision model, and shared stylesheet bundle are retained.

## 4. Persistence and readback contract

The existing implementation uses the signed TradeLink domain client and its existing server-side transaction RPCs. After a save receipt, the host performs independent signed document readback, All Documents listing readback, and canonical Board readback. It compares the full saved content envelope, assigned document number, document type, revision, workflow state, Board item identity and Board item title before displaying success.

The six-module disposable PostgreSQL acceptance previously recorded under CP-TL-10A verifies:

- Revision-one creation for all six document types.
- Exact document and Board-item readback.
- Retry/idempotency behavior.
- Revision-two updates and compare-and-swap behavior.
- Stale changed-payload rejection.
- All Documents page readback.
- Audit event consistency and absence of approval events in the save-only fixture.
- Fixture rollback; no production business records were created by the test.

References: PR [#419](https://github.com/wass-psti/APSYNTRACRM/pull/419), PR [#369](https://github.com/wass-psti/APSYNTRACRM/pull/369), and the CP-TL-10A acceptance recorded in PR [#486](https://github.com/wass-psti/APSYNTRACRM/pull/486).

## 5. Export acceptance and truthful boundaries

### CSV

The existing selected-row CSV serializer is verified for all six source document types. Its current contract is **metadata-only**, with these columns:

- Document Number
- Document Type
- Workflow Status
- Revision
- Last Updated
- Archived

It is bounded to 50 selected visible rows and does not claim to export full customer content, line items, pricing, attachments, or complete document payloads.

### Official print output

The existing official output renderer has coverage for all six saved document types and the recovered company/template snapshots. Tests cover source-specific output, saved terms, line items, calculations, currency, escaping, and company identity.

The existing browser Print / Save as PDF flow reloads and verifies the exact saved revision and matching Board item. Printing is limited to a verified Approved revision. This is a browser print copy, not electronic PDF issuance.

## 6. Verification performed against current main

A fresh shallow clone of the current `main` branch was used. No stale local checkout or uncommitted user worktree was used.

| Check | Result |
|---|---:|
| Full frontend regression (`npm test`) | **2,605 passed, 0 failed** |
| Focused TradeLink regression (`node --test frontend/tests/tradelink*.test.mjs`) | **389 passed, 0 failed** |
| JavaScript check (`npm run check`) | **PASS** |
| Production Vite build (`npm run build`) | **PASS** |
| npm dependency audit during clean install | **0 vulnerabilities** |

The production build retains existing non-blocking warnings: the legacy `startup-guard.js` script is not a Vite module entry, and large application/PDF chunks exceed the default 500 kB advisory threshold. Neither warning caused the build to fail.

The clean verification checkout was based on `f305ca8`. Before this documentation PR was opened, `main` advanced to `fd5557a` by four commits. A GitHub compare of those commits shows that the intervening changes were confined to CP-DB-CPU-17 and CP-FRT-FLOW-03G documentation/tests/scripts; no TradeLink source, tests, migrations, or assets changed. The PR is documentation-only.

## 7. Production evidence — separate from code-level acceptance

The latest recorded read-only production baseline in CP-TL-NATIVE-02A was:

- 4 active TradeLink documents, all Quotations.
- 1 genuine Quotation Submit event.
- 17 immutable revision snapshots.
- 0 current snapshot mismatches.
- 0 current document-to-Board mismatches.
- Genuine business transition acceptance: **1/6**.

The one synthetic Quotation QA Draft recorded in CP-TL-FINAL-09C is technical QA evidence only. It is not a genuine commercial transaction or Submit event and does not increase the 1/6 business acceptance count.

The live Overview readback confirms the canonical TradeLink Board is presented with 4 items. This does not by itself prove six live production module transactions.

**Not claimed:** six genuine production submissions, production writes for the five other module types, electronic PDF issuance, or a six-module signed browser transaction run in this milestone.

No additional production document was created for this acceptance record because no legitimate business payloads for the remaining modules were supplied or authorized for insertion.

## 8. Scope and non-changes

- No new Supabase project, schema, migration, RPC, database, or storage system.
- No production document, reviewer, revision, sequence, status, or Board mutation.
- No new role, permission, grant, RLS policy, authentication system, approval hierarchy, or authorization gate.
- No weakening or alteration of existing signed-session, workspace, Board, revision, review, or Approved-print behavior.
- No new dependency.
- No changes to unrelated APSYNTRA applications.

## 9. Acceptance classification

| Requirement | Status |
|---|---|
| Native adapter and renderer integration | **VERIFIED** |
| Six source document forms and field contracts | **VERIFIED** |
| Six-module save/read/retry/update/CAS disposable PostgreSQL contract | **VERIFIED** (prior CP-TL-10A evidence) |
| Persistent content, revision and Board readback logic | **VERIFIED** (regression + prior disposable PostgreSQL evidence) |
| CSV metadata export for all six types | **VERIFIED** |
| Official saved-document output for all six types | **VERIFIED** (unit/regression coverage) |
| Full frontend regression, check and build | **VERIFIED** |
| Genuine production business lifecycle for all six types | **PENDING — 1/6** |
| Six-module signed production browser transaction acceptance | **PENDING** |

**Conclusion:** CP-TL-NATIVE-03A passes its code-level six-module native integration, persistence-contract and export acceptance. The remaining gap is genuine signed production runtime/business evidence, not a missing second adapter, renderer, backend, or permission system. Continue with CP-TL-NATIVE-03B for focused signed runtime readback and export acceptance, using existing legitimate records and no invented production transactions.
