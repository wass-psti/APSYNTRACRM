# CP-BIMP-13 — Bounded Large Workbook Import and File Reference Findings

## Scope and authoritative contract

Parent: CP-BIMP-12 PR #253, following CP-BIMP-11 PR #252.

Existing production RPC `wm_import_board_wizard_atomic` (`m143-v1`) is transactional, signed, edit-authorized, and accepts **1–5,000 data rows**, **1–30 active source mappings**, and no more than **30 physical destination board columns**. Existing typed cell validation caps text cells at 1,000 characters, long-text at 5,000, URL at 2,000. These constraints were inspected in the repository before making changes. Production schema, RPC definitions, roles, permissions, RLS and operational records are untouched.

## Implemented

- Increased bounded CSV/XLSX source parser acceptance to **20,000 rows**, **256 source columns**, and **65,536 characters per source cell**. The existing 8 MB upload and 24 MB decompressed XLSX limits remain unchanged. This permits reviewing oversized file references before deciding whether to map them, rather than rejecting the entire workbook while reading.
- Separated source-column width from server mapping width. Source mappings are validated comprehensively, but only mapped (non-excluded) fields are sent to the 30-entry atomic RPC. Unmapped fields must still be explicitly excluded by the existing wizard. No silent dropping is permitted.
- Added `board-import-batches.js`, an independent, bounded coordinator that **validates the complete workbook before the first write**, divides it into up to 1,000-row transactions, and calls the existing signed atomic import service per batch. It performs the service's authoritative post-write readback before continuing.
- For a new destination group/column, the first atomic batch creates it and following batches use the persisted IDs, verified from a fresh authoritative read. New columns are not duplicated and the group is not created again.
- Checks the expected file-wide duplicate outcomes against each fresh batch plan. If they differ, stops instead of performing an unexpected update or skip.
- Maintains cumulative import receipt and visible progress. If an error occurs after previously verified batches, the UI reports how many rows were committed; a transport failure may leave the latest batch indeterminate, and no blind retries occur.
- All existing signed session, board revision/CAS, edit/manage, readback, receipt, and values-conversion checks are preserved. No per-row fallback writes, new backend endpoints, background agents or telemetry.

## Extended file reference limitation (not yet fully resolved)

Some Google Doc findings contain file-link aggregates longer than 5,000 characters. These can now be **parsed losslessly up to 65,536 characters** and reviewed, but **cannot be saved as a single cell** through the current production typed-column contract. Mapping one to a text, long_text or URL target fails *before the first import transaction* with its worksheet/row/column context. Explicit source exclusion remains an option, but is **not** lossless persistence and must never be presented as such.

A lossless persisted-file-reference solution would require a supported source-to-storage contract (such as a related reference collection or authorized managed attachment storage) plus retrieval/readback. That contract does not exist in the inspected ordinary board import RPC. Introducing a new production storage schema/RLS or granting broader access solely to bypass current validation is outside this checkpoint. This is a remaining capability gap, not a hidden success.

## Acceptance status

- Focused import tests: **88 passed / 0 failed**. Includes full-file late-row denial, 5,001 CSV/XLSX source rows and a 5,001-row six-batch in-memory persistence simulation, wide source mappings with explicit skip, new group/column reuse, readback persistence, indeterminate second batch, oversized source text preservation/rejection and inert progress-callback failure.
- Full frontend test suite: **1,810 passed / 0 failed**. Syntax: **170** frontend modules passed. CSS bundle, Pages source policy, SEC14 source guard and git diff validation: PASS.
- Disposable signed PostgreSQL CI continues exercising the unmodified atomic writer; synthetic batch-service tests verify the coordinator's multi-request behavior. GitHub branch CI initially passed frontend and three disposable PostgreSQL jobs; the BIMP-02 signed-claim PostgreSQL acceptance also passed. The final expanded XLSX fixture is being reverified.
- Actual signed-browser import and refresh persistence against the **new CP-BIMP-13 build** remain pending. The only open signed UI tab is the *deployed* CRM, not this unmerged branch, and currently shows an unrelated board-column-delete recovery fixture. No QA write against this recovery board or production operational records has been performed.
- Imports spanning multiple batches are **not globally atomic**. Every batch is atomic, but already committed batches persist when a later batch fails. Recovery must explicitly reconcile the committed prefix before resuming.
