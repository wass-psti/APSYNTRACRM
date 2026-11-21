# CP-TB-FUNCTIONAL-CLOSEOUT-01 — Functional Audit and Recovery Acceptance

Date: 2026-11-21 (Asia/Manila). Existing APSYNTRA CRM native TalkBox and existing production Supabase project only.

## Scope audited

- Frontend: TalkBox application routing and issue drawer in `frontend/app.js`, signed native API client, issue list/search/filter/pagination, issue and subtask CRUD, assignees, discussion/replies, PostgreSQL timer, private file upload/download/cleanup, and UI rendering.
- Backend contract: signed `toolbox_issues_*` RPCs, optimistic versioning, workspace-scoped reads, private Storage lifecycle and already-installed server capabilities. No role, RLS, membership, schema or domain authorization changes.
- Production read-only signed acceptance: existing owner's signed session returned one active issue, QA issue #5 at version 14, five persisted updates, a stopped PostgreSQL timer, zero active attachments, zero pending attachment cleanups, and enabled threaded reply/attachment-removal/server-timer capabilities. The live issue view displayed the QA record, historical correction update and stopped-timer control after data loaded. No production QA data writes were made.

## Reproduced functional recovery defect and fix

When a selected issue is archived/deleted elsewhere, a fresh `toolbox_issues_get_issue` 404 previously failed the entire `loadTalkBox()` request even when the signed issue list had loaded successfully. Similarly, clicking a stale item could preserve an outdated drawer selection and show a generic error. This is a functional persistence/recovery issue, not a permission defect.

- `TalkBoxNativeClient.getIfAvailable()` returns `null` **only** for an independently observed 404 (missing/archived selection). All other errors, including 401, 403, 409, transport failures and 5xx, still propagate unchanged.
- `loadTalkBox` now keeps the authoritative signed issue list and clears the stale drawer selection on 404 instead of dropping the whole list.
- `openTalkBoxIssue` clears the stale selection and shows a refresh instruction when that selected item no longer exists.
- Three focused regression checks cover selected-issue 404 recovery, other errors remaining visible, and both frontend integration paths. No change to database permissions, retry loops, caching, or unrelated modules.

## Verification

- Focused TalkBox: **66/66 PASS**.
- Full frontend: **3170/3170 PASS**.
- `npm run build`, `npm run lint`, `npm run format:check`, Node syntax checks and `git diff --check`: **PASS**.
- Existing bundler chunk-size advisory is unchanged.
- No new dependencies, deployment changes, role assignments, RLS policies, test-user creation, or production data mutation.

## Acceptance limitations

- Read-only production checks validate the *previously deployed* TalkBox contract; they do not prove the new frontend recovery branch until this commit is deployed and a legitimate disappearing-issue scenario is observed. Do not delete or archive operational records merely to force that scenario.
- Workflow test suites cover issue CRUD, status/date changes, assignees, threaded replies, subtask lifecycle, timer operations and attachment integrity through mocked signed RPCs; these tests are not substitutes for fresh genuine multi-user production actor attribution.
- Independent two-user collaboration acceptance remains a **separate optional QA gate**, not a blocker for functional defect fixes and not tied to a specific employee's account. Do not grant roles, change login credentials, or produce more docs-only milestones to chase it.

## Final status

**IMPLEMENTED and locally VERIFIED.** Live production read-only contract verified. New recovery path remains **DEPLOYMENT/RUNTIME-UNVERIFIED** until production Pages publishes the merged source and normal missing-selection recovery can be observed safely. If a real regression occurs, focus the next checkpoint on the specific failed workflow rather than auth/user-specific setup.
