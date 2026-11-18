# CP-TB-NATIVE-01D — Authenticated source inspection and count reconciliation

## Evidence (2026-11-18)
- The existing MacBook Brave browser was signed in to the original monday TalkBox board 18370784140.
- Navigating to its Main table displayed an **87 Items** count. This verifies the visible board count, **not** the completeness of any exported issue-ID snapshot.
- The board page did not expose a complete item-ID list to the inspected page DOM. No issue IDs, discussions, relationships, or history were fabricated or migrated.
- Full source export and subitem provenance for board 18371220520 remain unavailable; the existing CRM projection uses a different subitem board identifier and must not be equated by guesswork.
- The existing native TalkBox PRs remain draft and unmerged. Live native signed-user CRUD acceptance and production activation are pending.

## Focused implementation
- The issue reconciliation planner now accepts optional expectedSourceCount from an independently observed authoritative source.
- A mismatched actual unique source-ID count returns BLOCKED, even when callers incorrectly assert both sources as complete.
- Invalid expected counts are rejected, and source-data checks remain read-only.
- New regression reproduces an incorrect prior MATCHED result for a one-record snapshot with expected count 87.

## Local verification
- Before fix: regression failed (MATCHED rather than BLOCKED).
- After fix: focused tests 13/13 passed; npm production build passed; git diff --check passed.
- No credentials, auth/RLS, schema, database or production records modified.

## Acceptance remaining
1. Authorized full monday.com issue and subitem export containing stable IDs and parent relationships.
2. Read-only complete mapping report, including duplicate/missing/source-only/destination-only/conflicted records.
3. Disposable signed-user CRUD acceptance and independent persisted readback.
4. Final browser regression, branch CI, protected merge, production activation and runtime signoff.
