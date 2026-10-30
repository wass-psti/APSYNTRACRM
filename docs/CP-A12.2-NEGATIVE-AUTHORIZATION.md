# CP-A12.2 — Signed Negative Authorization and Workspace Isolation

**Date:** October 30, 2026 (Asia/Manila)  
**Implementation:** Deployed to APSYNTRA CRM GitHub Pages  
**Certification:** **FINAL SIGNED NEGATIVE ACCEPTANCE PENDING**  
**Acceptance UI:** https://wass-psti.github.io/APSYNTRACRM/#/security  
**Approved architecture:** 12 embedded application modules → 12 dedicated boards → unified TypeScript contracts → existing Supabase Auth/authorized Work Management RPCs → one PostgreSQL and Storage system.

## 1. Scope and architecture boundary

CP-A12.1 **remains ACCEPTED**: all twelve existing boards passed signed CRUD/conditional-update/audit checks; independent PostgreSQL event reconciliation verified 14 complete QA lifecycles and no leftover items. The successful run's gateway audit confirmed 24 HTTP 204 writes and 12 HTTP 409 expected stale conflicts.

CP-A12.2 is a **separate authorization milestone**, not another application CRUD test. It verifies that signed users who are not authorized cannot list, view, edit, manage, or read audit events for the twelve known actual board IDs, and that an unauthorized create attempt against the isolated nonproduction QA board is rejected without changing records. **No application-level acceptance is included.**

Existing application accounts and memberships are preserved. No role spoofing, fabricated JWT, user impersonation, new test account, workspace switch, production write, or database schema change.

## 2. Real resource scope

All twelve target IDs in `frontend/board-security-targets.js` were independently confirmed in the existing PostgreSQL registry in workspace `00000000-0000-4000-8000-000000000001` (Work Management). Each is a dedicated module board, with correct versioned marker and eight typed columns.

The secondary existing workspace `FRT-ACCEPTANCE-QA-v0.5.0` has no boards. **A separate target board is not needed:** to test isolation, a genuinely authenticated user whose authoritative `wm_auth_access_context.workspace_id` differs from Work Management requests the twelve *existing* primary-workspace boards. A fabricated UUID is never used as the target.

The optional write-denial challenge is limited to the existing empty, isolated **APSYNTRA QA** board in the primary workspace (confirmed board UUID `098b6797-0bf7-407b-8802-bd8a00c606f6`; group `6eaf3d6e-f9a1-4f32-85cd-d05b383fe27f`). This is not one of the twelve domain boards. If the QA board is removed or changes, update the verified fixture before testing. An unexpectedly authorized create is marked FAIL and subject to best-effort cleanup of its own unique QA record.

## 3. Existing authority verified by read-only SQL

- `work_board_access(board_id,required)`: rejects missing/inactive identity and missing boards, verifies the **server-authoritative active workspace against the board workspace first**, then applies platform-admin or membership permissions. Required operations `view`, `edit`, `manage` have explicit predicates.
- `wm_get_board`: raises SQLSTATE `42501` for unauthorized views, normally HTTP 403 for a signed user.
- `wm_list_board_events`: returns an **empty array** for unauthorized board access; it does not raise 403. The negative acceptance checks that exact behavior.
- `wm_list_boards`: returns only current-workspace boards with platform administrator/membership access. The canonical target must be absent for a denied user.
- `wm_add_board_item`: checks `work_board_access(...,'edit')` before its insert and again under the existing transaction advisory lock; raises `42501` if not authorized.
- Anonymous EXECUTE privileges for the Work Management board RPCs are denied. Authenticated EXECUTE grants do **not** imply authorization: these existing SECURITY DEFINER functions enforce identity/workspace/board checks internally.
- The Work Management board tables have RLS and do not grant direct table SELECT to the anonymous or ordinary authenticated API roles. No policies, grants or identities were changed in CP-A12.2.

**This is a verified policy and configuration review, not a substitute for signed runtime denial.**

## 4. Signed acceptance scenarios

| Gate | Eligible actual user | Expected results | Current live evidence |
| --- | --- | --- | --- |
| A: unassigned nonadministrator in Work Management | Existing active employee/HR with no membership on any target board | 12/12 × six read-only denials (list absence, view/edit/manage false, details HTTP 403, audit empty) | **PENDING genuine session** |
| B: cross-workspace isolation | Existing active signed account whose authoritative current workspace is **not** Work Management | Same 12/12 × six negative checks against real Work Management board IDs | **PENDING genuine session** |
| C: negative create, nonadministrator | The same eligible Gate A session after its 12/12 read-only PASS | One explicit `wm_add_board_item` attempt on isolated QA board returns HTTP 403, SQLSTATE `42501` | **PENDING genuine session** |
| D: negative create, cross-workspace | The same eligible Gate B session after its 12/12 read-only PASS | Same explicit denied create on QA board in other workspace | **PENDING genuine session** |

A current Work Management platform administrator is **ineligible** for Gate A. The app must render `NOT ELIGIBLE` rather than fake a PASS.

Signed tests use the existing Supabase Auth bearer in the browser. The API independently verifies the user through `/auth/v1/user` and obtains workspace context from `wm_auth_access_context`. No access-token copy or Terminal is needed.

Read-only checks are made before any optional QA negative write, and the runner **stops at the first unexpected privilege or visibility result** to avoid retrieving unauthorized content. Reports contain no user IDs, emails, JWTs, passwords or precise location information. A copyable nonsecret JSON summary supports external review without leaking credentials.

## 5. Execution and operational safeguards

1. Open `https://wass-psti.github.io/APSYNTRACRM/#/security` in the signed-in APSYNTRA CRM frontend.
2. For Gate A, use an existing legitimately accessible nonadministrator Work Management account with no membership in the twelve boards. Select **Run read-only signed negative checks**. A signed 12/12 PASS is required.
3. Then select **Verify denied QA write**, enter `VERIFY DENIAL` to confirm the optional isolated QA check. Record the HTTP 403 / `42501` result. If it fails, STOP and independently inspect QA cleanup.
4. Separately, for Gate B use a genuine existing account whose active server workspace is different from Work Management. If all relevant existing accounts still resolve to Work Management, Gate B is BLOCKED; do not fabricate a second-workspace session or alter memberships silently.
5. Repeat the read-only and QA negative-write checks only for that **different real scenario**, not to re-verify already accepted positive CRUD.
6. The user may copy the anonymized report from each session. An independent read-only SQL check must still confirm no new QA item and no changes to the domain boards after the signed trials.

## 6. Current status and next gate

- **CP-A12.2 implementation and automated tests:** completed for the scoped read-only denied-access and optional QA write-denial workflows, subject to actual CI verification for the latest commit.
- **Independent SQL security policy/grant inspection:** completed.
- **Signed Gate A/B/C/D:** unexecuted as of this baseline; do not claim success from unit tests.
- **Phase A overall acceptance groups:** 4/5 completed = **80%**. CP-A12.1's twelve-board positive operations remain accepted at 12/12; CP-A12.2 negative-role/workspace certification remains outstanding.
- **Phase B** embedded application modules, field-level GPS/HR/finance authorization, atomic source-to-board lineage/idempotency, actual application synchronization and Phase C/D production readiness remain explicitly separate.

**No extra accounts, service keys, new backend, database, or local Vite host were introduced.**
