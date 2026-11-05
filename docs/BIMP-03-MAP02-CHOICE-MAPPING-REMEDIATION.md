# BIMP-03-MAP02 — Status/Dropdown Mapping Decision Deadlock Remediation

Date: 2026-11-05
Repository: `wass-psti/APSYNTRACRM`
Scope: ordinary-board CSV/XLSX mapping wizard, not application-owned boards
Status: IMPLEMENTED — AUTOMATED TESTS PASS — GENUINE LIVE SIGNED ACCEPTANCE PENDING

## Reproduction and root cause

The Contacts board mapping screenshot showed five workbook columns. The Name field mapped to Item. Three ordinary columns (Date Updated, Location, Checkbox) were approved with `Allow creation`. The fourth file field, Status, was in the separate `configure` state because `m143-v1` cannot atomically create Status or Dropdown option labels. The previous footer continued to advertise `Next: Handle matches`; only after the user clicked it did `computePlan()` raise `Configure or skip the pending Status/Dropdown columns before proceeding.`

This was a **guidance/state transition defect**, not evidence that ordinary-column approval should automatically grant Status configuration. The existing server requires a distinct manager-authorized, CAS-checked schema write for a Status/Dropdown with configured options.

## Implemented correction

1. `frontend/board-import-readiness.js` separates pending configured-choice decisions from proposed ordinary columns and their approval. Explicit skipping never silently mutates the original mapping. Verified choice creation maps its source to the actual new column UUID.
2. `frontend/board-import-ui.js` renders a prominent actionable summary listing unresolved Status/Dropdown fields, with **Review [field] setup** and **Skip [field] values (do not import)** actions. The footer displays **Review 1 Status/Dropdown setup** rather than a misleading Next button while any choice remains unresolved. Review scrolls and focuses the exact mapping row.
3. The three approved ordinary columns retain their consent when the user **explicitly skips or remaps Status** without changing those column proposals. A change to an ordinary proposal invalidates its consent. The proposal fingerprint now compares structured JSON arrays to avoid delimiter collisions.
4. Configuring Status/Dropdown follows the existing manager-only, audited, active-session and revision-checked `wm_board_schema_mutate` contract. A successful schema write refreshes the board, maps the file field to the verified existing column ID, and requires **fresh ordinary-column approval** before the later separate atomic record import. The column remains if the subsequent record import fails or is cancelled; the UI discloses this.
5. `frontend/board-import-choice-setup.js` classifies network interruptions, 5xx errors, malformed receipts and failed read-back **after attempting the schema write** as uncertain. A distinct error flag locks further schema attempts in the current wizard; users must close and inspect board columns and activity before retrying. A definitive 4xx denial remains an ordinary rejected write.
6. `frontend/board-import.css` renders pending decisions, explicit exclusions and successful setup notifications distinctly; `scripts/pages-smoke.mjs` verifies the newly deployed mapping-gate and choice-setup modules are present on GitHub Pages.

## Automated regression evidence

- `frontend/tests/board-import-choice-gate.test.mjs`: reproduces the exact **three approved ordinary + one pending Status** condition; verifies the action remains pending, explicit skip preserves three approvals and excludes Status values, and a verified configured Status maps to its stored IDs while new ordinary consent is required after schema changes.
- `frontend/tests/board-import-choice-setup.test.mjs`: checks failed, ambiguous and post-commit-lost responses are nonretryable; definitive 409 is distinct; manager, editor and foreign-workspace guards remain intact.
- The existing importer, frontend, disposable PostgreSQL and other security test suites remain in their unchanged CI workflow.

**Latest code CI:** https://github.com/wass-psti/APSYNTRACRM/actions/runs/41981243062 (998/998 frontend Node tests, 0 failures; disposable PostgreSQL jobs passed). Other GitHub Actions and live-Pages/deployment must be assessed by actual run status before live-ready claims.

## Security, data and limits

- No production SQL, roles, RLS, permissions, credentials or pre-existing records were changed. Existing normal/choice schema contracts were reused.
- No Status data is silently discarded. Skipping a source field requires a specific user action; matching and import preview disclose excluded columns.
- Still **not** a single transaction for both configured Status/Dropdown creation and record import, because the current installed server contract disallows that operation.
- The BIMP-02 production import-RPC active-session guard remains a separate pending backend activation/security gate.
- The ambient APSYNTRA browser cannot be controlled from this ChatGPT context (originating-browser-context restriction), so this run did **not** execute a real signed file upload, persist board records or inspect their authoritative audit history.

## Milestone acceptance and next gate

1. Root cause and exact split-consent reproduction — VERIFIED.
2. Guided mapping resolution and explicit skip — VERIFIED by automated tests.
3. Manager-only staged setup and uncertain-write recovery — VERIFIED by automated tests.
4. GitHub main CI / deployment source checks — VERIFIED when both checks report success.
5. Genuine signed-browser acceptance on an approved disposable ordinary board — PENDING.

Evidence-based completion upon successful CI and deployment: 4/5 gates (80%); not production acceptance.

**NEXT REQUIRED GATE: BIMP-02 / BIMP-03-MAP02 Signed-Session Operational Acceptance** — reupload the original XLSX on a disposable ordinary board, configure or deliberately skip Status, approve ordinary columns, verify actual imported item values, persistence after refresh, audit, duplicate handling and signed cross-workspace/denied-session behavior. CMP-02A production schema activation remains independently permission-gated.
