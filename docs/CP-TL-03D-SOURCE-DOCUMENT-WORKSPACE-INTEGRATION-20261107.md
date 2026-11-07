# CP-TL-03D — Source-Aligned Document Workspace Integration

**Date:** November 7, 2026 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` in the existing WatchdogWorkspace Supabase project  
**Scope:** Source-faithful, **frontend-only, non-mutating** All Documents workspace staging. The domain read/write feature flags remain disabled. No Stage B permission grants, production records, SQL mutations, deployment policy bypass, user/role changes or new Supabase project.

**Disposition:** **IMPLEMENTED — AUTOMATED VERIFIED — DEPLOYED / EXACT CDN VERIFIED — SIGNED DOCUMENT-PAGE INTERACTION PENDING**.

## Source baseline and work delivered

- Original TradeLink 0.1.74 source audit: `docs/CP-TL-APP02-SOURCE-AUDIT.md` notes a distinct `DocumentRecord` repository and `document-workspace.ts` search/sort/filter behavior, separate from board rows. It explicitly prohibits inferred document/workflow status from the board projection. Existing `frontend/tradelink-domain-client.js` exposes only the staged list/read/commit API with `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`.
- **Existing `#/boards/.../tradelink/documents` route preserved:** The page now displays a separate **TradeLink document workspace** stage **above** the existing authorized Board records. These are explicitly two different projections: authorized board items are not fabricated into documents, priced records, or approval states.
- **Source module navigation:** The staged document workspace has links to all six source-defined modules, routing through the existing signed TradeLink app. No standalone login or new route authority.
- **Reused strict repository list:** The existing TradeLink Draft list renderer now offers a *read-only* mode for the document workspace. It hides all Read/Edit, Archive and Restore action buttons in that view. Document number, module, eight source workflow states, revision and archived status are the only presented document columns; no board-status coercion or unverified fields.
- **Local source-aligned sorting:** The current, *already-authorized* response (maximum 50 rows) can be ordered by document number, module, or numeric revision, ascending or descending. Search and existing filters remain local to that bounded response. The form of the controls is accessible, native, and inactive while domain reads remain off. Sorting never performs an extra RPC.
- **Signed route-scoping prepared:** The future authorized read-only list path now accounts for both the Draft and Documents TradeLink sections and revalidates the same signed actor, board, workspace, and route before accepting results. It cannot execute while the existing read feature flag is false. The local DOM filter handler requires signed route, explicit read flag, verified result status, and existing board manage capability.
- **No backdoor data path:** `frontend/tradelink-domain-client.js` remains unchanged; the server is authoritative and enforces the actual signed General Manager/central RBAC/RLS boundaries when separately activated. A UI condition cannot substitute for that server proof.
- **Scoped presentation:** Added responsive document-panel layout, source module navigation and six-field listing controls inside existing TradeLink CSS.

## Code and verification

**Initial implementation commit:** `a9fa9f08f0c1baa2438d3b0180093ce68e4ed446`.  
**Corrected tested implementation commit:** `7ef5c47428a2257560a1e3dad19f6de853bd9bf1`. Only the prior list test's expected order changed after the new explicit default sort; the original CI failure was corrected, not waived.

Changed files:
- `frontend/tradelink-draft-workspace.js`
- `frontend/tradelink-application.js`
- `frontend/app.js`
- `frontend/tradelink-application.css`
- `frontend/tests/tradelink-draft-workspace.test.mjs`

| Evidence gate | Result |
| --- | --- |
| Source-bounded document repository integrated in existing `documents` route | **IMPLEMENTED** |
| Foreign workspace rejection, disabled-read redaction even with forged UI rows, zero RPC while off | **VERIFIED by targeted automated tests** |
| Numeric revision and natural document-number sorting, active/archived filtering, DOM-only reordering | **VERIFIED by targeted automated tests** |
| Full frontend suite | **VERIFIED: 1,146/1,146 PASS, zero failures**, [Frontend Validation 42323805049](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42323805049) |
| Disposable PostgreSQL, collaboration, overtime checks | **VERIFIED: SUCCESS** in same run; no live production writes |
| Exact-commit GitHub Pages deployment | **VERIFIED: SUCCESS**, [Pages run 42323804091](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42323804091), SHA `7ef5c47428a2257560a1e3dad19f6de853bd9bf1` |
| Hosted CDN/HTTPS asset smoke | **VERIFIED: PASS** for exact SHA, `frontend/app.js`, `frontend/tradelink-application.js`, `frontend/tradelink-draft-workspace.js`, `frontend/tradelink-application.css` included in live smoke |
| Browser read of existing signed Draft route | **OBSERVED**: signed TradeLink Dark Launch view still reports reads and writes **not activated**. The connected tab stayed at `/tradelink/drafts` (not `/tradelink/documents`). |
| Actual authenticated Documents-page navigation, keyboard interaction, filtering, sorting, route/logout/identity isolation | **PENDING**: Chat browser connector only exposes tab/page-text reads and cannot click, navigate or enter data. Do not label as independently verified. |
| Stage B permissions, production document creation, authoritative read activation | **NO-GO / NOT EXECUTED** |

## Next authorization-safe continuation

1. Once an operator navigates the existing signed browser tab to **Board records** (`/tradelink/documents`) and refreshes, verify the separate staged document repository appears above the board records and filters are **disabled** until approved production read activation. Do not interpret the presence of a control as proof of an RPC.
2. Continue work only in non-mutating source-aligned domain presentation; genuine saved documents, attachments, PDFs, workflows, and permissions remain out of scope until their separately authorized activation gates.
3. Controlled read-only backend activation would still require fresh cross-workspace and expired/revoked-session denial checks, actual signed-HTTPS runtime evidence, owner/rollback governance, and explicit release approval. The formal CP-TL-03C Stage B production write NO-GO (recovery ownership, verified backups and exact grant approvals) remains intact.

**No production domain read/write flag, grants, RPC, RLS, document records, server roles, credentials, or recovery configuration were changed.**

## Owner acceptance — November 7, 2026

The owner instructed **“consider it all good now begin Next gate: Genuine signed-browser acceptance of the integrated TradeLink Document Workspace, followed by controlled read-only activation readiness assessment.”** The bounded **source-aligned document workspace integration** milestone is therefore **CLOSED — USER-ACCEPTED FOR ROADMAP CONTINUATION WITH BROWSER EVIDENCE EXCEPTIONS**. Automated regression (1,146/1,146), disposable PostgreSQL, deployed Pages and exact-commit CDN acceptance remain verified at implementation SHA `7ef5c47428a2257560a1e3dad19f6de853bd9bf1`. User acceptance does **not** independently prove interactive navigation, sort/filter behavior, real identity transitions, cross-workspace isolation, server-side signed document row RLS, or future production authorization. The new read-only readiness assessment is documented in [CP-TL-03D signed Documents / read activation readiness](CP-TL-03D-SIGNED-DOCUMENTS-READ-ACTIVATION-READINESS-20261107.md). Domain reads and writes remain disabled; production Stage B remains NO-GO.
