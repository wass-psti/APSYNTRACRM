# CP-TB-NATIVE-01K — Historical provenance and isolated PostgreSQL acceptance

Date: November 18, 2026.
Status: **STAGING VERIFIED; SOURCE SUBITEMS AND ATTACHMENT BYTES UNRESOLVED; PRODUCTION BACKFILL NOT EXECUTED.**

## 1. Authenticated monday.com evidence

Source parent board: 18370784140. Private workbook SHA-256: fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a.

- Unique source issues: 87. Source discussions: 1,129. Linked replies: 70, across 46 parent posts.
- Asset references: 51 discussion posts. Embedded XLSX media files: 0.
- Source issue Subitems cells: 87 blank. Independent source subitem ID/parent worksheet: absent.
- Authenticated reported subitem board URL 18371220520 redirects to parent board 18370784140; the legacy CRM projection references a different board, 18370784141.
- Neither the redirect nor blank source cells proves there were zero historical subitems. Original source attachment bytes, checksums, and stable download mapping are also unavailable in this workbook.

Source browser inspection was read only; the two temporary source tabs were closed afterward.

## 2. Isolated history-preserving staging contract

Candidate: supabase/migration-candidates/cp_tb_native_01k_stage_contract.sql. **Not a production migration and not applied to production.**

Three private staging tables retain (a) immutable source workbook and JSONB snapshot receipts; (b) unique source issue IDs and original rows; and (c) unique source post IDs, issue/parent-post links and original author, timestamp, content and asset references.

The private staging function tb_legacy_stage_snapshot(uuid,jsonb) validates the canonical parent board, structurally complete snapshot, original author/time, distinct IDs, parent-first threaded replies and same-issue lineage. It stages the entire snapshot in one transaction, serializing concurrent replay per workspace/board. Repeating unchanged data reports ALREADY_STAGED; altered source receipts are rejected. Missing, cross-issue or out-of-order parent references, unexpected board IDs and invalid provenance fail before any partial transaction can commit.

The independent tb_legacy_verify_snapshot(uuid,text) verifies staged data hashes, counts, issue/post source IDs, historical author/date fields, replies and asset references. It always reports ready_for_migration=false. The candidate never writes to the live Toolbox tables and creates no authenticated/anonymous application RPC grants.

**Contract boundary:** Staging retains original history but does not activate the original records in the production frontend, resolve author-to-account identities, retrieve media bytes, or assert full source parity.

## 3. Isolated staging acceptance

Ran against a disposable, local PostgreSQL 17 Docker container with no public network port or production credentials.

- Authenticated private manifest staged: 87 issues, 1,129 posts, 70 replies, 51 asset-reference posts.
- Same-manifest replay: ALREADY_STAGED, no duplicates.
- Changed source receipt/content: rejected.
- Missing parent, cross-issue reply, missing author and wrong source board: rejected.
- Failed batch: fully rolled back, no partial receipt.
- Two concurrent identical requests: exactly one STAGED and one ALREADY_STAGED.
- Manually tampered staged record: rejected on independent verification.
- Synthetic application roles have no direct access to private staging data.
- No live Toolbox tables were created/changed during staging acceptance.
- Private source manifest remains outside Git with file mode 0600 and SHA-256 ffd63a92a83c2284f7f75d454bcd55eb0fe00c061c482853ade1dc4f825decbf.

GitHub Actions runs the synthetic variant only. The authentic workbook and private JSON manifest are never committed/uploaded to CI.

## 4. Remaining gates before real migration

1. Obtain independently verified complete source subitem IDs and parent links, or a provider-confirmed zero count.
2. Retrieve historical attachments and verify each asset against its source reference and checksum, with explicit missing-file accounting.
3. Preserve original authors and dates without impersonating the original users; retain reply threading in the UI.
4. Implement the reviewed, idempotent production commit/reconciliation path, including archived-inclusive signed readback, unique source mapping, rollback, integrity and concurrency acceptance.
5. Obtain the applicable approval for historical production-data writes before executing any backfill.

No production roles, RBAC/RLS, grants, credentials, schema, records or unrelated frontend behavior changed.

**Closeout:** Staging contract IMPLEMENTED/VERIFIED locally. Source subitem and asset provenance BLOCKED. Production migration NOT EXECUTED. Continue CP-TB-NATIVE-01L for authoritative missing source retrieval and reviewed production activation contract.
