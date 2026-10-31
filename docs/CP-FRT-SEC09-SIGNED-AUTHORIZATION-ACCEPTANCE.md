# CP-FRT-SEC09 — Genuine Signed-User Authorization Acceptance

**Date:** October 31, 2026 (Asia/Manila)  
**Base:** APSYNTRA CRM `main` commit `deda2948387e462a4b7084f6523a4fdba3f26f36`  
**Purpose:** Collect genuine read-only signed-session acceptance against the activated CRM platform-role backend without altering legitimate users, FRT workflows, financial records, application assignments, board memberships or audit rows.

## Real production preflight (connected backend, read-only)

The production Supabase project `jtlusodorfnyzgyuewkz` reports:

- Both CP-FRT-SEC08 migrations installed.
- `apsyntra_crm_platform_roles` exists, and `apsyntra_crm_platform_role_snapshot` and `apsyntra_crm_platform_role_set` functions exist.
- CRM platform-role **explicit overrides: 0**.
- Central module assignments **121**, legitimate FRT memberships **3**, protected bootstrap identities **2**, board memberships **75**, central role-change audit events **0**.
- Original `apsyntra_role_require_scope` delegates to the protected signed `apsyntra_role_is_bootstrap`, matches `auth.uid()` to active `workspace_members`, and checks the current workspace. Neither `anon` nor `authenticated` receives direct CRM role table access.
- `apsyntra_crm_platform_role_snapshot` and setter require the central bootstrap guard. Function EXECUTE is exposed to `authenticated` only to allow that guarded RPC to enforce authorization per user. This is an intentional, sensitive entry point that needs real signed denial evidence.
- No current CRM explicit override exists, so **full platform-level role change and fresh-session cap enforcement cannot be asserted from this read-only evidence**.

## Implementation on this branch

`frontend/frt-sec09-signed-acceptance.js` composes the existing CP-FRT-SEC03 and CP-FRT-SEC07 signed runners. It does not copy credentials or prompt for test accounts. The one-click `#/security` action:

1. Retrieves and verifies the current user from the existing Supabase Auth identity service and the existing active workspace context.
2. Runs CP-FRT-SEC03 central FRT role governance and legacy-admin-denial checks with the current signed session.
3. Runs CP-FRT-SEC07 CRM platform-role snapshot integrity, workspace isolation, protected-administrator read and nonbootstrap-denial checks with the same session.
4. Validates the signed user and workspace **again** after both requests, and rechecks the bootstrap classification to prevent session/workspace switching during an acceptance run.
5. Requires both source reports to be `PASS`, the same `BOOTSTRAP` or `NONBOOTSTRAP` scenario, all source checks `PASS`, stable identity/workspace, and exactly zero writes.
6. Exposes a sanitized copied JSON report with only checkpoint IDs, scenarios, check names, PASS/FAIL/BLOCKED statuses, documented failure reason codes, and actual write counters. No auth tokens, account identifiers, names, emails or raw server responses.
7. Invalidates pending runner results if the user logs out, signs in, changes workspace/identity or loses the session.

**Important:** This is the joined **read-only signed-user baseline**. It does not verify that platform Viewer can edit nothing after an actual role change, or that a cached JWT becomes ineffective after an administrator revokes roles. Those tests require explicitly authorized nonproduction role changes and actual operational requests. It also does not establish 12-board native-host acceptance.

## Verified source integration

GitHub Actions [run #41155639842](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41155639842) passed the full frontend regression suite, including the paired SEC09 positive/negative acceptance fixtures, malicious response sanitization, logout invalidation and identity drift checks. The independent disposable PostgreSQL 17 authorization test job also passed. This CI tested source contracts and isolated SQL behavior; it **did not access either real signed user session** or modify production.

## Genuine signed-user procedure

Use the deployed APSYNTRA CRM `https://wass-psti.github.io/APSYNTRACRM/#/security` after this frontend is merged and Pages deployment succeeds.

- **Bootstrap:** Sign in using an existing bootstrap administrator, select **Run CP-FRT-SEC09 signed acceptance**, then **Copy nonsecret SEC09 result**. Require `status: PASS`, `scenario: BOOTSTRAP`, **5/5** combined checks PASS, both source reports PASS, and `writesAttempted: 0`.
- **Nonbootstrap:** Sign out, sign in as an existing legitimate nonbootstrap user, repeat the same action. Require `status: PASS`, `scenario: NONBOOTSTRAP`, **5/5** combined checks PASS, both sources PASS, and zero writes.
- Paste **only** the copied nonsecret JSON to the acceptance conversation. Never share access tokens, passwords, refresh tokens, account IDs or internal finance records.
- If either report is FAIL or BLOCKED, do not certify. Investigate the error under the existing backend and rerun only the affected case after a corrective change. A missing RPC / HTTP 404 cannot be counted as a successful denial.

## Strict evidence classification

| Gate | Classification |
| --- | --- |
| CP-FRT-SEC08 live production migrations, role table and function guards | VERIFIED via connected PostgreSQL read-only checks |
| Historical CP-FRT-SEC03 signed checks (7/7 bootstrap, 5/5 nonbootstrap) | VERIFIED from earlier operator-submitted results; **predate** SEC08 backend activation |
| CP-FRT-SEC09 source implementation and mocked positive/negative contracts | VERIFIED in successful frontend CI and disposable PostgreSQL 17 checks; no genuine signed-user acceptance implied |
| CP-FRT-SEC09 live signed bootstrap test | PENDING operator-provided browser evidence |
| CP-FRT-SEC09 live signed nonbootstrap test | PENDING operator-provided browser evidence |
| Bootstrap setter mutation / revision / correlated audit | PENDING scoped nonproduction approval and genuine signed role transaction |
| Role ceiling after a new signed session, revocation and FRT domain write guards | PENDING real controlled runtime |
| Cross-workspace signed isolation on two legitimate workspaces | BLOCKED: only one workspace currently has active members |
| Canonical local native board-host `http://127.0.0.1:5173/#/` and `/api/v1/boards` | BLOCKED: host not accessible from current connected environment |
| Production-wide certification / native 12-app integration | PENDING |

## Acceptance and release boundary

- Preserve all 39 active workspace members, current roles, sessions, module/board assignments and FRT records.
- No test users, fake workspace memberships, second Auth systems, or production role modifications are authorized for this read-only acceptance.
- Passing a **mocked CI test** demonstrates correct test harness behavior, not a real signed-user acceptance.
- The currently connected browser cannot be accessed through the connector from this chat; therefore signed-user acceptance cannot be claimed until genuine results are submitted.
- Merge and deployment require independent approval where mandated by repository rules. Do not auto-merge this branch or change production RBAC policies.
