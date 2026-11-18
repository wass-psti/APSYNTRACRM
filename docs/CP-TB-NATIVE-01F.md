# CP-TB-NATIVE-01F — Genuine signed backend CRUD, subitem provenance and migration gate

## Execution evidence — 2026-11-18

### Verified live signed-user backend lifecycle

- Used an existing authenticated APSYNTRA CRM Brave browser session. A fresh frontend AuthClient restore verified the genuine session and resolved existing Main Workspace ID 00000000-0000-4000-8000-000000000001. All mutations used existing DomainApi.rpc signed-user requests, not service-role, administrative SQL, or fabricated principals.
- The workspace signed active Toolbox list initially returned 0; separate read-only database inspection confirmed both preexisting issue records (1, 2) were archived.
- Created disposable issue 3 with a unique CP-TB-NATIVE-01F test label; independently retrieved name and version through toolbox_issues_get_issue.
- Versioned status update to Stuck: signed independent readback PASS.
- Discussion update creation: signed independent post-ID/text readback PASS.
- Subtask 2 creation under issue 3: signed parent detail readback PASS.
- Subtask status transition to Done: signed parent detail readback PASS.
- Deleted disposable subtask 2; verified it was absent from parent detail.
- Archived disposable issue 3; verified it was absent from signed active issue list.
- Read-only database verification after test: issue 3 archived=true, version=7, remaining subitems=0.
- Seven acceptance steps passed. This proves signed backend domain operations, not undeployed native TalkBox frontend or cross-reload browser UX.

### Provenance and migration

- CP-TB-NATIVE-01E private authenticated source workbook remains outside repository, SHA-256 fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a: 87 distinct issue IDs, 1,129 distinct discussion post IDs, and no source update references outside those issues.
- The workbook item Subitems column contains null for all 87 issues and no independent source subitem ID worksheet. This does not prove that the legacy subitem board is empty.
- Direct authenticated navigation to wa-psti.monday.com/boards/18371220520 redirected to the parent board 18370784140; subitem board provenance remains unresolved. CRM historical subitem projection uses 18370784141 and must not be silently equated with reported source board 18371220520.
- Read-only destination snapshot: 2 original archived CRM issue rows with no authoritative monday source IDs; the disposable test issue is separately archived. Neither original record was overwritten.
- Actual legacy migration/retrofitting source identities is NOT executed here. A controlled plan must preserve original records, validate unique source mapping and parent provenance, enforce idempotency/restart behavior, and obtain applicable production-data write approval before altering authentic records.

### Focused implementation and local verification

- reconcileTalkBoxSubitemIdentities can now accept optional authoritative sourceIssueIds and BLOCKS missing parent source identities from a complete parent snapshot.
- Added regression: unknown parent source ID fails rather than yielding MATCHED; a valid parent still matches.
- Local TalkBox tests: 15/15 PASS (new test demonstrated a failure before fix).
- Local production Vite build: PASS; git diff --check: PASS.
- No RBAC/RLS, roles, grants, workspace isolation, session handling or database schema changed.

### Remaining acceptance

1. Verify native TalkBox UI in a genuine authenticated deployed/preview browser, including refresh/history, beyond backend RPC acceptance.
2. Independently establish source subitem board and complete parent identity relationships, or substantiate that no historical subitems exist.
3. Complete a non-destructive migration mapping with explicit production-write scope/approval, then perform independent signed readback and idempotency verification.
4. Finish required CI checks and PR chain, approved merge and production deployment/regression evidence before declaring operational activation.
