# CP-TB-NATIVE-01G — Source Audit Repeatability and Native UI Acceptance

Date: 2026-11-18. Branch: feature/cp-tb-native-01g, derived from CP-TB-NATIVE-01F.

## Current outcome

- Authenticated original monday board 18370784140 source workbook is preserved privately on Mac; SHA-256 fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a.
- Added dependency-free, read-only source identity audit: scripts/talkbox-source-audit.py. It does not print issue titles, discussion text, email or personal information, does not publish the workbook, and does not perform CRM writes.
- Source audit PASS: 87 source issues and 87 unique issue IDs; 1,129 discussion posts and 1,129 unique post IDs; every update has a known parent source issue. Statuses: 66 Done, 12 Working on it, 9 Stuck. Subitem source identity evidence explicitly marked NOT_ESTABLISHED.
- Incomplete-count negative control: requesting expected count 88 against the authentic 87-record workbook correctly produced source_count_mismatch and exit code 2.
- Original board's reported subitem board 18371220520 previously redirected back to 18370784140; the workbook has no independent authoritative subitem ID sheet. Do not assume there are zero historical subitems or that CRM board 18370784141 has the same provenance.
- Authenticated production CRM browser: navigating temporarily to #/talkbox did not render the native TalkBox application container. The prior route was restored to avoid a persistent UI change.
- Genuine signed backend CRUD acceptance remains VERIFIED from CP-TB-NATIVE-01F: 7/7 disposable issue/subtask/update actions, including cleanup. Production native UI acceptance is not equivalent and remains FAILED/PENDING.
- Existing TalkBox PR chain #531, #532, #533, #535, #537 is unmerged/draft. Do not deploy or alter production issue history until provenance, approved write scope and acceptance checks pass.
- No new RBAC/RLS, role/permissions, Supabase schema or account changes made.

## Evidence checks

- Python compile: PASS
- Authenticated export preflight: PASS (expected source count 87)
- Count-mismatch rejection: PASS (expected source count 88; exit 2)
- Focused TalkBox JS tests: 15/15 PASS
- Vite production build: PASS
- Native UI signed browser: FAIL (not deployed)
- Complete subitem provenance: BLOCKED
- Controlled historical import: BLOCKED (do not overwrite or merge the two preexisting archived CRM issues)

## Reproducible non-mutating action

Run from repository root:

python3 scripts/talkbox-source-audit.py "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01E-authenticated-source.xlsx" --expected-count 87

Only aggregate checks and the workbook hash are returned. The source file stays outside Git.

## Next release gate

1. Establish complete independent monday subitem identities and parent relationships or verified absence.
2. Obtain a deployable signed native UI preview; execute route/open/edit/post/subtask/refresh/history acceptance.
3. Design and validate restart-safe idempotent historical import with explicit data-write authorization and no title-based joining. Preserve original archived CRM records.
4. Run required CI checks, merge PR stack under branch rules, deploy, verify production readback and only then sign off.
