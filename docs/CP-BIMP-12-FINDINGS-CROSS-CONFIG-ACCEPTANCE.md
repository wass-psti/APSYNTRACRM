# CP-BIMP-12 — Google Doc Findings Integration and Cross-Configuration Import Acceptance

Date: 2026-11-11

## Source and privacy

The user-provided Google Doc was retrieved successfully using its public text-export endpoint for investigation, without changing sharing or access settings. Its content was analyzed locally and is not committed to the repository. It includes worksheet entries that may contain credentials and other personal or business data. This file deliberately records **only aggregate issue categories and synthetic regression evidence**, not source values, user identities, passwords, credentials, or operational data.

## Observed findings (185 reported cases)

| Category | Reports | Interpretation |
|---|---:|---|
| Workbook has no populated importable worksheet | 81 | Legitimate no-data outcome; never invent records |
| Existing Status option mismatch | 45 | Primary cross-board import defect addressed by existing-column Status augmentation |
| Date/timestamp conversion | 20 | Current ISO/UTC normalizer accepts reported valid timestamp shapes; new regression confirms retention of calendar date |
| Physical destination-column limit | 14 | Genuine 30-column database contract; source workbook width must not be capped at the same value |
| Other validation (email, URL, numeric, title, type mismatch) | 5 | Requires per-value correction or explicit compatible mapping; do not silently reinterpret malformed values |
| Oversized text/file references | 5 | Existing cell storage contracts require 1,000/5,000-character bounds; no silent truncation |
| Literal prefix mistaken for formula | 5 | Fixed for **values** treated as inert cells, while title and actual Excel formula/error protections remain |
| Rows beyond header-column structure | 4 | Continue to report explicit source row/column conflicts, not silently exclude values |
| Extra/sparse XLSX cell addresses beyond column AD | 3 | Source reader now supports columns A–IV (256), independently from destination 30-column limit |
| Workbook exceeds 5,000 rows | 3 | Current atomic backend import contract is bounded; requires a separate bounded multi-batch design |
| **Total** | **185** | Counts are reported observations, not 185 individually reproduced defects |

## Implemented within approved scope

1. **Existing Status label extension.** For a single same-name existing Status target whose configured labels do not cover source values, the mapping wizard offers one explicit in-place configuration operation. It reuses `wm_set_board_status_labels`, preserves existing label IDs and current values, adds only missing labels, and reactivates explicitly required inactive labels. The updated board is freshly read and verified before the import wizard resumes. No duplicate Status column is created. Existing server-side permissions and audit remain unchanged; no new authorization gate is added.
2. **Data-wide source parsing.** CSV and XLSX readers now allow up to 256 source columns. This resolves the reported sparse formatted AE cell failures and lets a user explicitly map or exclude additional source fields. The independent 30 physical-column destination contract is untouched. No source column is silently skipped.
3. **Literal cell data.** Text-cell values beginning with formula-like characters remain inert strings and are no longer blocked just because they begin with `@`, `-`, `+`, or `=`. The XLSX parser continues to reject spreadsheet error cells and unsafe external formula references, and it never evaluates formulas. The Item title validation still rejects formula-like titles; CSV export paths remain responsible for formula neutralization.
4. **Timestamp conversion.** Added regression scenarios for valid `YYYY-MM-DDTHH:mm:ssZ` and `YYYY-MM-DD HH:mm:ss UTC` values on dedicated-board date columns. The existing canonical normalizer correctly preserves the source calendar day; no redundant date-parser rewrite was needed.
5. **Cross-configuration regression.** Added synthetic frontend cases for existing legacy Status, wide workbook, literal text, and timestamp/text type distinction. The dedicated disposable PostgreSQL 17 import scenario now extends a legacy Status label palette and imports into that Status field alongside a hidden legacy text field and current custom numeric field, then checks persistence and audit.

## Boundaries and outstanding acceptance

- **No** production SQL/database, RLS, role, workspace, session, credential, or permission changes. **No** production row/board write was performed.
- Generic imports remain bounded by the existing ordinary-board server import contract. Protected application boards still require their domain-specific import API; CP-BIMP-12 does not bypass it.
- Oversized values, >5,000-row workbooks, actual >30 destination physical columns, and unsupported non-Status dropdown option amendments require separate backend contract work or explicit user mapping. They are not declared solved.
- A genuine signed browser import into an approved dedicated *nonproduction* ordinary board, followed by refresh/reopen readback, remains pending. Do not substitute the unrelated board-column-delete recovery fixture or operational board records.
- Existing board Status modifications require the existing authorized board manager permission because the operation changes option metadata; no new approval hierarchy is added.

## Verification

- Focused import frontend tests: **75 passed, 0 failed**.
- Full frontend suite: **1,797 passed, 0 failed**; **169** shipped frontend modules pass syntax checking. CSS delivery, Pages-first source validation and existing SEC14 source guard all pass.
- Disposable PostgreSQL signed import tests: pending CI against this branch (fixture now tests Status label augmentation and stored values).
- Live browser write/refresh/reopen: pending suitable ordinary QA board.
